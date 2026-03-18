import { useEffect, useRef } from "react";

const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID as string | undefined;

declare global {
  interface Window {
    OneSignalDeferred?: Array<
      (OneSignal: {
        init: (opts: { appId: string; requiresUserPrivacyConsent?: boolean }) => Promise<void>;
        setConsentGiven: (given: boolean) => void;
        login: (externalId: string) => Promise<void>;
        logout: () => Promise<void>;
        User?: {
          addEmail?: (email: string) => Promise<void>;
          PushSubscription?: {
            addEventListener: (event: string, handler: (e: { current: { optedIn?: boolean }; previous: { optedIn?: boolean } }) => void) => void;
          };
        };
        Slidedown?: { promptPush: (opts?: { force?: boolean }) => void };
      }) => void
    >;
  }
}

/**
 * Links the current OneSignal subscription to the user's Firebase UID (external_id)
 * and optionally adds their email. OneSignal init uses requiresUserPrivacyConsent
 * so we only enable it when a trainer is logged in. We call login() and re-call it
 * when the push subscription changes (user opts in) to avoid race conditions.
 */
export function useOneSignal(userId: string | null, enabled: boolean, email?: string | null) {
  const consentGiven = useRef(false);
  const uidRef = useRef<string | null>(null);
  const listenerAdded = useRef(false);
  const prevUserId = useRef<string | null>(null);
  uidRef.current = userId ?? null;

  useEffect(() => {
    if (prevUserId.current && !userId && window.OneSignalDeferred) {
      prevUserId.current = null;
      window.OneSignalDeferred.push(async (OneSignal) => {
        try {
          await OneSignal.logout();
        } catch {
          /* ignore */
        }
      });
      return;
    }
    prevUserId.current = userId ?? null;
    const uid = userId;
    if (!uid || !enabled) return;
    if (!ONESIGNAL_APP_ID) {
      console.error(
        "[Training Schedule] OneSignal App ID is not configured. Set VITE_ONESIGNAL_APP_ID in your build environment and ONESIGNAL_APP_ID for the API. See .env.example for details."
      );
      return;
    }
    if (typeof window === "undefined" || !window.OneSignalDeferred) return;

    window.OneSignalDeferred!.push(async (OneSignal) => {
      try {
        if (!consentGiven.current) {
          OneSignal.setConsentGiven(true);
          consentGiven.current = true;
        }

        await OneSignal.login(uid);
        if (email?.trim() && typeof OneSignal.User?.addEmail === "function") {
          await OneSignal.User.addEmail(email.trim());
        }

        // Re-call login when user subscribes to push; avoids race where login
        // runs before subscription exists. Use uidRef so we always use current user.
        if (
          !listenerAdded.current &&
          OneSignal.User?.PushSubscription?.addEventListener
        ) {
          listenerAdded.current = true;
          OneSignal.User.PushSubscription.addEventListener(
            "change",
            (event: { current?: { optedIn?: boolean }; previous?: { optedIn?: boolean } }) => {
              if (event?.current?.optedIn) {
                const currentUid = uidRef.current;
                if (currentUid) {
                  OneSignal.login(currentUid).catch(() => {});
                }
              }
            }
          );
        }

        // Manually trigger prompt if dashboard auto-prompt didn't show.
        if (typeof OneSignal.Slidedown?.promptPush === "function") {
          OneSignal.Slidedown.promptPush();
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn("OneSignal login failed (optional):", err);
        }
      }
    });
  }, [userId, enabled, email]);
}
