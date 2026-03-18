import { useEffect, useRef } from "react";

const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID as string | undefined;

declare global {
  interface Window {
    OneSignalDeferred?: Array<
      (OneSignal: {
        init: (opts: { appId: string; serviceWorkerParam?: { scope: string }; serviceWorkerPath?: string }) => Promise<void>;
        login: (externalId: string) => Promise<void>;
        User?: { addEmail?: (email: string) => Promise<void> };
      }) => void
    >;
  }
}

/**
 * Links the current OneSignal subscription to the user's Firebase UID (external_id)
 * and optionally adds their email. Init runs in index.html so the permission prompt
 * appears early; we only call login here when the user is a logged-in trainer so
 * their subscription gets the external_id for targeting.
 */
export function useOneSignal(userId: string | null, enabled: boolean, email?: string | null) {
  const loggedIn = useRef(false);

  useEffect(() => {
    const uid = userId;
    if (!uid || !enabled) return;
    if (!ONESIGNAL_APP_ID) {
      console.error(
        "[Training Schedule] OneSignal App ID is not configured. Set VITE_ONESIGNAL_APP_ID in your build environment and ONESIGNAL_APP_ID for the API. See .env.example for details."
      );
      return;
    }
    if (typeof window === "undefined" || !window.OneSignalDeferred) return;

    const run = () => {
      if (loggedIn.current) return;
      window.OneSignalDeferred!.push(async (OneSignal) => {
        try {
          await OneSignal.login(uid);
          if (email?.trim() && typeof OneSignal.User?.addEmail === "function") {
            await OneSignal.User.addEmail(email.trim());
          }
          loggedIn.current = true;
        } catch (err) {
          if (import.meta.env.DEV) {
            console.warn("OneSignal login failed (optional):", err);
          }
        }
      });
    };

    run();
  }, [userId, enabled, email]);
}
