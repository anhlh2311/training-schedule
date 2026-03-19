import type { VercelRequest, VercelResponse } from "@vercel/node";
import admin from "firebase-admin";

function getFirebaseAdmin() {
  if (Array.isArray(admin.apps) && admin.apps.length > 0) return admin.app();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY ?? "";

  if (privateKey && !privateKey.includes("\n") && privateKey.includes("\\n")) {
    privateKey = privateKey.replace(/\\n/g, "\n");
  }

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY"
    );
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

interface RegisterBody {
  subscriptionId?: string;
  optedIn?: boolean;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const authHeader = req.headers.authorization;
    const idToken =
      authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) {
      res.status(401).json({ error: "Missing Authorization header" });
      return;
    }

    let decodedToken: { uid: string };
    try {
      decodedToken = await getAuth().verifyIdToken(idToken);
    } catch (err) {
      console.error("[register-push-subscription] verifyIdToken failed:", err);
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    const body = (typeof req.body === "object" && req.body !== null
      ? req.body
      : {}) as RegisterBody;
    const { subscriptionId, optedIn } = body;

    if (!subscriptionId || typeof subscriptionId !== "string") {
      res.status(400).json({ error: "subscriptionId required" });
      return;
    }

    const db = getFirestore();
    const docRef = db.collection("oneSignalSubscriptions").doc(subscriptionId);

    if (optedIn === false) {
      await docRef.delete();
      res.status(200).json({ unregistered: true });
      return;
    }

    await docRef.set({
      userId: decodedToken.uid,
      updatedAt: new Date(),
    });

    res.status(200).json({ registered: true });
  } catch (err) {
    console.error("[register-push-subscription] error:", err);
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      error: "Registration failed",
      detail: message,
    });
  }
}
