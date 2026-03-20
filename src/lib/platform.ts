type NavigatorWithUAData = Navigator & {
  userAgentData?: { platform?: string | null };
};

/** True for iPhone / iPad / iPod (including iPadOS “desktop” Safari UA). */
export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;

  // Classic iOS / iPadOS mobile UA
  if (/iPad|iPhone|iPod/i.test(ua)) {
    return true;
  }

  // iPadOS 13+ desktop mode: WebKit uses a Macintosh-like UA with touch (avoid deprecated `navigator.platform`).
  if (
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1 &&
    /\bMac\b/i.test(ua)
  ) {
    return true;
  }

  // User-Agent Client Hints (Chromium; sync `platform` when exposed)
  const platform = (navigator as NavigatorWithUAData).userAgentData?.platform;
  if (platform === "iOS") {
    return true;
  }

  return false;
}

/** PWA opened from home screen (required for web push on iOS). */
export function isStandalonePWA(): boolean {
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
