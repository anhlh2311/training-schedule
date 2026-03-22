import { doc, setDoc, Timestamp } from "firebase/firestore";
import { app, db } from "./firebase";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_PUBLIC_KEY as string | undefined;

export type RegisterFcmResult =
  | { ok: true }
  | { ok: false; reason: "missing_vapid" | "no_sw" | "not_supported" | "no_token" | "unknown"; detail?: string };

/**
 * Registers the FCM web token and saves it to Firestore.
 * Call after notification permission is granted (ideally from a user gesture on iOS).
 */
export async function registerTrainerFcmToken(uid: string): Promise<RegisterFcmResult> {
  if (!VAPID_KEY?.trim()) {
    return { ok: false, reason: "missing_vapid" };
  }
  if (typeof navigator === "undefined" || !navigator.serviceWorker?.register) {
    return { ok: false, reason: "no_sw" };
  }

  try {
    const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
    const supported = await isSupported();
    if (!supported) {
      return { ok: false, reason: "not_supported" };
    }

    const messaging = getMessaging(app);
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/",
    });

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (!token) {
      return { ok: false, reason: "no_token" };
    }

    const tokenId = token.slice(0, 32).replace(/\W/g, "_");
    const tokenRef = doc(db, "users", uid, "fcmTokens", tokenId);
    await setDoc(tokenRef, {
      token,
      createdAt: Timestamp.now(),
    });

    return { ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (import.meta.env.DEV) {
      console.warn("[registerTrainerFcmToken]", err);
    }
    return { ok: false, reason: "unknown", detail };
  }
}
