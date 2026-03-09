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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization;
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  let decodedToken: { uid: string };
  try {
    decodedToken = await getAuth().verifyIdToken(idToken);
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }

  const body = req.body as NotifyBody;
  const { type, userId, userName, eventStartTime } = body;
  if (!type || !userId || userId !== decodedToken.uid) {
    return res.status(400).json({ error: "Invalid body: type and userId required, userId must match token" });
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
    return res.status(202).json({ queued: true, deliverAt: deliverAt.toISOString() });
  }

  const trainerUids = await getTrainerUids(db, userId);
  const tokens = await getFcmTokensForUsers(db, trainerUids);
  if (tokens.length === 0) {
    return res.status(200).json({ sent: 0 });
  }

  const { title, body: messageBody } = formatMessage(type, userName ?? "A trainer");
  const messaging = getMessaging();
  const message = {
    notification: { title, body: messageBody },
    data: { type, url: "/" },
    tokens,
  };

  const result = await messaging.sendEachForMulticast(message);
  return res.status(200).json({ sent: result.successCount, failed: result.failureCount });
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
