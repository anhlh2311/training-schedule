/** Event dispatched when /api/notify returns. Used by NotifyDebugLog when VITE_NOTIFY_DEBUG is set. */
export const NOTIFY_DEBUG_EVENT = "notify-debug-response";

export interface NotifyDebugEventDetail {
  payload: { type: string; [key: string]: unknown };
  status: number;
  response: unknown;
}

export function dispatchNotifyDebug(detail: NotifyDebugEventDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(NOTIFY_DEBUG_EVENT, { detail })
  );
}
