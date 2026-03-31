import { useCallback, useEffect, useState } from "react";
import {
  listUnsyncedEntriesForUser,
  listUsersWithUnsyncedNames,
  syncAllDenormalizedDisplayNames,
  syncDenormalizedForUser,
  syncSelectedDenormalizedEntries,
  type SelectedUnsyncedRef,
  type UnsyncedEntry,
  type UserWithUnsyncSummary,
} from "../lib/syncDisplayNamesAdmin";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

interface SyncDisplayNamesModalProps {
  open: boolean;
  onClose: () => void;
}

function entryKey(e: UnsyncedEntry): string {
  return `${e.kind}:${e.id}`;
}

export default function SyncDisplayNamesModal({ open, onClose }: SyncDisplayNamesModalProps) {
  const [phase, setPhase] = useState<"loading" | "users" | "detail">("loading");
  const [scanningUsers, setScanningUsers] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserWithUnsyncSummary[]>([]);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [entries, setEntries] = useState<UnsyncedEntry[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [bulkDone, setBulkDone] = useState<{
    usersProcessed: number;
    availabilitiesUpdated: number;
    participantsUpdated: number;
    dropOffsUpdated: number;
  } | null>(null);

  const loadUserSummaries = useCallback(async () => {
    setError(null);
    setLastMessage(null);
    setBulkDone(null);
    setScanningUsers(true);
    try {
      const list = await listUsersWithUnsyncedNames();
      setUsers(list);
      setPhase("users");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to scan");
      setPhase("users");
    } finally {
      setScanningUsers(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setPhase("loading");
      setUsers([]);
      setSelectedUid(null);
      setEntries([]);
      setSelectedKeys(new Set());
      setError(null);
      setLastMessage(null);
      setBulkDone(null);
      return;
    }
    void loadUserSummaries();
  }, [open, loadUserSummaries]);

  async function openUserDetail(uid: string) {
    setError(null);
    setLastMessage(null);
    setSelectedUid(uid);
    setDetailLoading(true);
    setPhase("detail");
    try {
      const list = await listUnsyncedEntriesForUser(uid);
      setEntries(list);
      setSelectedKeys(new Set(list.map(entryKey)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load entries");
      setPhase("users");
      setSelectedUid(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function toggleKey(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll(checked: boolean) {
    if (checked) {
      setSelectedKeys(new Set(entries.map(entryKey)));
    } else {
      setSelectedKeys(new Set());
    }
  }

  async function runSyncSelected() {
    if (!selectedUid) return;
    const selected: SelectedUnsyncedRef[] = [];
    for (const e of entries) {
      const k = entryKey(e);
      if (selectedKeys.has(k)) {
        selected.push({ kind: e.kind, id: e.id });
      }
    }
    if (selected.length === 0) {
      setLastMessage("Select at least one row to sync.");
      return;
    }
    setBusy(true);
    setError(null);
    setLastMessage(null);
    try {
      const n = await syncSelectedDenormalizedEntries(selectedUid, selected);
      setLastMessage(`Updated ${n} document(s).`);
      const remaining = await listUnsyncedEntriesForUser(selectedUid);
      setEntries(remaining);
      setSelectedKeys(new Set(remaining.map(entryKey)));
      const summaries = await listUsersWithUnsyncedNames();
      setUsers(summaries);
      if (remaining.length === 0) {
        setPhase("users");
        setSelectedUid(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  async function runSyncAllForUser() {
    if (!selectedUid) return;
    setBusy(true);
    setError(null);
    setLastMessage(null);
    try {
      const userSnap = await getDoc(doc(db, "users", selectedUid));
      if (!userSnap.exists()) throw new Error("User not found");
      const data = userSnap.data();
      const patch = {
        userName:
          typeof data.displayName === "string" && data.displayName.trim()
            ? data.displayName.trim()
            : "Anonymous",
        userPhotoURL: typeof data.photoURL === "string" ? data.photoURL : "",
        userEmail: typeof data.email === "string" ? data.email : "",
      };
      const r = await syncDenormalizedForUser(selectedUid, patch);
      const total = r.availabilitiesUpdated + r.participantsUpdated + r.dropOffsUpdated;
      setLastMessage(
        `Synced all rows for this user: ${r.availabilitiesUpdated} availability, ${r.participantsUpdated} subscription, ${r.dropOffsUpdated} drop-off (${total} total).`
      );
      const summaries = await listUsersWithUnsyncedNames();
      setUsers(summaries);
      setPhase("users");
      setSelectedUid(null);
      setEntries([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  async function runSyncEntireDatabase() {
    setBusy(true);
    setError(null);
    setLastMessage(null);
    try {
      const r = await syncAllDenormalizedDisplayNames();
      setBulkDone(r);
      await loadUserSummaries();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    if (busy) return;
    onClose();
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" onClick={handleClose} aria-hidden />
      <div
        className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(90vh,720px)] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-gray-100 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-names-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 id="sync-names-title" className="text-lg font-semibold text-gray-900">
            Sync display names
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Rows that still show an old name, email, or photo compared to the user&apos;s profile in{" "}
            <code className="rounded bg-gray-100 px-1 text-xs">users</code> are listed here. Select
            users and entries, then sync.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {error && (
            <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}
          {lastMessage && (
            <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">{lastMessage}</p>
          )}

          {phase === "loading" && scanningUsers && (
            <p className="text-sm text-gray-500">Scanning all users…</p>
          )}

          {phase === "users" && (
            <>
              {scanningUsers && (
                <p className="mb-2 text-xs text-gray-500">Refreshing…</p>
              )}
              {bulkDone && (
                <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                  <p className="font-medium">Full database sync finished</p>
                  <ul className="mt-1 list-inside list-disc text-blue-800">
                    <li>Users processed: {bulkDone.usersProcessed}</li>
                    <li>Availability rows: {bulkDone.availabilitiesUpdated}</li>
                    <li>Subscriptions: {bulkDone.participantsUpdated}</li>
                    <li>Drop-offs: {bulkDone.dropOffsUpdated}</li>
                  </ul>
                </div>
              )}

              {users.length === 0 ? (
                <p className="text-sm text-gray-600">
                  No out-of-sync rows found. Everyone&apos;s calendar data matches their profile
                  fields, or there are no denormalized records yet.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
                  {users.map((u) => (
                    <li key={u.uid}>
                      <button
                        type="button"
                        onClick={() => void openUserDetail(u.uid)}
                        disabled={busy}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-gray-50 disabled:opacity-50"
                      >
                        <span>
                          <span className="font-medium text-gray-900">{u.displayName || "—"}</span>
                          <span className="mt-0.5 block text-xs text-gray-500">{u.email}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900">
                          {u.outOfSyncCount} unsynced
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {phase === "detail" && selectedUid && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  setPhase("users");
                  setSelectedUid(null);
                  setEntries([]);
                  setLastMessage(null);
                }}
                disabled={busy}
                className="text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
              >
                ← Back to users
              </button>

              {detailLoading && (
                <p className="text-sm text-gray-500">Loading entries…</p>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={entries.length > 0 && selectedKeys.size === entries.length}
                    onChange={(e) => selectAll(e.target.checked)}
                    disabled={busy || entries.length === 0}
                    className="rounded border-gray-300"
                  />
                  Select all
                </label>
              </div>

              {!detailLoading && entries.length === 0 && (
                <p className="text-sm text-gray-600">No out-of-sync rows for this user (they may have been fixed).</p>
              )}

              <ul className="max-h-[40vh] divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-100">
                {entries.map((e) => {
                  const k = entryKey(e);
                  const kindLabel =
                    e.kind === "availability"
                      ? "Availability"
                      : e.kind === "participant"
                        ? "Subscription"
                        : "Drop-off";
                  return (
                    <li key={k} className="flex gap-3 px-3 py-2.5 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedKeys.has(k)}
                        onChange={() => toggleKey(k)}
                        disabled={busy}
                        className="mt-1 shrink-0 rounded border-gray-300"
                        aria-label={`Select ${kindLabel}`}
                      />
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
                          {kindLabel}
                        </span>
                        <p className="font-medium text-gray-900">{e.label}</p>
                        <p className="text-xs text-gray-500">{e.mismatchHint}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-gray-100 px-6 py-4 sm:flex-row sm:flex-wrap sm:justify-end">
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            Close
          </button>
          {phase === "users" && (
            <>
              <button
                type="button"
                onClick={() => void loadUserSummaries()}
                disabled={busy || scanningUsers}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                {scanningUsers ? "…" : "Refresh scan"}
              </button>
              <button
                type="button"
                onClick={() => void runSyncEntireDatabase()}
                disabled={busy || scanningUsers}
                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-900 transition hover:bg-amber-100 disabled:opacity-50"
              >
                {busy ? "…" : "Sync all users (full)"}
              </button>
            </>
          )}
          {phase === "detail" && selectedUid && (
            <>
              <button
                type="button"
                onClick={() => void runSyncAllForUser()}
                disabled={busy || detailLoading}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
              >
                {busy ? "…" : "Sync all rows for this user"}
              </button>
              <button
                type="button"
                onClick={() => void runSyncSelected()}
                disabled={busy || detailLoading || selectedKeys.size === 0}
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? "Syncing…" : `Sync selected (${selectedKeys.size})`}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
