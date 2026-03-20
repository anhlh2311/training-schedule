import { useState, useEffect } from "react";

const DISMISS_KEY = "training-schedule-ios-add-to-home-dismissed";

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const platform = navigator.platform ?? "";
  return (
    /iPad|iPhone|iPod/i.test(ua) ||
    (platform === "MacIntel" && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1) ||
    /iPad|iPhone/i.test(platform)
  );
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
  } catch {
    // ignore
  }
  return false;
}

/**
 * Shows a dismissible banner on iOS when the app is not opened from the home screen.
 * Explains that adding to home screen is required for push notifications on iPhone/iPad.
 * Shown to trainers so iOS users can install the PWA (required for FCM web push on iPhone/iPad).
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
        <ol className="mt-0.5 list-decimal space-y-0.5 pl-5 text-blue-800">
          <li>Tap Share in your browser.</li>
          <li>Select &quot;Add to Home Screen&quot;.</li>
          <li>Open the app from your home screen.</li>
          <li>Allow notifications when prompted.</li>
        </ol>
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
