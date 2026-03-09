export type UserRole = "user" | "member" | "trainer" | "admin";

export type EventVisibility = "public" | "limited";

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: UserRole;
  createdAt: Date;
  lastLoginAt: Date;
}

export interface Availability {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  title: string;
  start: Date;
  end: Date;
  createdAt: Date;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: {
    userId: string;
    userEmail: string;
    userName: string;
    userPhotoURL?: string;
    recurrenceGroupId?: string | null;
    /** When present, event represents multiple trainers in the same slot (grouped for display) */
    users?: Array<{ userId: string; userName: string; userPhotoURL?: string }>;
    /** Admin-created recurring event */
    eventId?: string;
    occurrenceId?: string;
    isEvent?: boolean;
    /** public = members can subscribe; limited = trainers only */
    visibility?: EventVisibility;
    venue?: string;
    /** For recurring events: "weekly" | "monthly"; for one-time: "none" */
    recurrence?: EventRecurrence;
    participants?: Array<{ userId: string; userName: string; userPhotoURL?: string }>;
  };
}

export type EventRecurrence = "none" | "weekly" | "monthly";

export interface EventTemplate {
  id: string;
  title: string;
  startTime: string; // "HH:mm"
  endTime: string;
  recurrence: EventRecurrence;
  count: number;
  startDate: Date;
  visibility: EventVisibility;
  venue?: string;
  createdBy: string;
  createdAt: Date;
}

export interface EventOccurrence {
  id: string;
  eventId: string;
  title: string;
  start: Date;
  end: Date;
  createdBy: string;
}

export interface EventParticipant {
  id: string;
  occurrenceId: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPhotoURL?: string;
  subscribedAt: Date;
}

export interface EventDropOff {
  id: string;
  occurrenceId: string;
  userId: string;
  userName: string;
  reason: string;
  droppedAt: Date;
}
