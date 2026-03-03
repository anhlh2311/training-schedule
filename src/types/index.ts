export type UserRole = "user" | "trainer" | "admin";

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
    recurrenceGroupId?: string | null;
  };
}
