import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { isIOSDevice, isStandalonePWA } from "../lib/platform";
import { registerTrainerFcmToken } from "../lib/registerFcmToken";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_PUBLIC_KEY as string | undefined;

/**
 * iOS PWA: notification permission must be requested from a **user gesture** (tap).
 * Shows a banner with an explicit "Enable notifications" button when the app is
 * installed (standalone) and permission is still promptable.
 */
export default function IosPushPermissionBanner() {
  const { user, isTrainer } = useAuth();
  const [fcmSupported, setFcmSupported] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("firebase/messaging")
      .then(({ isSupported }) => isSupported())
      .then((ok) => {
        if (!cancelled) setFcmSupported(ok);
      })
      .catch(() => {
        if (!cancelled) setFcmSupported(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!isTrainer || !user || !VAPID_KEY?.trim()) return null;
  if (!isIOSDevice()) return null;
  if (!isStandalonePWA()) return null;
  if (done) return null;
  if (typeof Notification === "undefined") return null;

  const perm = Notification.permission;
  if (perm === "granted" || perm === "denied") return null;

  // Still "default" — show banner once we know FCM support
  if (fcmSupported === null) {
    return (
      <div
        role="status"
        className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-center text-xs text-amber-800"
      >
        Checking notification support…
      </div>
    );
  }

  if (!fcmSupported) {
    return (
      <div
        role="alert"
        className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      >
        <p className="font-medium">Push notifications are not available in this browser</p>
        <p className="mt-1 text-amber-800">
          Use iOS 16.4 or later, add this app to your Home Screen, and open it from the
          home screen icon.
        </p>
      </div>
    );
  }

  async function onEnable() {
    const uid = user?.uid;
    if (!uid) return;
    setBusy(true);
    setError(null);
    try {
      const p = await Notification.requestPermission();
      if (p !== "granted") {
        setError(p === "denied" ? "Notifications are blocked. You can enable them in Settings → Safari → your site." : "Permission was not granted.");
        setBusy(false);
        return;
      }
      const result = await registerTrainerFcmToken(uid);
      if (result.ok) {
        setDone(true);
      } else {
        setError(
          result.reason === "not_supported"
            ? "This device does not support web push."
            : result.detail ?? "Could not register for push. Try again later."
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="region"
      aria-label="Enable push notifications"
      className="flex flex-col gap-2 border-b border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <p className="font-medium">Get trainer alerts on this device</p>
        <p className="mt-0.5 text-green-800">
          Tap the button to allow notifications. Apple requires this to be triggered by you, not automatically in the background.
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
        <button
          type="button"
          onClick={onEnable}
          disabled={busy}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-green-700 disabled:opacity-60"
        >
          {busy ? "Loading…" : "Enable notifications"}
        </button>
        {error && <p className="max-w-xs text-xs text-red-700">{error}</p>}
      </div>
    </div>
  );
}
