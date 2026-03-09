import { useEffect, useRef } from "react";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { app, db } from "../lib/firebase";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_PUBLIC_KEY as string | undefined;

/**
 * Registers for FCM, gets token, and saves it to Firestore under users/{uid}/fcmTokens/{tokenId}.
 * Call when user is signed in and is trainer/admin so they can receive push notifications.
 */
export function useFcmToken(userId: string | null, enabled: boolean) {
  const registered = useRef(false);

  useEffect(() => {
    const uid = userId;
    if (!uid || !enabled || !VAPID_KEY) return;

    let cancelled = false;

    async function register() {
      try {
        const supported = await isSupported();
        if (!supported || cancelled) return;

        const messaging = getMessaging(app);
        const registration = await navigator.serviceWorker.register(
          "/firebase-messaging-sw.js",
          { scope: "/" }
        );

        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: registration,
        });

        if (!token || cancelled) return;

        const tokenId = token.slice(0, 32).replace(/\W/g, "_");
        const tokenRef = doc(db, "users", uid as string, "fcmTokens", tokenId);
        await setDoc(tokenRef, {
          token,
          createdAt: Timestamp.now(),
        });

        if (!cancelled) registered.current = true;
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn("FCM registration failed (optional):", err);
        }
      }
    }

    if (Notification.permission === "granted") {
      register();
    } else if (Notification.permission === "default") {
      Notification.requestPermission().then((p) => {
        if (p === "granted") register();
      });
    }

    return () => {
      cancelled = true;
    };
  }, [userId, enabled]);
}
