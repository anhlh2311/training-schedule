import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  where,
  getDocs,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";
import CalendarView from "../components/CalendarView";
import DropOffModal from "../components/DropOffModal";
import type { CalendarEvent } from "../types";

function mergeAvailabilitiesAndEvents(
  availabilities: CalendarEvent[],
  eventOccurrences: Array<{
    id: string;
    eventId: string;
    title: string;
    start: Date;
    end: Date;
  }>,
  participantsByOccurrence: Map<
    string,
    Array<{ userId: string; userName: string; userPhotoURL?: string }>
  >
): CalendarEvent[] {
  const result: CalendarEvent[] = [...availabilities];

  for (const occ of eventOccurrences) {
    const participants = participantsByOccurrence.get(occ.id) ?? [];
    result.push({
      id: occ.id,
      title: occ.title,
      start: occ.start,
      end: occ.end,
      resource: {
        userId: participants[0]?.userId ?? "",
        userEmail: "",
        userName: participants[0]?.userName ?? occ.title,
        eventId: occ.eventId,
        occurrenceId: occ.id,
        isEvent: true,
        participants,
      },
    });
  }

  return result.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export default function DashboardPage() {
  const { user, appUser, isTrainer } = useAuth();
  const [availabilities, setAvailabilities] = useState<CalendarEvent[]>([]);
  const [eventOccurrences, setEventOccurrences] = useState<
    Array<{
      id: string;
      eventId: string;
      title: string;
      start: Date;
      end: Date;
    }>
  >([]);
  const [participantsByOccurrence, setParticipantsByOccurrence] = useState<
    Map<string, Array<{ userId: string; userName: string; userPhotoURL?: string }>>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [dropOffModalOpen, setDropOffModalOpen] = useState(false);
  const [eventActionModalOpen, setEventActionModalOpen] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    const q = query(
      collection(db, "availabilities"),
      orderBy("start", "asc")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const items: CalendarEvent[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
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
    });
    return unsub;
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, "eventOccurrences"),
      orderBy("start", "asc")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          eventId: data.eventId,
          title: data.title,
          start: data.start.toDate(),
          end: data.end.toDate(),
        };
      });
      setEventOccurrences(items);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, "eventParticipants"),
      orderBy("subscribedAt", "asc")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const map = new Map<
        string,
        Array<{ userId: string; userName: string; userPhotoURL?: string }>
      >();
      for (const d of snapshot.docs) {
        const data = d.data();
        const occId = data.occurrenceId;
        const arr = map.get(occId) ?? [];
        arr.push({
          userId: data.userId,
          userName: data.userName,
          userPhotoURL: data.userPhotoURL,
        });
        map.set(occId, arr);
      }
      setParticipantsByOccurrence(map);
    });
    return unsub;
  }, []);

  const events = useMemo(
    () =>
      mergeAvailabilitiesAndEvents(
        availabilities,
        eventOccurrences,
        participantsByOccurrence
      ),
    [availabilities, eventOccurrences, participantsByOccurrence]
  );

  const loadingDone = availabilities.length >= 0;
  useEffect(() => {
    if (loadingDone) setLoading(false);
  }, [loadingDone]);

  const isParticipant = useCallback(
    (ev: CalendarEvent) => {
      if (!user || !ev.resource?.participants) return false;
      return ev.resource.participants.some((p) => p.userId === user.uid);
    },
    [user]
  );

  const handleSelectEvent = useCallback(
    (event: CalendarEvent) => {
      if (!event.resource?.isEvent) return;
      setSelectedEvent(event);
      if (isParticipant(event)) {
        setDropOffModalOpen(true);
      } else if (isTrainer) {
        setEventActionModalOpen(true);
      }
    },
    [isParticipant, isTrainer]
  );

  const handleSubscribe = useCallback(async () => {
    if (!user || !appUser || !selectedEvent?.resource?.eventId) return;
    setSubscribing(true);
    try {
      const eventId = selectedEvent.resource.eventId;
      const selectedDate = selectedEvent.start;
      const userName = appUser.displayName || user.displayName || "Anonymous";

      const occQuery = query(
        collection(db, "eventOccurrences"),
        where("eventId", "==", eventId),
        where("start", ">=", Timestamp.fromDate(selectedDate)),
        orderBy("start", "asc")
      );
      const occSnap = await getDocs(occQuery);
      const occurrences = occSnap.docs.map((d) => ({
        id: d.id,
        data: d.data(),
      }));

      const batch = writeBatch(db);
      for (const occ of occurrences) {
        const existingParticipants = participantsByOccurrence.get(occ.id) ?? [];
        if (existingParticipants.some((p) => p.userId === user.uid)) continue;

        const partRef = doc(collection(db, "eventParticipants"));
        batch.set(partRef, {
          occurrenceId: occ.id,
          userId: user.uid,
          userName,
          userEmail: user.email ?? "",
          userPhotoURL: user.photoURL ?? "",
          subscribedAt: Timestamp.now(),
        });
      }
      await batch.commit();

      setEventActionModalOpen(false);
      setSelectedEvent(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSubscribing(false);
    }
  }, [user, appUser, selectedEvent, participantsByOccurrence]);

  const handleDropOffSuccess = useCallback(() => {
    setSelectedEvent(null);
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Team Availability</h1>
        <p className="mt-1 text-sm text-gray-400">
          View all registered training sessions across the team
        </p>
      </div>
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <CalendarView events={events} onSelectEvent={handleSelectEvent} />
      </div>

      <DropOffModal
        open={dropOffModalOpen}
        event={selectedEvent}
        onClose={() => {
          setDropOffModalOpen(false);
          setSelectedEvent(null);
        }}
        onSuccess={handleDropOffSuccess}
      />

      {eventActionModalOpen && selectedEvent && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          onClick={() => {
            setEventActionModalOpen(false);
            setSelectedEvent(null);
          }}
        >
          <div className="modal-backdrop absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div
            className="modal-panel relative mx-0 w-full rounded-t-3xl bg-white px-6 pb-8 pt-6 shadow-2xl sm:mx-4 sm:max-w-md sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200 sm:hidden" />
            <h2 className="text-lg font-semibold text-gray-900">
              {selectedEvent.title}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Subscribing will add you to this occurrence and all future ones in the series.
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {selectedEvent.start.toLocaleDateString()} ·{" "}
              {selectedEvent.start.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              –{" "}
              {selectedEvent.end.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            {selectedEvent.resource?.participants && selectedEvent.resource.participants.length > 0 && (
              <p className="mt-2 text-sm text-gray-600">
                Participants:{" "}
                {selectedEvent.resource.participants
                  .map((p) => p.userName)
                  .join(", ")}
              </p>
            )}
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  setEventActionModalOpen(false);
                  setSelectedEvent(null);
                }}
                className="flex-1 rounded-xl bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSubscribe}
                disabled={subscribing}
                className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
              >
                {subscribing ? "Subscribing…" : "Subscribe"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
