import { useCallback, useEffect, useRef, useState } from "react";
import { NOTIFY_DEBUG_EVENT, type NotifyDebugEventDetail } from "../lib/notifyDebug";

export const NOTIFY_DEBUG_ENABLED =
  import.meta.env.VITE_NOTIFY_DEBUG === "true" || import.meta.env.VITE_NOTIFY_DEBUG === "1";

interface LogEntry {
  id: number;
  timestamp: string;
  type: "info" | "success" | "error";
  message: string;
  detail?: unknown;
}

let nextId = 0;

export default function NotifyDebugLog() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!NOTIFY_DEBUG_ENABLED) return;

    const handler = (e: Event) => {
      const { payload, status, response } = (e as CustomEvent<NotifyDebugEventDetail>).detail;
      const res = response as { sent?: number; error?: string; debug?: unknown };
      const type: LogEntry["type"] = status >= 200 && status < 300 ? "success" : "error";
      const message =
        type === "success"
          ? `POST /api/notify (${payload.type}) → ${status} ${res.sent != null ? `sent=${res.sent}` : ""}`
          : `POST /api/notify (${payload.type}) → ${status} ${res.error ?? ""}`;

      setEntries((prev) => {
        const next = [
          ...prev,
          {
            id: nextId++,
            timestamp: new Date().toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
            type,
            message,
            detail: res.debug ?? response,
          },
        ];
        return next.slice(-100);
      });
    };

    window.addEventListener(NOTIFY_DEBUG_EVENT, handler);
    return () => window.removeEventListener(NOTIFY_DEBUG_EVENT, handler);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [entries]);

  const clear = useCallback(() => setEntries([]), []);

  if (!NOTIFY_DEBUG_ENABLED) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 flex max-h-[280px] flex-col rounded-t-xl border border-gray-600 bg-[#1a1d23] font-mono text-sm shadow-lg"
      style={{ fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace" }}
    >
      <div className="flex items-center justify-between border-b border-gray-600 px-4 py-2">
        <span className="font-semibold text-white">Log</span>
        <button
          type="button"
          onClick={clear}
          className="rounded px-2 py-0.5 text-gray-400 transition hover:bg-gray-700 hover:text-gray-200"
        >
          Clear
        </button>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-auto p-3"
        style={{ minHeight: 120 }}
      >
        <div className="space-y-0.5 rounded border border-gray-700 bg-[#0d0f12] p-3">
          {entries.length === 0 ? (
            <div className="text-gray-500">Waiting for notify requests…</div>
          ) : (
            entries.map((e) => (
              <div key={e.id} className="flex gap-2 break-all">
                <span className="shrink-0 text-gray-500">{e.timestamp}</span>
                <span
                  className={
                    e.type === "success"
                      ? "text-emerald-400"
                      : e.type === "error"
                        ? "text-red-400"
                        : "text-gray-300"
                  }
                >
                  {String(e.message)}
                </span>
              </div>
            ))
          )}
        </div>
        {entries.length > 0 && entries[entries.length - 1].detail != null && (
          <details className="mt-2">
            <summary className="cursor-pointer text-gray-500 hover:text-gray-400">
              Latest response
            </summary>
            <pre className="mt-1 overflow-x-auto rounded bg-[#0d0f12] p-2 text-xs text-gray-400">
              {String(JSON.stringify(entries[entries.length - 1]?.detail ?? {}, null, 2))}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
