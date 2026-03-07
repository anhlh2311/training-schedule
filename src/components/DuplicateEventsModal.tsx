import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  doc,
  writeBatch,
  query,
  orderBy,
} from "firebase/firestore";
import dayjs from "dayjs";
import { db } from "../lib/firebase";

interface AvailabilityDoc {
  id: string;
  userId: string;
  userName: string;
  start: Date;
  end: Date;
  createdAt?: Date;
}

interface DuplicateGroup {
  key: string;
  userId: string;
  userName: string;
  start: Date;
  end: Date;
  docs: AvailabilityDoc[];
}

function findDuplicates(docs: AvailabilityDoc[]): DuplicateGroup[] {
  const bySlot = new Map<string, AvailabilityDoc[]>();
  for (const d of docs) {
    const key = `${d.userId}-${d.start.getTime()}-${d.end.getTime()}`;
    const arr = bySlot.get(key);
    if (arr) arr.push(d);
    else bySlot.set(key, [d]);
  }
  return Array.from(bySlot.values())
    .filter((arr) => arr.length > 1)
    .map((arr) => {
      const first = arr[0];
      return {
        key: `${first.userId}-${first.start.getTime()}-${first.end.getTime()}`,
        userId: first.userId,
        userName: first.userName,
        start: first.start,
        end: first.end,
        docs: arr.sort((a, b) =>
          (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)
        ),
      };
    })
    .sort((a, b) => a.userName.localeCompare(b.userName) || a.start.getTime() - b.start.getTime());
}

interface DuplicateEventsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function DuplicateEventsModal({ open, onClose }: DuplicateEventsModalProps) {
  const [loading, setLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setLoading(true);
    const q = query(
      collection(db, "availabilities"),
      orderBy("start", "asc")
    );
    getDocs(q)
      .then((snap) => {
        const docs: AvailabilityDoc[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            userId: data.userId,
            userName: data.userName,
            start: data.start.toDate(),
            end: data.end.toDate(),
            createdAt: data.createdAt?.toDate(),
          };
        });
        setDuplicates(findDuplicates(docs));
      })
      .catch((err) => {
        setError("Failed to load availabilities");
        console.error(err);
      })
      .finally(() => setLoading(false));
  }, [open]);

  async function handleCleanup() {
    if (duplicates.length === 0) return;
    setCleaning(true);
    setError("");
    try {
      const toDelete: { ref: ReturnType<typeof doc> }[] = [];
      for (const group of duplicates) {
        for (let i = 1; i < group.docs.length; i++) {
          toDelete.push({ ref: doc(db, "availabilities", group.docs[i].id) });
        }
      }
      const BATCH_SIZE = 500;
      for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = toDelete.slice(i, i + BATCH_SIZE);
        for (const { ref } of chunk) {
          batch.delete(ref);
        }
        await batch.commit();
      }
      setDuplicates([]);
      onClose();
    } catch (err) {
      setError("Failed to clean up duplicates");
      console.error(err);
    } finally {
      setCleaning(false);
    }
  }

  if (!open) return null;

  const totalDuplicates = duplicates.reduce((sum, g) => sum + g.docs.length - 1, 0);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gray-100 bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="duplicate-events-modal-title"
      >
        <h2 id="duplicate-events-modal-title" className="text-lg font-semibold text-gray-900">
          Duplicate events
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Events with the same user and time slot. Clean up removes duplicates, keeping the earliest.
        </p>

        {loading ? (
          <div className="mt-6 flex justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
          </div>
        ) : (
          <>
            <div className="mt-4 max-h-64 overflow-y-auto rounded-xl border border-gray-100">
              {duplicates.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  No duplicate events found
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {duplicates.map((group) => (
                    <li key={group.key} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-gray-900">{group.userName}</p>
                          <p className="text-sm text-gray-500">
                            {dayjs(group.start).format("ddd, D MMM")} ·{" "}
                            {dayjs(group.start).format("HH:mm")} – {dayjs(group.end).format("HH:mm")}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                          {group.docs.length} copies
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {error && (
              <p className="mt-3 text-sm text-red-600">{error}</p>
            )}

            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={onClose}
                className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Close
              </button>
              {duplicates.length > 0 && (
                <button
                  onClick={handleCleanup}
                  disabled={cleaning}
                  className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {cleaning ? "Cleaning…" : `Clean up (${totalDuplicates} duplicates)`}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
