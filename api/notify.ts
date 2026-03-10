import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Firestore } from "firebase-admin/firestore";
import { getAuth, getFirestore, getMessaging } from "./lib/firebase-admin";

const EVENT_SOON_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

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
    } catch {
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
      safeJson(res, 202, { queued: true, deliverAt: deliverAt.toISOString() });
      return;
    }

    const trainerUids = await getTrainerUids(db, userId);
    const tokens = await getFcmTokensForUsers(db, trainerUids);
    if (tokens.length === 0) {
      safeJson(res, 200, { sent: 0 });
      return;
    }

    const { title, body: messageBody } = formatMessage(type, userName ?? "A trainer");
    const messaging = getMessaging();
    const message = {
      notification: { title, body: messageBody },
      data: { type, url: "/" },
      tokens,
    };

    const result = await messaging.sendEachForMulticast(message);
    safeJson(res, 200, { sent: result.successCount, failed: result.failureCount });
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
  userName: string
): { title: string; body: string } {
  switch (type) {
    case "availability_added":
      return {
        title: "Availability updated",
        body: `${userName} added availability.`,
      };
    case "availability_removed":
      return {
        title: "Availability updated",
        body: `${userName} removed availability.`,
      };
    case "event_subscribe":
      return {
        title: "Event subscription",
        body: `${userName} joined an event.`,
      };
    case "event_drop_off":
      return {
        title: "Event drop-off",
        body: `${userName} dropped off from an event.`,
      };
    default:
      return { title: "Training Schedule", body: "Update from a trainer." };
  }
}
