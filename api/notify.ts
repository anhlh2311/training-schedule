import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Firestore } from "firebase-admin/firestore";
import admin from "firebase-admin";

/** Firestore `in` query supports max 30 values. */
const ONESIGNAL_FIRESTORE_IN_LIMIT = 30;
const ONESIGNAL_NOTIFICATIONS_ENDPOINT = "https://api.onesignal.com/notifications";

/** Exported for `process-batch`; lives here so Vercel bundles it with `/api/notify`. */
export async function getPushSubscriptionIdsFromDb(
  db: Firestore,
  trainerUids: string[],
  excludeUserId?: string
): Promise<string[]> {
  if (trainerUids.length === 0) return [];

  const ids: string[] = [];
  for (let i = 0; i < trainerUids.length; i += ONESIGNAL_FIRESTORE_IN_LIMIT) {
    const batch = trainerUids.slice(i, i + ONESIGNAL_FIRESTORE_IN_LIMIT);
    const snap = await db
      .collection("oneSignalSubscriptions")
      .where("userId", "in", batch)
      .get();

    for (const doc of snap.docs) {
      const data = doc.data();
      const userId = data.userId as string | undefined;
      if (userId && userId !== excludeUserId) {
        ids.push(doc.id);
      }
    }
  }
  return ids;
}

export interface OneSignalSendResult {
  sent: number;
  error?: string;
  requestPayload: object;
  response: { status: number; body: unknown };
}

/** Either pass IDs (e.g. cron) or resolve them from Firestore (e.g. `/api/notify`). */
export type OneSignalSubscriptionSource =
  | { subscriptionIds: string[] }
  | { db: Firestore; trainerUids: string[]; excludeUserId?: string };

async function fetchOneSignal(
  restApiKey: string,
  payload: object
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(ONESIGNAL_NOTIFICATIONS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${restApiKey}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? (JSON.parse(text) as unknown) : {};
  } catch {
    body = text || {};
  }
  return { ok: res.ok, status: res.status, body };
}

/** Send via OneSignal REST API: shared payload build + `fetchOneSignal`. */
export async function sendOneSignalNotification(
  appId: string,
  restApiKey: string,
  title: string,
  messageBody: string,
  source: OneSignalSubscriptionSource
): Promise<OneSignalSendResult> {
  const subscriptionIds =
    "subscriptionIds" in source
      ? source.subscriptionIds
      : await getPushSubscriptionIdsFromDb(
          source.db,
          source.trainerUids,
          source.excludeUserId
        );

  if (subscriptionIds.length === 0) {
    return {
      sent: 0,
      requestPayload: { app_id: appId, subscriptionIds: [] },
      response: { status: 200, body: { recipients: 0 } },
    };
  }

  const requestPayload = {
    app_id: appId,
    include_subscription_ids: subscriptionIds,
    headings: { en: title },
    contents: { en: messageBody },
    data: { url: "/" },
  };
  const { ok, status, body: responseBody } = await fetchOneSignal(
    restApiKey,
    requestPayload
  );

  const result: OneSignalSendResult = {
    sent: ok ? ((responseBody as { recipients?: number }).recipients ?? 0) : 0,
    requestPayload,
    response: { status, body: responseBody },
  };

  if (!ok) {
    result.error = `OneSignal API ${status}: ${JSON.stringify(responseBody)}`;
  }

  return result;
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

/** When true, include debug info (payloadSummary, formatted, onesignal request/response) in API responses. */
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

interface OneSignalDebug {
  requestPayload: object;
  response: { status: number; body: unknown };
}

function buildDebugInfo(
  body: NotifyBody,
  type: NotifyType,
  senderId: string,
  trainerUids: string[],
  formatted: { title: string; body: string },
  onesignal?: OneSignalDebug
) {
  const d: {
    type: NotifyType;
    payloadSummary: {
      senderId: string;
      trainerUids: string[];
      eventTitle?: string;
      eventStartTime?: string;
      eventStartTimeFormatted?: string;
      dropOffReason?: string;
    };
    formatted: { title: string; body: string };
    onesignal?: OneSignalDebug;
  } = {
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
  if (onesignal) d.onesignal = onesignal;
  return d;
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

    const onesignalAppId = process.env.ONESIGNAL_APP_ID;
    const onesignalRestApiKey = process.env.ONESIGNAL_REST_API_KEY;
    if (onesignalAppId && onesignalRestApiKey && trainerUids.length > 0) {
      const onesignalResult = await sendOneSignalNotification(
        onesignalAppId,
        onesignalRestApiKey,
        title,
        messageBody,
        { db, trainerUids, excludeUserId: userId }
      );
      const osDbg: OneSignalDebug = {
        requestPayload: onesignalResult.requestPayload,
        response: onesignalResult.response,
      };
      const dbg = () =>
        Object.assign(buildDebugInfo(body, type, userId, trainerUids, formatted, osDbg), {
          trainerCount: trainerUids.length,
        });
      if (onesignalResult.error) {
        console.error("[api/notify] OneSignal error:", onesignalResult.error);
        const errorResponse: { error: string; detail: string; debug?: object } = {
          error: "OneSignal notification failed",
          detail: onesignalResult.error,
        };
        if (NOTIFY_DEBUG) errorResponse.debug = dbg();
        safeJson(res, 500, errorResponse);
        return;
      }
      const successResponse: { sent: number; provider: string; debug?: object } = {
        sent: onesignalResult.sent,
        provider: "onesignal",
      };
      if (NOTIFY_DEBUG) successResponse.debug = dbg();
      safeJson(res, 200, successResponse);
      return;
    }

    const tokens = await getFcmTokensForUsers(db, trainerUids);
    if (tokens.length === 0) {
      const response: { sent: number; debug?: object } = { sent: 0 };
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
    const fcmResponse: { sent: number; failed?: number; debug?: object } = {
      sent: result.successCount,
      failed: result.failureCount,
    };
    if (NOTIFY_DEBUG) {
      fcmResponse.debug = Object.assign(
        buildDebugInfo(body, type, userId, trainerUids, formatted),
        { trainerCount: trainerUids.length, tokenCount: tokens.length }
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

async function getFcmTokensForUsers(
  db: Firestore,
  uids: string[]
): Promise<string[]> {
  const tokens: string[] = [];
  for (const uid of uids) {
    const snap = await db.collection("users").doc(uid).collection("fcmTokens").get();
    for (const d of snap.docs) {
      const t = d.data().token;
      if (typeof t === "string") tokens.push(t);
    }
  }
  return tokens;
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
