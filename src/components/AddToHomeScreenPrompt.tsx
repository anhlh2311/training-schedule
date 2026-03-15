import { useState, useEffect } from "react";

const DISMISS_KEY = "training-schedule-ios-add-to-home-dismissed";

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  const nav = navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone) || window.matchMedia("(display-mode: standalone)").matches;
}

/**
 * Shows a dismissible banner on iOS when the app is not opened from the home screen.
 * Explains that adding to home screen is required for push notifications on iPhone/iPad.
 * Only shown to trainers when OneSignal is configured (so push is relevant).
 */
export default function AddToHomeScreenPrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isIOS() || isStandalone()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      return;
    }
    const appId = import.meta.env.VITE_ONESIGNAL_APP_ID as string | undefined;
    if (!appId) return;
    setVisible(true);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="banner"
      className="flex items-start justify-between gap-3 border-b border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900"
    >
      <div>
        <p className="font-medium">Get notifications on this device</p>
        <p className="mt-0.5 text-blue-800">
          Tap the browser&apos;s Share button, then &quot;Add to Home Screen&quot;. Open the app from your home screen to receive push notifications.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded p-1 text-blue-600 transition hover:bg-blue-100 hover:text-blue-800"
        aria-label="Dismiss"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
