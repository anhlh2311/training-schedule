import { useState } from "react";
import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  query,
  where,
  getDocs,
  Timestamp,
  orderBy,
  writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import type { CalendarEvent } from "../types";

interface DropOffModalProps {
  open: boolean;
  event: CalendarEvent | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function DropOffModal({
  open,
  event,
  onClose,
  onSuccess,
}: DropOffModalProps) {
  const { user } = useAuth();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const isRecurring =
    event?.resource?.recurrence &&
    event.resource.recurrence !== "none";

  async function handleSubmit(scope: "single" | "series") {
    if (!event?.resource?.occurrenceId || !user) return;
    setError("");
    setSubmitting(true);
    try {
      const userId = user.uid;
      const userName = user.displayName ?? user.email ?? "Unknown";
      const reasonText = reason.trim() || "No reason provided";

      if (scope === "single") {
        const occurrenceId = event.resource.occurrenceId;
        await addDoc(collection(db, "eventDropOffs"), {
          occurrenceId,
          userId,
          userName,
          reason: reasonText,
          droppedAt: Timestamp.now(),
        });

        const q = query(
          collection(db, "eventParticipants"),
          where("occurrenceId", "==", occurrenceId),
          where("userId", "==", userId)
        );
        const snap = await getDocs(q);
        for (const d of snap.docs) {
          await deleteDoc(d.ref);
        }
      } else {
        const eventId = event.resource.eventId;
        if (!eventId) {
          setError("Cannot drop off from entire series");
          return;
        }

        const occQuery = query(
          collection(db, "eventOccurrences"),
          where("eventId", "==", eventId),
          where("start", ">=", Timestamp.fromDate(event.start)),
          orderBy("start", "asc")
        );
        const occSnap = await getDocs(occQuery);
        const occurrenceIds = occSnap.docs.map((d) => d.id);

        const batch = writeBatch(db);
        for (const occurrenceId of occurrenceIds) {
          const dropRef = doc(collection(db, "eventDropOffs"));
          batch.set(dropRef, {
            occurrenceId,
            userId,
            userName,
            reason: reasonText,
            droppedAt: Timestamp.now(),
          });
        }
        await batch.commit();

        for (const occurrenceId of occurrenceIds) {
          const partQuery = query(
            collection(db, "eventParticipants"),
            where("occurrenceId", "==", occurrenceId),
            where("userId", "==", userId)
          );
          const partSnap = await getDocs(partQuery);
          for (const d of partSnap.docs) {
            await deleteDoc(d.ref);
          }
        }
      }

      setReason("");
      onSuccess();
      onClose();
    } catch (err) {
      setError("Failed to drop off");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gray-100 bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dropoff-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="dropoff-modal-title" className="text-lg font-semibold text-gray-900">
          Drop off from event
        </h2>
        {event && (
          <>
            <p className="mt-2 text-lg font-bold text-gray-900">
              {event.title}
            </p>
            <p className="mt-1 text-sm font-bold text-red-700">
              {event.start.toLocaleDateString()} ·{" "}
              {event.start.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              –{" "}
              {event.end.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            {event.resource?.venue && (
              <p className="mt-0.5 text-sm text-gray-600">
                Venue: {event.resource.venue}
              </p>
            )}
          </>
        )}

        <div className="mt-4">
          <label
            htmlFor="dropoff-reason"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400"
          >
            Reason (optional)
          </label>
          <textarea
            id="dropoff-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Schedule conflict, illness..."
            rows={3}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-600">{error}</p>
        )}

        <div className="mt-6 flex flex-col gap-3">
          {isRecurring ? (
            <div className="flex gap-2">
              <button
                onClick={() => handleSubmit("single")}
                disabled={submitting}
                className="flex-1 rounded-xl bg-amber-100 px-4 py-2.5 text-sm font-medium text-amber-700 transition hover:bg-amber-200 disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "This date only"}
              </button>
              <button
                onClick={() => handleSubmit("series")}
                disabled={submitting}
                className="flex-1 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Entire series"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => handleSubmit("single")}
              disabled={submitting}
              className="w-full rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Drop off"}
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
