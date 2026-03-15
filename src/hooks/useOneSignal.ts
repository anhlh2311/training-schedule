import { useEffect, useRef } from "react";

const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID as string | undefined;

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: { init: (opts: { appId: string; serviceWorkerParam?: { scope: string }; serviceWorkerPath?: string }) => Promise<void>; login: (externalId: string) => Promise<void> }) => void>;
  }
}

/**
 * Initializes OneSignal and identifies the user by Firebase UID (external_id).
 * Call when user is signed in and is trainer/admin so they can receive push notifications.
 */
export function useOneSignal(userId: string | null, enabled: boolean) {
  const inited = useRef(false);

  useEffect(() => {
    const uid = userId;
    if (!uid || !enabled || !ONESIGNAL_APP_ID) return;
    if (typeof window === "undefined" || !window.OneSignalDeferred) return;

    const run = () => {
      if (inited.current) return;
      window.OneSignalDeferred!.push(async (OneSignal) => {
        try {
          await OneSignal.init({
            appId: ONESIGNAL_APP_ID,
            serviceWorkerParam: { scope: "/" },
            serviceWorkerPath: "OneSignalSDKWorker.js",
          });
          await OneSignal.login(uid);
          inited.current = true;
        } catch (err) {
          if (import.meta.env.DEV) {
            console.warn("OneSignal init/login failed (optional):", err);
          }
        }
      });
    };

    run();
  }, [userId, enabled]);
}
