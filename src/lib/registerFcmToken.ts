import { doc, setDoc, Timestamp } from "firebase/firestore";
import { app, db } from "./firebase";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_PUBLIC_KEY as string | undefined;

let fcmForegroundUnsubscribe: (() => void) | undefined;

/** Call when user signs out or is no longer a trainer so the FCM foreground listener is cleared. */
export function detachFcmForegroundListener(): void {
  fcmForegroundUnsubscribe?.();
  fcmForegroundUnsubscribe = undefined;
}

/**
 * While the tab is focused, FCM does not use the service worker; show the same data-only
 * payload via the Notifications API.
 */
async function attachFcmForegroundListener(): Promise<void> {
  if (fcmForegroundUnsubscribe) return;
  if (!VAPID_KEY?.trim()) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

  try {
    const { getMessaging, onMessage, isSupported } = await import("firebase/messaging");
    if (!(await isSupported())) return;

    const messaging = getMessaging(app);
    fcmForegroundUnsubscribe = onMessage(messaging, (payload) => {
      const data = payload.data as Record<string, string> | undefined;
      const title = data?.title ?? payload.notification?.title;
      const body = data?.body ?? payload.notification?.body;
      if (!title || !body) return;
      try {
        new Notification(title, {
          body,
          icon: "/IHN-Logo-1000x1000.png",
          tag: "training-schedule-fcm-fg",
        });
      } catch {
        // ignore
      }
    });
  } catch {
    // ignore
  }
}

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

    await attachFcmForegroundListener();
    return { ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (import.meta.env.DEV) {
      console.warn("[registerTrainerFcmToken]", err);
    }
    return { ok: false, reason: "unknown", detail };
  }
}
