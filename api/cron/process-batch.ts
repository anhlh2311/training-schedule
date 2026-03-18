import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Firestore } from "firebase-admin/firestore";
import admin from "firebase-admin";

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

async function sendOneSignal(
  appId: string,
  restApiKey: string,
  externalUserIds: string[],
  title: string,
  body: string
): Promise<number> {
  const res = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${restApiKey}`,
    },
    body: JSON.stringify({
      app_id: appId,
      include_external_user_ids: externalUserIds,
      headings: { en: title },
      contents: { en: body },
      data: { url: "/" },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OneSignal API ${res.status}: ${text}`);
  }
  const data = (await res.json()) as { recipients?: number };
  return data.recipients ?? 0;
}

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
  const onesignalAppId = process.env.ONESIGNAL_APP_ID;
  const onesignalRestApiKey = process.env.ONESIGNAL_REST_API_KEY;
  const useOneSignal = Boolean(onesignalAppId && onesignalRestApiKey && trainerUids.length > 0);
  const fcmTokens = useOneSignal ? [] : await getFcmTokensForUsers(db, trainerUids);
  const batch = db.batch();
  let sent = 0;

  for (const [, entry] of byWindow) {
    const count = entry.docIds.length;
    const title = "Training Schedule";
    const body =
      count === 1
        ? "1 update from a trainer."
        : `${count} availability/event updates.`;
    if (useOneSignal) {
      sent += await sendOneSignal(onesignalAppId!, onesignalRestApiKey!, trainerUids, title, body);
    } else if (fcmTokens.length > 0) {
      const messaging = getMessaging();
      const result = await messaging.sendEachForMulticast({
        notification: { title, body },
        data: { type: entry.type, url: "/" },
        tokens: fcmTokens,
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

async function getTrainerUids(db: Firestore): Promise<string[]> {
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
