import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Firestore } from "firebase-admin/firestore";
import { getFirestore, getMessaging } from "../lib/firebase-admin";

const CRON_SECRET = process.env.CRON_SECRET;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization;
  const isCron = req.headers["x-vercel-cron"] === "1";
  const hasSecret = CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`;
  if (!isCron && !hasSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const db = getFirestore();
  const now = new Date();
  const snapshot = await db
    .collection("notificationQueue")
    .where("deliverAt", "<=", now)
    .get();

  if (snapshot.empty) {
    return res.status(200).json({ processed: 0 });
  }

  const byWindow = new Map<
    string,
    { type: string; actorIds: Set<string>; docIds: string[] }
  >();
  for (const doc of snapshot.docs) {
    const d = doc.data();
    const key = (d.windowKey as string) || doc.id;
    if (!byWindow.has(key)) {
      byWindow.set(key, {
        type: (d.type as string) || "availability_added",
        actorIds: new Set(),
        docIds: [],
      });
    }
    const entry = byWindow.get(key)!;
    if (d.actorId) entry.actorIds.add(d.actorId as string);
    entry.docIds.push(doc.id);
  }

  const trainerUids = await getTrainerUids(db, new Set());
  const tokens = await getFcmTokensForUsers(db, trainerUids);
  const batch = db.batch();
  let sent = 0;

  for (const [, entry] of byWindow) {
    const count = entry.docIds.length;
    const title = "Training Schedule";
    const body =
      count === 1
        ? "1 update from a trainer."
        : `${count} availability/event updates.`;
    if (tokens.length > 0) {
      const messaging = getMessaging();
      const result = await messaging.sendEachForMulticast({
        notification: { title, body },
        data: { type: entry.type, url: "/" },
        tokens,
      });
      sent += result.successCount;
    }
    for (const id of entry.docIds) {
      batch.delete(db.collection("notificationQueue").doc(id));
    }
  }

  await batch.commit();
  return res.status(200).json({ processed: snapshot.size, sent });
}

async function getTrainerUids(
  db: Firestore,
  _exclude: Set<string>
): Promise<string[]> {
  const snap = await db
    .collection("users")
    .where("role", "in", ["trainer", "admin"])
    .get();
  return snap.docs.map((d) => d.id);
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
