import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../lib/firebase";
import CalendarView from "../components/CalendarView";
import type { CalendarEvent } from "../types";

export default function DashboardPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, "availabilities"),
      orderBy("start", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
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
      setEvents(items);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
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
        <CalendarView events={events} />
      </div>
    </div>
  );
}
