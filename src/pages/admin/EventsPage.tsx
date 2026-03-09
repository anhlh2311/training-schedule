import { useCallback, useEffect, useState } from "react";
import {
  collection,
  addDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  where,
  writeBatch,
  updateDoc,
  Timestamp,
  deleteDoc,
} from "firebase/firestore";
import dayjs from "dayjs";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import type { EventTemplate, EventRecurrence, EventVisibility } from "../../types";

interface InferredRecurrence {
  recurrence: EventRecurrence;
  count: number;
}

interface SlotTrainer {
  userId: string;
  userName: string;
  userEmail: string;
  userPhotoURL?: string;
}

interface SlotOccurrence {
  start: Date;
  end: Date;
  trainers: SlotTrainer[];
}

interface BookedSlot {
  key: string;
  start: Date;
  end: Date;
  title?: string;
  trainers: SlotTrainer[];
  /** Inferred from trainers' recurrence groups (availabilities) or parent event (occurrences). */
  inferredRecurrence?: InferredRecurrence;
  /** Availability doc IDs to delete when converting (avail slots only). */
  availabilityDocIds?: string[];
  /** Per-occurrence trainers for conversion (avail slots only). */
  occurrences?: SlotOccurrence[];
  /** Internal: used during build to compute inferredRecurrence, then removed. */
  recurrenceGroupIds?: string[];
}

function toDate(v: unknown): Date {
  if (!v) return new Date();
  if (typeof v === "object" && v !== null && "toDate" in v) return (v as { toDate: () => Date }).toDate();
  return new Date(v as number);
}

/** Build recurrence info per recurrenceGroupId from all availability docs. */
function buildRecurrenceByGroupId(
  availDocs: Array<{ id: string; data: Record<string, unknown> }>
): Map<string, InferredRecurrence> {
  const byGroup = new Map<string, Array<{ start: Date }>>();
  for (const d of availDocs) {
    const gid = d.data.recurrenceGroupId as string | undefined;
    if (!gid) continue;
    const start = toDate(d.data.start);
    const arr = byGroup.get(gid) ?? [];
    arr.push({ start });
    byGroup.set(gid, arr);
  }
  const result = new Map<string, InferredRecurrence>();
  for (const [gid, arr] of byGroup) {
    if (arr.length < 2) {
      result.set(gid, { recurrence: "weekly", count: 1 });
      continue;
    }
    const sorted = [...arr].sort((a, b) => a.start.getTime() - b.start.getTime());
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(dayjs(sorted[i].start).diff(dayjs(sorted[i - 1].start), "day"));
    }
    const medianGap = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] ?? 7;
    const recurrence: EventRecurrence = medianGap <= 10 ? "weekly" : "monthly";
    result.set(gid, { recurrence, count: arr.length });
  }
  return result;
}

function buildBookedSlots(
  availDocs: Array<{ id: string; data: Record<string, unknown> }>,
  occurrences: Array<{ id: string; eventId: string; start: Date; end: Date; title: string }>,
  participantsByOcc: Map<string, Array<{ userId: string; userName: string; userEmail: string; userPhotoURL?: string }>>,
  eventsById: Map<string, { recurrence: EventRecurrence; count: number }>,
  recurrenceByGroupId: Map<string, InferredRecurrence>
): BookedSlot[] {
  const result: BookedSlot[] = [];

  // From availabilities: build slot SERIES (group by dayOfWeek + time)
  const seriesByTemplate = new Map<
    string,
    { docs: Array<{ id: string; data: Record<string, unknown> }>; byOcc: Map<number, SlotTrainer[]> }
  >();

  for (const d of availDocs) {
    const data = d.data;
    const start = toDate(data.start);
    const end = toDate(data.end);
    const templateKey = `${dayjs(start).day()}-${dayjs(start).format("HH:mm")}-${dayjs(end).format("HH:mm")}`;
    const occKey = start.getTime();
    const trainer: SlotTrainer = {
      userId: data.userId as string,
      userName: data.userName as string,
      userEmail: data.userEmail as string,
      userPhotoURL: data.userPhotoURL as string | undefined,
    };

    let series = seriesByTemplate.get(templateKey);
    if (!series) {
      series = { docs: [], byOcc: new Map() };
      seriesByTemplate.set(templateKey, series);
    }
    series.docs.push(d);
    const occTrainers = series.byOcc.get(occKey) ?? [];
    if (!occTrainers.some((t) => t.userId === trainer.userId)) occTrainers.push(trainer);
    series.byOcc.set(occKey, occTrainers);
  }

  for (const [templateKey, series] of seriesByTemplate) {
    const sortedOccs = Array.from(series.byOcc.entries()).sort((a, b) => a[0] - b[0]);
    if (sortedOccs.length === 0) continue;

    const firstStart = new Date(sortedOccs[0][0]);
    const firstEnd = toDate(series.docs[0].data.end);
    const durationMs = firstEnd.getTime() - firstStart.getTime();
    const groupIds = [...new Set(series.docs.map((d) => d.data.recurrenceGroupId).filter(Boolean))] as string[];
    const recurrences = groupIds
      .map((gid) => recurrenceByGroupId.get(gid))
      .filter((r): r is InferredRecurrence => !!r);
    const inferredRecurrence = recurrences.length > 0
      ? recurrences.reduce((a, b) => (b.count > a.count ? b : a))
      : { recurrence: "weekly" as EventRecurrence, count: sortedOccs.length };

    const slotOccurrences: SlotOccurrence[] = sortedOccs.map(([occKey, trainers]) => {
      const start = new Date(occKey);
      const end = new Date(occKey + durationMs);
      return { start, end, trainers };
    });

    const allTrainers = new Map<string, SlotTrainer>();
    slotOccurrences.forEach((occ) =>
      occ.trainers.forEach((t) => allTrainers.set(t.userId, t))
    );

    result.push({
      key: `avail-${templateKey}`,
      start: firstStart,
      end: firstEnd,
      trainers: Array.from(allTrainers.values()),
      inferredRecurrence,
      availabilityDocIds: series.docs.map((d) => d.id),
      occurrences: slotOccurrences,
    });
  }

  // From event occurrences (admin events with subscribed trainers) - not converted, just listed
  for (const occ of occurrences) {
    const participants = participantsByOcc.get(occ.id) ?? [];
    if (participants.length === 0) continue;
    const key = `occ-${occ.id}`;
    const eventRecurrence = eventsById.get(occ.eventId);
    result.push({
      key,
      start: occ.start,
      end: occ.end,
      title: occ.title,
      trainers: participants.map((p) => ({
        userId: p.userId,
        userName: p.userName,
        userEmail: p.userEmail ?? "",
        userPhotoURL: p.userPhotoURL,
      })),
      inferredRecurrence: eventRecurrence ?? undefined,
    });
  }

  return result.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export default function EventsPage() {
  const { user, isAdmin } = useAuth();
  const [templates, setTemplates] = useState<EventTemplate[]>([]);
  const [bookedSlots, setBookedSlots] = useState<BookedSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventTemplate | null>(null);
  const [fromSlotModal, setFromSlotModal] = useState(false);
  const [form, setForm] = useState({
    title: "",
    startDate: dayjs().format("YYYY-MM-DD"),
    startTime: "09:00",
    endTime: "10:00",
    recurrence: "none" as EventRecurrence,
    count: 1,
    visibility: "limited" as EventVisibility,
    venue: "",
  });
  const [selectedSlot, setSelectedSlot] = useState<BookedSlot | null>(null);
  const [createError, setCreateError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "events"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setTemplates(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: data.title,
            startTime: data.startTime,
            endTime: data.endTime,
            recurrence: (data.recurrence as EventRecurrence) ?? "weekly",
            count: data.count ?? 1,
            startDate: data.startDate.toDate(),
            visibility: (data.visibility as EventVisibility) ?? "limited",
            venue: data.venue ?? "",
            createdBy: data.createdBy,
            createdAt: data.createdAt.toDate(),
          };
        })
      );
    });
    return unsub;
  }, []);

  const loadBookedSlots = useCallback(async () => {
    let availDocs: Array<{ id: string; data: Record<string, unknown> }> = [];
    let occurrences: Array<{ id: string; eventId: string; start: Date; end: Date; title: string }> = [];
    const participantsByOcc = new Map<
      string,
      Array<{ userId: string; userName: string; userEmail: string; userPhotoURL?: string }>
    >();
    const eventsById = new Map<string, { recurrence: EventRecurrence; count: number }>();

    try {
      availDocs = (await getDocs(query(collection(db, "availabilities"), orderBy("start", "asc"))))
        .docs.map((d) => ({ id: d.id, data: d.data() ?? {} }));
    } catch (err) {
      console.warn("Failed to load availabilities:", err);
    }

    try {
      const [occSnap, partSnap, eventsSnap] = await Promise.all([
        getDocs(query(collection(db, "eventOccurrences"), orderBy("start", "asc"))),
        getDocs(collection(db, "eventParticipants")),
        getDocs(collection(db, "events")),
      ]);

      occurrences = occSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          eventId: data.eventId ?? "",
          start: data.start?.toDate?.() ?? new Date(),
          end: data.end?.toDate?.() ?? new Date(),
          title: data.title ?? "",
        };
      });

      for (const d of partSnap.docs) {
        const data = d.data();
        const occId = data.occurrenceId;
        const arr = participantsByOcc.get(occId) ?? [];
        arr.push({
          userId: data.userId,
          userName: data.userName,
          userEmail: data.userEmail ?? "",
          userPhotoURL: data.userPhotoURL,
        });
        participantsByOcc.set(occId, arr);
      }

      for (const d of eventsSnap.docs) {
        const data = d.data();
        eventsById.set(d.id, {
          recurrence: data.recurrence ?? "weekly",
          count: data.count ?? 1,
        });
      }
    } catch (err) {
      console.warn("Failed to load event occurrences/participants:", err);
    }

    const recurrenceByGroupId = buildRecurrenceByGroupId(availDocs);
    const slots = buildBookedSlots(availDocs, occurrences, participantsByOcc, eventsById, recurrenceByGroupId);
    setBookedSlots(slots);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadBookedSlots();
  }, [loadBookedSlots]);

  useEffect(() => {
    if (fromSlotModal) {
      loadBookedSlots();
    }
  }, [fromSlotModal, loadBookedSlots]);

  const handleCreateRecurring = useCallback(async () => {
    if (!user || !form.title.trim()) return;
    setCreateError("");
    setSubmitting(true);
    try {
      const startDate = dayjs(form.startDate).startOf("day");
      const isOneTime = form.recurrence === "none";
      const count = isOneTime ? 1 : Math.max(1, Math.min(52, form.count));
      const unit = form.recurrence === "weekly" ? "week" : form.recurrence === "monthly" ? "month" : "day";

      const eventRef = await addDoc(collection(db, "events"), {
        title: form.title.trim(),
        startTime: form.startTime,
        endTime: form.endTime,
        recurrence: form.recurrence,
        count,
        startDate: Timestamp.fromDate(startDate.toDate()),
        visibility: form.visibility,
        venue: form.venue.trim() || null,
        createdBy: user.uid,
        createdAt: Timestamp.now(),
      });

      const batch = writeBatch(db);
      for (let i = 0; i < count; i++) {
        const occStart = startDate.add(i, unit);
        const [sh, sm] = form.startTime.split(":").map(Number);
        const [eh, em] = form.endTime.split(":").map(Number);
        const start = occStart.hour(sh).minute(sm).second(0).toDate();
        const end = occStart.hour(eh).minute(em).second(0).toDate();

        const occRef = doc(collection(db, "eventOccurrences"));
        batch.set(occRef, {
          eventId: eventRef.id,
          title: form.title.trim(),
          start: Timestamp.fromDate(start),
          end: Timestamp.fromDate(end),
          createdBy: user.uid,
        });
      }
      await batch.commit();
      setCreateModal(false);
      setForm({
        title: "",
        startDate: dayjs().format("YYYY-MM-DD"),
        startTime: "09:00",
        endTime: "10:00",
        recurrence: "none",
        count: 1,
        visibility: "limited",
        venue: "",
      });
    } catch (err) {
      setCreateError("Failed to create event");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }, [user, form]);

  const handleCreateFromSlot = useCallback(async () => {
    if (!user || !selectedSlot || !form.title.trim()) return;
    setCreateError("");
    setSubmitting(true);
    const { recurrence, count } = selectedSlot.inferredRecurrence ?? {
      recurrence: form.recurrence === "none" ? "weekly" : form.recurrence,
      count: form.recurrence === "none" ? 1 : form.count,
    };
    const finalCount = selectedSlot.occurrences?.length ?? Math.max(1, Math.min(52, count));
    const unit = recurrence === "weekly" ? "week" : recurrence === "monthly" ? "month" : "day";
    const [sh, sm] = dayjs(selectedSlot.start).format("HH:mm").split(":").map(Number);
    const [eh, em] = dayjs(selectedSlot.end).format("HH:mm").split(":").map(Number);

    try {
      // Convert: delete original availabilities (avail slots only)
      if (selectedSlot.availabilityDocIds?.length) {
        for (const id of selectedSlot.availabilityDocIds) {
          await deleteDoc(doc(db, "availabilities", id));
        }
      }

      const eventRef = await addDoc(collection(db, "events"), {
        title: form.title.trim(),
        startTime: dayjs(selectedSlot.start).format("HH:mm"),
        endTime: dayjs(selectedSlot.end).format("HH:mm"),
        recurrence: finalCount === 1 ? "none" : recurrence,
        count: finalCount,
        startDate: Timestamp.fromDate(selectedSlot.start),
        visibility: form.visibility,
        venue: form.venue.trim() || null,
        createdBy: user.uid,
        createdAt: Timestamp.now(),
      });

      const batch = writeBatch(db);

      if (selectedSlot.occurrences?.length) {
        // Convert: use actual occurrences and subscribe each trainer to their registered instances
        for (const occ of selectedSlot.occurrences) {
          const occRef = doc(collection(db, "eventOccurrences"));
          batch.set(occRef, {
            eventId: eventRef.id,
            title: form.title.trim(),
            start: Timestamp.fromDate(occ.start),
            end: Timestamp.fromDate(occ.end),
            createdBy: user.uid,
          });
          for (const t of occ.trainers) {
            const partRef = doc(collection(db, "eventParticipants"));
            batch.set(partRef, {
              occurrenceId: occRef.id,
              userId: t.userId,
              userName: t.userName,
              userEmail: t.userEmail,
              userPhotoURL: t.userPhotoURL ?? "",
              subscribedAt: Timestamp.now(),
            });
          }
        }
      } else {
        // Event-occurrence slot or fallback: create occurrences, subscribe all to first only
        const startDate = dayjs(selectedSlot.start).startOf("day");
        for (let i = 0; i < finalCount; i++) {
          const occStart = startDate.add(i, unit);
          const start = occStart.hour(sh).minute(sm).second(0).toDate();
          const end = occStart.hour(eh).minute(em).second(0).toDate();

          const occRef = doc(collection(db, "eventOccurrences"));
          batch.set(occRef, {
            eventId: eventRef.id,
            title: form.title.trim(),
            start: Timestamp.fromDate(start),
            end: Timestamp.fromDate(end),
            createdBy: user.uid,
          });
          if (i === 0) {
            for (const t of selectedSlot.trainers) {
              const partRef = doc(collection(db, "eventParticipants"));
              batch.set(partRef, {
                occurrenceId: occRef.id,
                userId: t.userId,
                userName: t.userName,
                userEmail: t.userEmail,
                userPhotoURL: t.userPhotoURL ?? "",
                subscribedAt: Timestamp.now(),
              });
            }
          }
        }
      }

      await batch.commit();

      await loadBookedSlots();
      setFromSlotModal(false);
      setSelectedSlot(null);
      setForm({
        title: "",
        startDate: dayjs().format("YYYY-MM-DD"),
        startTime: "09:00",
        endTime: "10:00",
        recurrence: "none",
        count: 1,
        visibility: "limited",
        venue: "",
      });
    } catch (err) {
      setCreateError("Failed to create event from slot");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }, [user, selectedSlot, form, loadBookedSlots]);

  const handleUpdateEvent = useCallback(async () => {
    if (!user || !editingEvent || !form.title.trim()) return;
    setCreateError("");
    setSubmitting(true);
    const isOneTime = form.recurrence === "none";
    const count = isOneTime ? 1 : Math.max(1, Math.min(52, form.count));
    const unit = form.recurrence === "weekly" ? "week" : form.recurrence === "monthly" ? "month" : "day";
    const startDate = dayjs(form.startDate).startOf("day");
    const [sh, sm] = form.startTime.split(":").map(Number);
    const [eh, em] = form.endTime.split(":").map(Number);

    try {
      await updateDoc(doc(db, "events", editingEvent.id), {
        title: form.title.trim(),
        startTime: form.startTime,
        endTime: form.endTime,
        recurrence: form.recurrence,
        count,
        startDate: Timestamp.fromDate(startDate.toDate()),
        visibility: form.visibility,
        venue: form.venue.trim() || null,
      });

      const occSnap = await getDocs(
        query(
          collection(db, "eventOccurrences"),
          where("eventId", "==", editingEvent.id),
          orderBy("start", "asc")
        )
      );
      const occurrences = occSnap.docs.map((d) => ({
        id: d.id,
        start: d.data().start?.toDate?.() ?? new Date(),
      }));

      const batch = writeBatch(db);

      if (occurrences.length > count) {
        for (let i = count; i < occurrences.length; i++) {
          batch.delete(doc(db, "eventOccurrences", occurrences[i].id));
        }
      }

      const toUpdate = occurrences.slice(0, Math.min(occurrences.length, count));
      for (let i = 0; i < toUpdate.length; i++) {
        const occStart = startDate.add(i, unit);
        const start = occStart.hour(sh).minute(sm).second(0).toDate();
        const end = occStart.hour(eh).minute(em).second(0).toDate();
        batch.update(doc(db, "eventOccurrences", toUpdate[i].id), {
          title: form.title.trim(),
          start: Timestamp.fromDate(start),
          end: Timestamp.fromDate(end),
        });
      }

      if (occurrences.length < count) {
        for (let i = occurrences.length; i < count; i++) {
          const occStart = startDate.add(i, unit);
          const start = occStart.hour(sh).minute(sm).second(0).toDate();
          const end = occStart.hour(eh).minute(em).second(0).toDate();
          const occRef = doc(collection(db, "eventOccurrences"));
          batch.set(occRef, {
            eventId: editingEvent.id,
            title: form.title.trim(),
            start: Timestamp.fromDate(start),
            end: Timestamp.fromDate(end),
            createdBy: user.uid,
          });
        }
      }

      await batch.commit();

      setEditModal(false);
      setEditingEvent(null);
      setForm({
        title: "",
        startDate: dayjs().format("YYYY-MM-DD"),
        startTime: "09:00",
        endTime: "10:00",
        recurrence: "none",
        count: 1,
        visibility: "limited",
        venue: "",
      });
    } catch (err) {
      setCreateError("Failed to update event");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }, [user, editingEvent, form]);

  if (!isAdmin) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500">Access denied. Admin only.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Events</h1>
          <p className="mt-1 text-sm text-gray-400">
            Create and manage recurring training events
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setCreateError("");
              setCreateModal(true);
            }}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
          >
            Create event
          </button>
          <button
            onClick={() => {
              setCreateError("");
              setFromSlotModal(true);
              setForm((f) => ({ ...f, title: "" }));
            }}
            className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-orange-600"
          >
            Convert booked slot
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        {templates.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">
            No events yet. Create a recurring event or convert a booked slot.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {templates.map((t) => (
              <li key={t.id} className="px-6 py-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{t.title}</p>
                    <p className="text-sm text-gray-500">
                      {t.startTime} – {t.endTime}
                      {(t.recurrence ?? "weekly") === "none"
                        ? " · One-time"
                        : ` · ${t.recurrence} · ${t.count} occurrence${t.count !== 1 ? "s" : ""}`}
                      {(t.visibility ?? "limited") === "public" && (
                        <span className="ml-1.5 rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700">
                          Public
                        </span>
                      )}
                      {t.venue && (
                        <span className="ml-1.5 text-gray-400">· {t.venue}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">
                      From {dayjs(t.startDate).format("D MMM YYYY")}
                    </span>
                    <button
                      onClick={() => {
                        setCreateError("");
                        setEditingEvent(t);
                        setForm({
                          title: t.title,
                          startDate: dayjs(t.startDate).format("YYYY-MM-DD"),
                          startTime: t.startTime,
                          endTime: t.endTime,
                          recurrence: t.recurrence ?? "weekly",
                          count: t.count ?? 1,
                          visibility: t.visibility ?? "limited",
                          venue: t.venue ?? "",
                        });
                        setEditModal(true);
                      }}
                      className="rounded-lg px-3 py-1.5 text-sm font-medium text-blue-600 transition hover:bg-blue-50"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Create recurring modal */}
      {createModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          onClick={() => {
            setCreateModal(false);
            setCreateError("");
          }}
        >
          <div className="modal-backdrop absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div
            className="modal-panel relative mx-0 w-full max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white px-6 pb-8 pt-6 shadow-2xl sm:mx-4 sm:max-w-lg sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200 sm:hidden" />
            <h2 className="text-lg font-semibold text-gray-900">
              Create event
            </h2>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                Title
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Weekly Training"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="mt-4 flex gap-4">
              <div className="flex-1">
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                  Start date
                </label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                  Time
                </label>
                <div className="flex gap-2">
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                    className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                    className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                Recurrence
              </label>
              <div className="flex flex-wrap gap-2">
                {(["none", "weekly", "monthly"] as EventRecurrence[]).map((opt) => (
                  <button
                    key={opt}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        recurrence: opt,
                        count: opt === "none" ? 1 : f.count,
                      }))
                    }
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                      form.recurrence === opt
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {opt === "none" ? "One-time" : opt === "weekly" ? "Weekly" : "Monthly"}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                Visibility
              </label>
              <div className="flex gap-2">
                {(["public", "limited"] as EventVisibility[]).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setForm((f) => ({ ...f, visibility: opt }))}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                      form.visibility === opt
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {opt === "public" ? "Public" : "Limited"}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-gray-400">
                Public: members can subscribe. Limited: trainers only.
              </p>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                Venue (optional)
              </label>
              <input
                type="text"
                value={form.venue}
                onChange={(e) => setForm((f) => ({ ...f, venue: e.target.value }))}
                placeholder="e.g. Room 101, Main Hall"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {form.recurrence !== "none" && (
              <div className="mt-4">
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                  Number of occurrences
                </label>
                <input
                  type="number"
                  min={1}
                  max={52}
                  value={form.count}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, count: Number(e.target.value) }))
                  }
                  className="w-24 rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
            )}

            {createError && (
              <p className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">
                {createError}
              </p>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  setCreateModal(false);
                  setCreateError("");
                }}
                className="flex-1 rounded-xl bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRecurring}
                disabled={!form.title.trim() || submitting}
                className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting
                  ? "Creating…"
                  : form.recurrence === "none"
                    ? "Create event"
                    : `Create ${form.count} occurrences`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit event modal */}
      {editModal && editingEvent && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          onClick={() => {
            setEditModal(false);
            setEditingEvent(null);
            setCreateError("");
          }}
        >
          <div className="modal-backdrop absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div
            className="modal-panel relative mx-0 w-full max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white px-6 pb-8 pt-6 shadow-2xl sm:mx-4 sm:max-w-lg sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200 sm:hidden" />
            <h2 className="text-lg font-semibold text-gray-900">
              Edit event
            </h2>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                Title
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Weekly Training"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="mt-4 flex gap-4">
              <div className="flex-1">
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                  Start date
                </label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                  Time
                </label>
                <div className="flex gap-2">
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                    className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                    className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                Recurrence
              </label>
              <div className="flex flex-wrap gap-2">
                {(["none", "weekly", "monthly"] as EventRecurrence[]).map((opt) => (
                  <button
                    key={opt}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        recurrence: opt,
                        count: opt === "none" ? 1 : f.count,
                      }))
                    }
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                      form.recurrence === opt
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {opt === "none" ? "One-time" : opt === "weekly" ? "Weekly" : "Monthly"}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                Visibility
              </label>
              <div className="flex gap-2">
                {(["public", "limited"] as EventVisibility[]).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setForm((f) => ({ ...f, visibility: opt }))}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                      form.visibility === opt
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {opt === "public" ? "Public" : "Limited"}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                Venue (optional)
              </label>
              <input
                type="text"
                value={form.venue}
                onChange={(e) => setForm((f) => ({ ...f, venue: e.target.value }))}
                placeholder="e.g. Room 101, Main Hall"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {form.recurrence !== "none" && (
              <div className="mt-4">
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                  Number of occurrences
                </label>
                <input
                  type="number"
                  min={1}
                  max={52}
                  value={form.count}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, count: Number(e.target.value) }))
                  }
                  className="w-24 rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
            )}

            {createError && (
              <p className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">
                {createError}
              </p>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  setEditModal(false);
                  setEditingEvent(null);
                  setCreateError("");
                }}
                className="flex-1 rounded-xl bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateEvent}
                disabled={!form.title.trim() || submitting}
                className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "Updating…" : form.recurrence === "none" ? "Update event" : "Update event"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create from slot modal */}
      {fromSlotModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          onClick={() => {
            setFromSlotModal(false);
            setSelectedSlot(null);
            setCreateError("");
          }}
        >
          <div className="modal-backdrop absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div
            className="modal-panel relative mx-0 w-full max-h-[90vh] overflow-y-auto rounded-t-3xl bg-white px-6 pb-8 pt-6 shadow-2xl sm:mx-4 sm:max-w-lg sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200 sm:hidden" />
            <h2 className="text-lg font-semibold text-gray-900">
              Convert booked slot to event
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              The slot will be converted (availabilities removed) and trainers subscribed to their registered instances
            </p>

            <div className="mt-4 max-h-48 overflow-y-auto rounded-xl border border-gray-100">
              {bookedSlots.filter((s) => s.availabilityDocIds?.length).length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">
                  No availability slots to convert
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {bookedSlots
                    .filter((s) => s.availabilityDocIds?.length)
                    .map((slot) => {
                    const isSelected = selectedSlot?.key === slot.key;
                    return (
                      <li key={slot.key}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSlot(slot);
                            setForm((f) => ({
                              ...f,
                              title: slot.title ?? "",
                              startDate: dayjs(slot.start).format("YYYY-MM-DD"),
                              startTime: dayjs(slot.start).format("HH:mm"),
                              endTime: dayjs(slot.end).format("HH:mm"),
                            }));
                          }}
                          className={`w-full px-4 py-3 text-left transition ${
                            isSelected ? "bg-blue-50" : "hover:bg-gray-50"
                          }`}
                        >
                          <p className="font-medium text-gray-900">
                            {dayjs(slot.start).format("ddd D MMM")} ·{" "}
                            {dayjs(slot.start).format("HH:mm")} –{" "}
                            {dayjs(slot.end).format("HH:mm")}
                            {slot.title && (
                              <span className="ml-1.5 text-gray-500">· {slot.title}</span>
                            )}
                            {slot.occurrences && slot.occurrences.length > 1 && (
                              <span className="ml-1.5 text-gray-500">
                                · {slot.occurrences.length} occurrences
                              </span>
                            )}
                          </p>
                          <p className="text-sm text-gray-500">
                            {slot.trainers.map((t) => t.userName).join(", ")}
                          </p>
                          {slot.inferredRecurrence && (
                            <p className="mt-0.5 text-xs text-blue-600">
                              {slot.inferredRecurrence.recurrence} · {slot.occurrences?.length ?? slot.inferredRecurrence.count}×
                            </p>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {selectedSlot && (
              <>
                <div className="mt-4">
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                    Event title
                  </label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, title: e.target.value }))
                    }
                    placeholder="e.g. Training Session"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div className="mt-4">
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                    Visibility
                  </label>
                  <div className="flex gap-2">
                    {(["public", "limited"] as EventVisibility[]).map((opt) => (
                      <button
                        key={opt}
                        onClick={() => setForm((f) => ({ ...f, visibility: opt }))}
                        className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                          form.visibility === opt
                            ? "bg-blue-600 text-white shadow-sm"
                            : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                        }`}
                      >
                        {opt === "public" ? "Public" : "Limited"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-4">
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                    Venue (optional)
                  </label>
                  <input
                    type="text"
                    value={form.venue}
                    onChange={(e) => setForm((f) => ({ ...f, venue: e.target.value }))}
                    placeholder="e.g. Room 101, Main Hall"
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                {selectedSlot.inferredRecurrence ? (
                  <div className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
                    <p className="font-medium">Using recurrence from trainers</p>
                    <p className="mt-0.5 text-blue-700">
                      {selectedSlot.inferredRecurrence.recurrence === "weekly" ? "Weekly" : "Monthly"} ·{" "}
                      {selectedSlot.occurrences?.length ?? selectedSlot.inferredRecurrence.count} occurrence{(selectedSlot.occurrences?.length ?? selectedSlot.inferredRecurrence.count) !== 1 ? "s" : ""}
                    </p>
                    {selectedSlot.availabilityDocIds?.length ? (
                      <p className="mt-1 text-xs text-blue-600">
                        {selectedSlot.availabilityDocIds.length} availability slot(s) will be removed and converted to this event. Each trainer is subscribed to their registered instances.
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-blue-600">
                        Each trainer is subscribed to their registered instances.
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="mt-4">
                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                        Recurrence
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {(["none", "weekly", "monthly"] as EventRecurrence[]).map((opt) => (
                          <button
                            key={opt}
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                recurrence: opt,
                                count: opt === "none" ? 1 : f.count,
                              }))
                            }
                            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                              form.recurrence === opt
                                ? "bg-blue-600 text-white shadow-sm"
                                : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                            }`}
                          >
                            {opt === "none" ? "One-time" : opt === "weekly" ? "Weekly" : "Monthly"}
                          </button>
                        ))}
                      </div>
                    </div>
                    {form.recurrence !== "none" && (
                      <div className="mt-4">
                        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
                          Number of occurrences
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={52}
                          value={form.count}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, count: Number(e.target.value) }))
                          }
                          className="w-24 rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          Trainers from this slot will be participants for the first occurrence only
                        </p>
                      </div>
                    )}
                  </>
                )}
                {createError && (
                  <p className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">
                    {createError}
                  </p>
                )}
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => {
                      setFromSlotModal(false);
                      setSelectedSlot(null);
                      setCreateError("");
                    }}
                    className="flex-1 rounded-xl bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateFromSlot}
                    disabled={!form.title.trim() || submitting}
                    className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    {submitting
                      ? "Creating…"
                      : form.recurrence === "none" || (selectedSlot.inferredRecurrence?.count ?? form.count) === 1
                        ? "Create event"
                        : `Create ${selectedSlot.inferredRecurrence?.count ?? form.count} occurrences`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
