import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Firestore } from "firebase-admin/firestore";
import admin from "firebase-admin";
import {
  getFcmTokenEntries,
  removeDeadFcmTokensAfterSend,
} from "../lib/fcmTokens";

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

function getFirestore() {
  return getFirebaseAdmin().firestore();
}
function getMessaging() {
  return getFirebaseAdmin().messaging();
}

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

  const trainerUids = await getTrainerUids(db);
  const tokenEntries = await getFcmTokenEntries(db, trainerUids);
  const fcmTokens = tokenEntries.map((e) => e.token);
  const batch = db.batch();
  let sent = 0;

  for (const [, entry] of byWindow) {
    const count = entry.docIds.length;
    const title = "Training Schedule";
    const body =
      count === 1
        ? "1 update from a trainer."
        : `${count} availability/event updates.`;
    if (fcmTokens.length > 0) {
      const messaging = getMessaging();
      const result = await messaging.sendEachForMulticast({
        notification: { title, body },
        data: { type: entry.type, url: "/" },
        tokens: fcmTokens,
      });
      sent += result.successCount;
      const pruned = await removeDeadFcmTokensAfterSend(db, tokenEntries, result.responses);
      if (pruned > 0) {
        console.info(`[process-batch] Removed ${pruned} dead fcmTokens document(s)`);
      }
    }
    for (const id of entry.docIds) {
      batch.delete(db.collection("notificationQueue").doc(id));
    }
  }

  await batch.commit();
  return res.status(200).json({ processed: snapshot.size, sent });
}

async function getTrainerUids(db: Firestore): Promise<string[]> {
  const snap = await db
    .collection("users")
    .where("role", "in", ["trainer", "admin"])
    .get();
  return snap.docs.map((d) => d.id);
}

