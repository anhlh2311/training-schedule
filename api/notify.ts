import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Firestore } from "firebase-admin/firestore";
import admin from "firebase-admin";

/** Shared with [api/cron/process-batch.ts](api/cron/process-batch.ts) — keep in this file so Vercel bundles it (no extra `server/` path on disk). */
export interface FcmTokenEntry {
  token: string;
  path: string;
}

export async function getFcmTokenEntries(
  db: Firestore,
  uids: string[]
): Promise<FcmTokenEntry[]> {
  const entries: FcmTokenEntry[] = [];
  for (const uid of uids) {
    const snap = await db.collection("users").doc(uid).collection("fcmTokens").get();
    for (const d of snap.docs) {
      const t = d.data().token;
      if (typeof t === "string" && t.trim().length > 0) {
        entries.push({ token: t, path: d.ref.path });
      }
    }
  }
  return entries;
}

const FCM_PRUNE_ERROR_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

export async function removeDeadFcmTokensAfterSend(
  db: Firestore,
  entries: FcmTokenEntry[],
  responses: Array<{ success: boolean; error?: { code?: string } }>
): Promise<number> {
  const paths: string[] = [];
  for (let i = 0; i < responses.length; i++) {
    const r = responses[i];
    if (r.success) continue;
    const code = r.error?.code;
    if (!code || !FCM_PRUNE_ERROR_CODES.has(code)) continue;
    const path = entries[i]?.path;
    if (path) paths.push(path);
  }
  if (paths.length === 0) return 0;

  let batch = db.batch();
  let ops = 0;
  let total = 0;
  for (const path of paths) {
    batch.delete(db.doc(path));
    ops++;
    total++;
    if (ops >= 450) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  return total;
}

function getFirebaseAdmin() {
  // guard in case apps is undefined
  if (Array.isArray(admin.apps) && admin.apps.length > 0) return admin.app();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY ?? "";

  if (privateKey && !privateKey.includes("\n") && privateKey.includes("\\n")) {
    privateKey = privateKey.replace(/\\n/g, "\n");
  }

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY");
  }

  return admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
}

function getAuth() {
  return getFirebaseAdmin().auth();
}
function getFirestore() {
  return getFirebaseAdmin().firestore();
}
function getMessaging() {
  return getFirebaseAdmin().messaging();
}

const EVENT_SOON_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

/** When true, include debug info (payloadSummary, formatted, FCM counts) in API responses. */
const NOTIFY_DEBUG =
  process.env.NOTIFY_DEBUG === "true" || process.env.NOTIFY_DEBUG === "1";

type NotifyType =
  | "availability_added"
  | "availability_removed"
  | "event_subscribe"
  | "event_drop_off";

interface NotifyBody {
  type: NotifyType;
  userId: string;
  userName?: string;
  availabilityId?: string;
  eventId?: string;
  occurrenceId?: string;
  eventStartTime?: string; // ISO string
  /** Pre-formatted in client's timezone. Used in notification body when present. */
  eventStartTimeFormatted?: string;
  eventTitle?: string;
  dropOffReason?: string;
}

interface NotificationSettings {
  aggregationEnabled?: boolean;
  availabilityWindowMinutes?: number;
  eventSoonWindowMinutes?: number;
  eventSoonThresholdHours?: number;
}

function getDefaultSettings(): NotificationSettings {
  return {
    aggregationEnabled: false,
    availabilityWindowMinutes: 30,
    eventSoonWindowMinutes: 5,
    eventSoonThresholdHours: 2,
  };
}

function safeJson(res: VercelResponse, status: number, body: object): void {
  try {
    res.status(status).json(body);
  } catch {
    res.status(status).end(JSON.stringify(body));
  }
}

function buildDebugInfo(
  body: NotifyBody,
  type: NotifyType,
  senderId: string,
  trainerUids: string[],
  formatted: { title: string; body: string }
) {
  return {
    type,
    payloadSummary: {
      senderId,
      trainerUids,
      eventTitle: body.eventTitle,
      eventStartTime: body.eventStartTime,
      eventStartTimeFormatted: body.eventStartTimeFormatted,
      dropOffReason: body.dropOffReason != null ? "(present)" : undefined,
    },
    formatted: { title: formatted.title, body: formatted.body },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    safeJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const authHeader = req.headers.authorization;
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) {
      safeJson(res, 401, { error: "Missing Authorization header" });
      return;
    }

    let decodedToken: { uid: string };
    try {
      decodedToken = await getAuth().verifyIdToken(idToken);
    } catch (err) {
      console.error("[api/notify] verifyIdToken failed:", err);
      safeJson(res, 401, { error: "Invalid token" });
      return;
    }

    const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as NotifyBody;
    const { type, userId, userName, eventStartTime } = body;
    if (!type || !userId || userId !== decodedToken.uid) {
      safeJson(res, 400, { error: "Invalid body: type and userId required, userId must match token" });
      return;
    }

    const db = getFirestore();
    const settingsSnap = await db.doc("settings/notifications").get();
    const settings: NotificationSettings = settingsSnap.exists
      ? { ...getDefaultSettings(), ...settingsSnap.data() }
      : getDefaultSettings();

    const isEventSoon =
      (type === "event_subscribe" || type === "event_drop_off") &&
      eventStartTime &&
      Date.now() + EVENT_SOON_THRESHOLD_MS >= new Date(eventStartTime).getTime();

    if (settings.aggregationEnabled) {
      const now = Date.now();
      const windowMinutes = isEventSoon
        ? (settings.eventSoonWindowMinutes ?? 5)
        : (settings.availabilityWindowMinutes ?? 30);
      const deliverAt = new Date(now + windowMinutes * 60 * 1000);
      const windowKey =
        isEventSoon
          ? `event_soon:${Math.floor(now / (60 * 1000))}`
          : `availability:${Math.floor(now / (windowMinutes * 60 * 1000)) * windowMinutes}`;

      await db.collection("notificationQueue").add({
        type,
        payload: body,
        deliverAt: deliverAt,
        createdAt: new Date(),
        windowKey,
        actorId: userId,
      });
      const formatted = formatMessage(type, userName ?? "A trainer", body);
      const response: { queued: boolean; deliverAt: string; debug?: ReturnType<typeof buildDebugInfo> } = {
        queued: true,
        deliverAt: deliverAt.toISOString(),
      };
      if (NOTIFY_DEBUG) response.debug = buildDebugInfo(body, type, userId, [], formatted);
      safeJson(res, 202, response);
      return;
    }

    const trainerUids = await getTrainerUids(db, userId);
    const formatted = formatMessage(type, userName ?? "A trainer", body);
    const { title, body: messageBody } = formatted;

    const tokenEntries = await getFcmTokenEntries(db, trainerUids);
    const tokens = tokenEntries.map((e) => e.token);
    if (tokens.length === 0) {
      const response: { sent: number; provider: string; debug?: object } = {
        sent: 0,
        provider: "fcm",
      };
      if (NOTIFY_DEBUG) {
        response.debug = Object.assign(
          buildDebugInfo(body, type, userId, trainerUids, formatted),
          { trainerCount: trainerUids.length, tokenCount: 0 }
        );
      }
      safeJson(res, 200, response);
      return;
    }

    const messaging = getMessaging();
    const message = {
      notification: { title, body: messageBody },
      data: { type, url: "/" },
      tokens,
    };
    const result = await messaging.sendEachForMulticast(message);
    const pruned = await removeDeadFcmTokensAfterSend(db, tokenEntries, result.responses);
    if (pruned > 0) {
      console.info(`[api/notify] Removed ${pruned} dead fcmTokens document(s)`);
    }
    const fcmResponse: {
      sent: number;
      failed?: number;
      provider: string;
      debug?: object;
    } = {
      sent: result.successCount,
      failed: result.failureCount,
      provider: "fcm",
    };
    if (NOTIFY_DEBUG) {
      const perToken = result.responses.map((r, index) => ({
        index,
        success: r.success,
        error: r.error
          ? { code: r.error.code, message: r.error.message }
          : undefined,
      }));
      fcmResponse.debug = Object.assign(
        buildDebugInfo(body, type, userId, trainerUids, formatted),
        {
          trainerCount: trainerUids.length,
          tokenCount: tokens.length,
          fcmTokensPruned: pruned,
          fcmPerToken: perToken,
        }
      );
    }
    safeJson(res, 200, fcmResponse);
    return;
  } catch (err) {
    console.error("[api/notify] error:", err);
    const message = err instanceof Error ? err.message : String(err);
    safeJson(res, 500, {
      error: "Notification request failed",
      detail: message,
    });
    return;
  }
}

async function getTrainerUids(
  db: Firestore,
  excludeUid: string
): Promise<string[]> {
  const snap = await db
    .collection("users")
    .where("role", "in", ["trainer", "admin"])
    .get();
  return snap.docs
    .map((d) => d.id)
    .filter((id) => id !== excludeUid);
}

function formatMessage(
  type: NotifyType,
  userName: string,
  payload: NotifyBody
): { title: string; body: string } {
  const time =
    payload.eventStartTimeFormatted ??
    (payload.eventStartTime
      ? new Date(payload.eventStartTime).toLocaleString("en-US", {
          year: "numeric",
          month: "short",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          timeZoneName: "short",
        })
      : null);
  const eventLabel = payload.eventTitle || "an event";
  const timeSuffix = time ? ` at ${time}` : "";

  switch (type) {
    case "availability_added":
    case "availability_removed": {
      const action = type === "availability_added" ? "added" : "removed";
      return {
        title: "Availability updated",
        body: `${userName} ${action} availability.`,
      };
    }
    case "event_subscribe":
      return {
        title: "Event subscription",
        body: `${userName} joined ${eventLabel}${timeSuffix}.`,
      };
    case "event_drop_off":
      return {
        title: "Event drop-off",
        body: `${userName} dropped off from ${eventLabel}${timeSuffix}${
          payload.dropOffReason ? ` — Reason: ${payload.dropOffReason}` : ""
        }.`,
      };
    default:
      return { title: "[IHN Training Schedule]", body: "Update from a trainer." };
  }
}
