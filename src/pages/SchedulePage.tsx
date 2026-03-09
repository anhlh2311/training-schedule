import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
  writeBatch,
  getDocs,
  Timestamp,
  orderBy,
} from "firebase/firestore";
import dayjs from "dayjs";
import type { SlotInfo } from "react-big-calendar";
import { db } from "../lib/firebase";
import { notifyTrainers } from "../lib/notifyTrainers";
import { useAuth } from "../context/AuthContext";
import CalendarView from "../components/CalendarView";
import DropOffModal from "../components/DropOffModal";
import type { CalendarEvent } from "../types";

type Recurrence = "none" | "weekly" | "monthly";

interface CreateModal {
  open: boolean;
  start?: Date;
  end?: Date;
  title: string;
  recurrence: Recurrence;
  repeatCount: number;
}

const INITIAL_MODAL: CreateModal = {
  open: false,
  title: "",
  recurrence: "none",
  repeatCount: 4,
};

function rangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();
}

export default function SchedulePage() {
  const { user, appUser, isTrainer } = useAuth();
  const [availabilities, setAvailabilities] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<CreateModal>(INITIAL_MODAL);
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    event?: CalendarEvent;
  }>({ open: false });
  const [dropOffModalOpen, setDropOffModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "availabilities"),
      where("userId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: CalendarEvent[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title
            ? `${data.userName} — ${data.title}`
            : data.userName,
          start: data.start.toDate(),
          end: data.end.toDate(),
          resource: {
            userId: data.userId,
            userEmail: data.userEmail,
            userName: data.userName,
            userPhotoURL: data.userPhotoURL ?? "",
            recurrenceGroupId: data.recurrenceGroupId ?? null,
          },
        };
      });
      setAvailabilities(items);
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  const [participantOccurrenceIds, setParticipantOccurrenceIds] = useState<Set<string>>(new Set());
  const [occurrencesMap, setOccurrencesMap] = useState<
    Map<string, { eventId: string; title: string; start: Date; end: Date }>
  >(new Map());
  const [venueByEventId, setVenueByEventId] = useState<Map<string, string>>(new Map());
  const [recurrenceByEventId, setRecurrenceByEventId] = useState<
    Map<string, import("../types").EventRecurrence>
  >(new Map());
  const [participantsByOcc, setParticipantsByOcc] = useState<
    Map<string, Array<{ userId: string; userName: string; userPhotoURL?: string }>>
  >(new Map());

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "eventParticipants"),
      where("userId", "==", user.uid)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const ids = new Set(snapshot.docs.map((d) => d.data().occurrenceId));
      const byOcc = new Map<string, Array<{ userId: string; userName: string; userPhotoURL?: string }>>();
      for (const d of snapshot.docs) {
        const data = d.data();
        const arr = byOcc.get(data.occurrenceId) ?? [];
        arr.push({
          userId: data.userId,
          userName: data.userName,
          userPhotoURL: data.userPhotoURL,
        });
        byOcc.set(data.occurrenceId, arr);
      }
      setParticipantOccurrenceIds(ids);
      setParticipantsByOcc(byOcc);
    });
    return unsub;
  }, [user]);

  useEffect(() => {
    const q = query(
      collection(db, "eventOccurrences"),
      orderBy("start", "asc")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const map = new Map<string, { eventId: string; title: string; start: Date; end: Date }>();
      for (const d of snapshot.docs) {
        const data = d.data();
        map.set(d.id, {
          eventId: data.eventId,
          title: data.title,
          start: data.start.toDate(),
          end: data.end.toDate(),
        });
      }
      setOccurrencesMap(map);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const q = query(collection(db, "events"));
    const unsub = onSnapshot(q, (snapshot) => {
      const venueMap = new Map<string, string>();
      const recMap = new Map<string, import("../types").EventRecurrence>();
      for (const d of snapshot.docs) {
        const data = d.data();
        const v = data.venue;
        if (v && typeof v === "string") venueMap.set(d.id, v);
        recMap.set(d.id, (data.recurrence as import("../types").EventRecurrence) ?? "weekly");
      }
      setVenueByEventId(venueMap);
      setRecurrenceByEventId(recMap);
    });
    return unsub;
  }, []);

  const eventSubscriptions = useMemo(() => {
    if (!user || !appUser) return [];

    const items: CalendarEvent[] = [];
    participantOccurrenceIds.forEach((occId) => {
      const occ = occurrencesMap.get(occId);
      if (!occ) return;
      const participants = participantsByOcc.get(occId) ?? [];
      items.push({
        id: occId,
        title: occ.title,
        start: occ.start,
        end: occ.end,
        resource: {
          userId: user.uid,
          userEmail: user.email ?? "",
          userName: appUser.displayName || user.displayName || "Anonymous",
          userPhotoURL: user.photoURL ?? "",
          eventId: occ.eventId,
          occurrenceId: occId,
          isEvent: true,
          venue: venueByEventId.get(occ.eventId),
          recurrence: recurrenceByEventId.get(occ.eventId),
          participants,
        },
      });
    });
    return items;
  }, [user, appUser, participantOccurrenceIds, occurrencesMap, participantsByOcc, venueByEventId, recurrenceByEventId]);

  const events = useMemo(
    () =>
      [...availabilities, ...eventSubscriptions].sort(
        (a, b) => a.start.getTime() - b.start.getTime()
      ),
    [availabilities, eventSubscriptions]
  );

  const handleSelectSlot = useCallback((slotInfo: SlotInfo) => {
    setCreateError("");
    setModal({
      ...INITIAL_MODAL,
      open: true,
      start: slotInfo.start,
      end: slotInfo.end,
    });
  }, []);

  const handleSelectEvent = useCallback((event: CalendarEvent) => {
    if (event.resource?.isEvent) {
      setSelectedEvent(event);
      setDropOffModalOpen(true);
    } else {
      setDeleteModal({ open: true, event });
    }
  }, []);

  async function handleCreateAvailability() {
    if (!user || !modal.start || !modal.end) return;

    setCreateError("");

    const count = Math.max(2, Math.min(52, modal.repeatCount || 2));
    const unit = modal.recurrence === "weekly" ? "week" : "month";

    const proposedSlots: { start: Date; end: Date }[] =
      modal.recurrence === "none"
        ? [{ start: modal.start, end: modal.end }]
        : Array.from({ length: count }, (_, i) => {
            const start = dayjs(modal.start).add(i, unit).toDate();
            const end = dayjs(modal.end).add(i, unit).toDate();
            return { start, end };
          });

    const hasOverlap = proposedSlots.some((slot) =>
      events.some((ev) =>
        rangesOverlap(slot.start, slot.end, ev.start, ev.end)
      )
    );

    if (hasOverlap) {
      setCreateError("This time slot overlaps with an existing availability. Please choose a different time.");
      return;
    }

    const base = {
      userId: user.uid,
      userEmail: user.email,
      userName: appUser?.displayName || user.displayName || "Anonymous",
      userPhotoURL: user.photoURL || "",
      title: modal.title,
      createdAt: Timestamp.now(),
    };

    if (modal.recurrence === "none") {
      await addDoc(collection(db, "availabilities"), {
        ...base,
        start: Timestamp.fromDate(modal.start),
        end: Timestamp.fromDate(modal.end),
      });
    } else {
      const groupId = crypto.randomUUID();
      const batch = writeBatch(db);

      for (let i = 0; i < count; i++) {
        const start = dayjs(modal.start).add(i, unit).toDate();
        const end = dayjs(modal.end).add(i, unit).toDate();
        const ref = doc(collection(db, "availabilities"));
        batch.set(ref, {
          ...base,
          start: Timestamp.fromDate(start),
          end: Timestamp.fromDate(end),
          recurrenceGroupId: groupId,
        });
      }

      await batch.commit();
    }
    notifyTrainers({
      type: "availability_added",
      userId: user.uid,
      userName: base.userName,
    });
    setModal(INITIAL_MODAL);
  }

  async function handleDeleteSingle() {
    if (!deleteModal.event) return;
    await deleteDoc(doc(db, "availabilities", deleteModal.event.id));
    notifyTrainers({
      type: "availability_removed",
      userId: user!.uid,
      userName: appUser?.displayName || user?.displayName || "A trainer",
    });
    setDeleteModal({ open: false });
  }

  async function handleDeleteSeries() {
    if (!deleteModal.event) return;
    const groupId = deleteModal.event.resource.recurrenceGroupId;
    if (!groupId) return;

    const q = query(
      collection(db, "availabilities"),
      where("recurrenceGroupId", "==", groupId)
    );
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    notifyTrainers({
      type: "availability_removed",
      userId: user!.uid,
      userName: appUser?.displayName || user?.displayName || "A trainer",
    });
    setDeleteModal({ open: false });
  }

  function openManualModal() {
    setCreateError("");
    const now = dayjs();
    const start = now.minute(0).second(0).add(1, "hour").toDate();
    const end = dayjs(start).add(1, "hour").toDate();
    setModal({ ...INITIAL_MODAL, open: true, start, end });
  }

  function toDatetimeLocal(d: Date): string {
    return dayjs(d).format("YYYY-MM-DDTHH:mm");
  }

  function fromDatetimeLocal(val: string): Date {
    return dayjs(val).toDate();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  const hasRecurrenceGroup = deleteModal.event?.resource.recurrenceGroupId;

  return (
    <div className="relative">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">My Schedule</h1>
        <p className="text-sm text-gray-500">
          {isTrainer ? (
            <>
              <span className="hidden sm:inline">
                Click or drag on the calendar to register your availability, or use the + button. Click an
                availability to remove it, or an event subscription to drop off.
              </span>
              <span className="sm:hidden">
                Tap an availability to remove it, an event to drop off, or use the + button to add availability.
              </span>
            </>
          ) : (
            <>
              <span className="hidden sm:inline">
                View your event subscriptions. Click an event to drop off.
              </span>
              <span className="sm:hidden">
                Tap an event to drop off.
              </span>
            </>
          )}
        </p>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <CalendarView
          events={events}
          selectable={isTrainer}
          onSelectSlot={isTrainer ? handleSelectSlot : undefined}
          onSelectEvent={handleSelectEvent}
        />
      </div>

      {/* Mobile FAB - trainers only */}
      {isTrainer && (
      <button
        onClick={openManualModal}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition hover:bg-blue-700 active:scale-95"
        aria-label="Add availability"
      >
        <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>
      )}

      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={() => { setModal(INITIAL_MODAL); setCreateError(""); }}>
          <div className="modal-backdrop absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div
            className="modal-panel relative mx-0 w-full rounded-t-3xl bg-white px-6 pb-8 pt-6 shadow-2xl sm:mx-4 sm:max-w-lg sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200 sm:hidden" />
            <h2 className="text-lg font-semibold text-gray-900">
              Register Availability
            </h2>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <div className="flex-1">
                <label htmlFor="modal-start" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                  Start
                </label>
                <input
                  id="modal-start"
                  type="datetime-local"
                  value={modal.start ? toDatetimeLocal(modal.start) : ""}
                  onChange={(e) =>
                    setModal((prev) => ({ ...prev, start: fromDatetimeLocal(e.target.value) }))
                  }
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 transition focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="modal-end" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                  End
                </label>
                <input
                  id="modal-end"
                  type="datetime-local"
                  value={modal.end ? toDatetimeLocal(modal.end) : ""}
                  onChange={(e) =>
                    setModal((prev) => ({ ...prev, end: fromDatetimeLocal(e.target.value) }))
                  }
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 transition focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            <div className="mt-4">
              <label
                htmlFor="title"
                className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400"
              >
                Label (optional)
              </label>
              <input
                id="title"
                type="text"
                value={modal.title}
                onChange={(e) =>
                  setModal((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="e.g. Morning Session"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 transition focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                Repeat
              </label>
              <div className="flex gap-2">
                {(["none", "weekly", "monthly"] as Recurrence[]).map((opt) => (
                  <button
                    key={opt}
                    onClick={() =>
                      setModal((prev) => ({ ...prev, recurrence: opt }))
                    }
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition active:scale-[0.97] ${
                      modal.recurrence === opt
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {opt === "none"
                      ? "Once"
                      : opt === "weekly"
                        ? "Weekly"
                        : "Monthly"}
                  </button>
                ))}
              </div>
            </div>

            {modal.recurrence !== "none" && (
              <div className="mt-4">
                <label
                  htmlFor="repeatCount"
                  className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400"
                >
                  Number of occurrences
                </label>
                <input
                  id="repeatCount"
                  type="number"
                  min={2}
                  max={52}
                  value={modal.repeatCount}
                  onChange={(e) =>
                    setModal((prev) => ({ ...prev, repeatCount: Number(e.target.value) }))
                  }
                  className={`w-20 rounded-xl border bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 transition focus:bg-white focus:outline-none focus:ring-2 ${
                    modal.repeatCount >= 2
                      ? "border-gray-200 focus:border-blue-400 focus:ring-blue-100"
                      : "border-red-200 focus:border-red-400 focus:ring-red-100"
                  }`}
                />
                {modal.repeatCount < 2 ? (
                  <p className="mt-1.5 text-xs text-red-400">Must be at least 2 for recurring events</p>
                ) : (
                  <p className="mt-1.5 text-xs text-gray-400">
                    Creates {modal.repeatCount} slots,{" "}
                    {modal.recurrence === "weekly" ? "one per week" : "one per month"}
                  </p>
                )}
              </div>
            )}

            {createError && (
              <p className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">
                {createError}
              </p>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => { setModal(INITIAL_MODAL); setCreateError(""); }}
                className="flex-1 rounded-xl bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 active:scale-[0.98]"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateAvailability}
                disabled={modal.recurrence !== "none" && modal.repeatCount < 2}
                className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {modal.recurrence !== "none"
                  ? `Create ${modal.repeatCount} Slots`
                  : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteModal.open && deleteModal.event && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={() => setDeleteModal({ open: false })}>
          <div className="modal-backdrop absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div
            className="modal-panel relative mx-0 w-full rounded-t-3xl bg-white px-6 pb-8 pt-6 shadow-2xl sm:mx-4 sm:max-w-md sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200 sm:hidden" />
            <h2 className="text-lg font-semibold text-gray-900">
              Remove Availability
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">
              Are you sure you want to remove availability registration?
            </p>
            <p className="mt-1 text-sm font-bold text-red-700">
              {deleteModal.event.start.toLocaleDateString()} ·{" "}
              {deleteModal.event.start.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              –{" "}
              {deleteModal.event.end.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>

            <div className="mt-6 flex flex-col gap-3">
              {hasRecurrenceGroup ? (
                <div className="flex gap-2">
                  <button
                    onClick={handleDeleteSingle}
                    className="flex-1 rounded-xl bg-amber-100 px-4 py-2.5 text-sm font-medium text-amber-700 transition hover:bg-amber-200 active:scale-[0.98]"
                  >
                    Remove This Only
                  </button>
                  <button
                    onClick={handleDeleteSeries}
                    className="flex-1 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-100 active:scale-[0.98]"
                  >
                    Remove Series
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleDeleteSingle}
                  className="w-full rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-100 active:scale-[0.98]"
                >
                  Remove
                </button>
              )}
              <button
                onClick={() => setDeleteModal({ open: false })}
                className="w-full rounded-xl bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 active:scale-[0.98]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <DropOffModal
        open={dropOffModalOpen}
        event={selectedEvent}
        onClose={() => {
          setDropOffModalOpen(false);
          setSelectedEvent(null);
        }}
        onSuccess={() => {
          setDropOffModalOpen(false);
          setSelectedEvent(null);
        }}
      />
    </div>
  );
}
