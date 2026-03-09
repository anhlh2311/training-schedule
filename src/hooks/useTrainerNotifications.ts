import { useEffect, useRef } from "react";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  limit,
  type DocumentChange,
} from "firebase/firestore";
import { db } from "../lib/firebase";

/**
 * When the app tab is open, listen to availability and event participant changes
 * and show a browser notification when another user adds/removes availability
 * or subscribes/drops off from an event. Complements push (FCM) when tab is closed.
 */
export function useTrainerNotifications(
  userId: string | null,
  enabled: boolean
) {
  const initialLoad = useRef({ avail: true, part: true });

  useEffect(() => {
    if (!userId || !enabled || typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    initialLoad.current = { avail: true, part: true };

    const showNotification = (title: string, body: string) => {
      try {
        new Notification(title, {
          body,
          icon: "/IHN.png",
          tag: "training-schedule-inline",
        });
      } catch {
        // ignore
      }
    };

    const availUnsub = onSnapshot(
      query(
        collection(db, "availabilities"),
        orderBy("createdAt", "desc"),
        limit(50)
      ),
      (snapshot) => {
        if (initialLoad.current.avail) {
          initialLoad.current.avail = false;
          return;
        }
        snapshot.docChanges().forEach((change: DocumentChange) => {
          if (change.type !== "added" && change.type !== "removed") return;
          const data = change.doc.data();
          if (data.userId === userId) return;
          const msg =
            change.type === "added"
              ? `${data.userName ?? "A trainer"} added availability.`
              : `${data.userName ?? "A trainer"} removed availability.`;
          showNotification("Availability updated", msg);
        });
      }
    );

    const partUnsub = onSnapshot(
      query(
        collection(db, "eventParticipants"),
        orderBy("subscribedAt", "desc"),
        limit(50)
      ),
      (snapshot) => {
        if (initialLoad.current.part) {
          initialLoad.current.part = false;
          return;
        }
        snapshot.docChanges().forEach((change: DocumentChange) => {
          if (change.type !== "added" && change.type !== "removed") return;
          const data = change.doc.data();
          if (data.userId === userId) return;
          const msg =
            change.type === "added"
              ? `${data.userName ?? "A trainer"} joined an event.`
              : `${data.userName ?? "A trainer"} dropped off from an event.`;
          showNotification("Event update", msg);
        });
      }
    );

    return () => {
      availUnsub();
      partUnsub();
    };
  }, [userId, enabled]);
}
