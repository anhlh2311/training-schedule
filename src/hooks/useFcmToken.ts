import { useEffect, useRef } from "react";
import { isIOSDevice } from "../lib/platform";
import { registerTrainerFcmToken } from "../lib/registerFcmToken";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_PUBLIC_KEY as string | undefined;

/**
 * Registers for FCM and saves the token to Firestore under users/{uid}/fcmTokens/{tokenId}.
 * Call when user is signed in and is trainer/admin.
 *
 * **iOS:** WebKit does not reliably show the notification permission dialog when
 * `Notification.requestPermission()` runs from a `useEffect` (no user gesture).
 * On iOS we only auto-register if permission is already `granted`. Otherwise use
 * `IosPushPermissionBanner` so the user taps "Enable notifications" first.
 *
 * **Other platforms:** Requests permission on mount when still `default`, then registers.
 */
export function useFcmToken(userId: string | null, enabled: boolean) {
  const registered = useRef(false);

  useEffect(() => {
    const uid = userId;
    if (!uid || !enabled || !VAPID_KEY) return;
    if (typeof navigator === "undefined" || !navigator.serviceWorker?.register) return;

    let cancelled = false;

    async function register() {
      const result = await registerTrainerFcmToken(uid as string);
      if (!cancelled && result.ok) {
        registered.current = true;
      }
    }

    if (typeof Notification === "undefined") return;

    // iOS: only register when permission already granted (prompt via IosPushPermissionBanner).
    if (isIOSDevice()) {
      if (Notification.permission === "granted") {
        register();
      }
      return () => {
        cancelled = true;
      };
    }

    // Non-iOS: request permission without requiring a separate button (works on desktop/Android Chrome).
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
