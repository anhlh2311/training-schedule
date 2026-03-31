import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  type DocumentData,
  type DocumentReference,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";

export interface SyncDisplayNamesResult {
  usersProcessed: number;
  availabilitiesUpdated: number;
  participantsUpdated: number;
  dropOffsUpdated: number;
}

const BATCH_LIMIT = 450;

function norm(s: unknown): string {
  return typeof s === "string" ? s : "";
}

function displayNameFromUser(data: DocumentData): string {
  const v = data.displayName;
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return "Anonymous";
}

function stringField(data: DocumentData, key: string): string {
  const v = data[key];
  return typeof v === "string" ? v : "";
}

function patchFromUserDoc(data: DocumentData): DenormalizedProfilePatch {
  return {
    userName: displayNameFromUser(data),
    userPhotoURL: stringField(data, "photoURL"),
    userEmail: stringField(data, "email"),
  };
}

export interface DenormalizedProfilePatch {
  userName: string;
  userPhotoURL: string;
  userEmail: string;
}

function availabilityMismatch(d: DocumentData, p: DenormalizedProfilePatch): boolean {
  return (
    norm(d.userName) !== p.userName ||
    norm(d.userPhotoURL) !== p.userPhotoURL ||
    norm(d.userEmail) !== p.userEmail
  );
}

function participantMismatch(d: DocumentData, p: DenormalizedProfilePatch): boolean {
  return (
    norm(d.userName) !== p.userName ||
    norm(d.userPhotoURL) !== p.userPhotoURL ||
    norm(d.userEmail) !== p.userEmail
  );
}

function dropOffMismatch(d: DocumentData, p: DenormalizedProfilePatch): boolean {
  return norm(d.userName) !== p.userName;
}

function tsToLocale(d: DocumentData, key: string): string {
  const v = d[key];
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    try {
      return (v as { toDate: () => Date }).toDate().toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return "";
    }
  }
  return "";
}

function availabilityLabel(d: DocumentData): string {
  const title = typeof d.title === "string" ? d.title : "Availability";
  const start = tsToLocale(d, "start");
  return start ? `${title} · ${start}` : title;
}

async function occurrenceTitleLine(occurrenceId: string): Promise<string> {
  if (!occurrenceId) return "";
  try {
    const snap = await getDoc(doc(db, "eventOccurrences", occurrenceId));
    if (!snap.exists()) return "";
    const o = snap.data();
    const title = typeof o.title === "string" ? o.title : "Event";
    const start = tsToLocale(o, "start");
    return start ? `${title} · ${start}` : title;
  } catch {
    return "";
  }
}

export type UnsyncedEntryKind = "availability" | "participant" | "dropOff";

export interface UnsyncedEntry {
  kind: UnsyncedEntryKind;
  id: string;
  /** One-line description for the admin list */
  label: string;
  /** What differs (short) */
  mismatchHint: string;
}

export interface UserWithUnsyncSummary {
  uid: string;
  displayName: string;
  email: string;
  outOfSyncCount: number;
}

async function commitUpdates(
  docs: QueryDocumentSnapshot<DocumentData>[],
  patch: Record<string, unknown>
): Promise<number> {
  if (docs.length === 0) return 0;
  let i = 0;
  while (i < docs.length) {
    const batch = writeBatch(db);
    let ops = 0;
    while (ops < BATCH_LIMIT && i < docs.length) {
      batch.update(docs[i].ref, patch);
      ops++;
      i++;
    }
    await batch.commit();
  }
  return docs.length;
}

function hintTriple(
  stored: { userName: string; userPhotoURL: string; userEmail: string },
  profile: DenormalizedProfilePatch
): string {
  const parts: string[] = [];
  if (stored.userName !== profile.userName) parts.push(`name "${stored.userName}" → "${profile.userName}"`);
  if (stored.userPhotoURL !== profile.userPhotoURL) parts.push("photo URL");
  if (stored.userEmail !== profile.userEmail) parts.push(`email "${stored.userEmail}" → "${profile.userEmail}"`);
  return parts.join("; ") || "out of sync";
}

function hintName(stored: string, profile: string): string {
  return stored !== profile ? `name "${stored}" → "${profile}"` : "out of sync";
}

/**
 * Lists denormalized docs for one user that differ from `users/{uid}` profile fields.
 */
export async function listUnsyncedEntriesForUser(uid: string): Promise<UnsyncedEntry[]> {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return [];
  const profile = patchFromUserDoc(userSnap.data());
  const out: UnsyncedEntry[] = [];

  const availQ = query(collection(db, "availabilities"), where("userId", "==", uid));
  const availSnap = await getDocs(availQ);
  for (const d of availSnap.docs) {
    const data = d.data();
    if (!availabilityMismatch(data, profile)) continue;
    const stored = {
      userName: norm(data.userName),
      userPhotoURL: norm(data.userPhotoURL),
      userEmail: norm(data.userEmail),
    };
    out.push({
      kind: "availability",
      id: d.id,
      label: availabilityLabel(data),
      mismatchHint: hintTriple(stored, profile),
    });
  }

  const partQ = query(collection(db, "eventParticipants"), where("userId", "==", uid));
  const partSnap = await getDocs(partQ);
  const occCache = new Map<string, string>();
  for (const d of partSnap.docs) {
    const data = d.data();
    if (!participantMismatch(data, profile)) continue;
    const oid = typeof data.occurrenceId === "string" ? data.occurrenceId : "";
    let occLine = occCache.get(oid);
    if (occLine === undefined) {
      occLine = (await occurrenceTitleLine(oid)) || `Occurrence ${oid.slice(0, 8)}…`;
      occCache.set(oid, occLine);
    }
    const stored = {
      userName: norm(data.userName),
      userPhotoURL: norm(data.userPhotoURL),
      userEmail: norm(data.userEmail),
    };
    out.push({
      kind: "participant",
      id: d.id,
      label: `Subscribed · ${occLine}`,
      mismatchHint: hintTriple(stored, profile),
    });
  }

  const dropQ = query(collection(db, "eventDropOffs"), where("userId", "==", uid));
  const dropSnap = await getDocs(dropQ);
  for (const d of dropSnap.docs) {
    const data = d.data();
    if (!dropOffMismatch(data, profile)) continue;
    const oid = typeof data.occurrenceId === "string" ? data.occurrenceId : "";
    let occLine = occCache.get(oid);
    if (occLine === undefined) {
      occLine = (await occurrenceTitleLine(oid)) || `Occurrence ${oid.slice(0, 8)}…`;
      occCache.set(oid, occLine);
    }
    const reason =
      typeof data.reason === "string" && data.reason.length > 0
        ? data.reason.length > 40
          ? `${data.reason.slice(0, 40)}…`
          : data.reason
        : "";
    out.push({
      kind: "dropOff",
      id: d.id,
      label: reason ? `Drop-off · ${occLine} · ${reason}` : `Drop-off · ${occLine}`,
      mismatchHint: hintName(norm(data.userName), profile.userName),
    });
  }

  return out;
}

/**
 * Users who have at least one denormalized row out of sync with their profile.
 */
export async function listUsersWithUnsyncedNames(): Promise<UserWithUnsyncSummary[]> {
  const usersSnap = await getDocs(collection(db, "users"));
  const summaries: UserWithUnsyncSummary[] = [];

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const data = userDoc.data();
    const profile = patchFromUserDoc(data);
    let count = 0;

    const availQ = query(collection(db, "availabilities"), where("userId", "==", uid));
    const availSnap = await getDocs(availQ);
    for (const d of availSnap.docs) {
      if (availabilityMismatch(d.data(), profile)) count++;
    }

    const partQ = query(collection(db, "eventParticipants"), where("userId", "==", uid));
    const partSnap = await getDocs(partQ);
    for (const d of partSnap.docs) {
      if (participantMismatch(d.data(), profile)) count++;
    }

    const dropQ = query(collection(db, "eventDropOffs"), where("userId", "==", uid));
    const dropSnap = await getDocs(dropQ);
    for (const d of dropSnap.docs) {
      if (dropOffMismatch(d.data(), profile)) count++;
    }

    if (count > 0) {
      summaries.push({
        uid,
        displayName: profile.userName,
        email: profile.userEmail,
        outOfSyncCount: count,
      });
    }
  }

  return summaries.sort((a, b) => b.outOfSyncCount - a.outOfSyncCount || a.displayName.localeCompare(b.displayName));
}

export type SelectedUnsyncedRef = { kind: UnsyncedEntryKind; id: string };

function refForEntry(kind: UnsyncedEntryKind, id: string): DocumentReference {
  if (kind === "availability") return doc(db, "availabilities", id);
  if (kind === "participant") return doc(db, "eventParticipants", id);
  return doc(db, "eventDropOffs", id);
}

/**
 * Applies profile fields only to the selected documents.
 */
export async function syncSelectedDenormalizedEntries(
  uid: string,
  selection: SelectedUnsyncedRef[]
): Promise<number> {
  if (selection.length === 0) return 0;
  const userSnap = await getDoc(doc(db, "users", uid));
  if (!userSnap.exists()) throw new Error("User not found");
  const patch = patchFromUserDoc(userSnap.data());

  let updated = 0;
  let i = 0;
  while (i < selection.length) {
    const batch = writeBatch(db);
    let ops = 0;
    while (ops < BATCH_LIMIT && i < selection.length) {
      const s = selection[i];
      const ref = refForEntry(s.kind, s.id);
      if (s.kind === "dropOff") {
        batch.update(ref, { userName: patch.userName });
      } else {
        batch.update(ref, {
          userName: patch.userName,
          userPhotoURL: patch.userPhotoURL,
          userEmail: patch.userEmail,
        });
      }
      ops++;
      i++;
      updated++;
    }
    await batch.commit();
  }
  return updated;
}

/**
 * Copies profile fields from the given patch into one user’s availabilities, subscriptions, and drop-offs.
 * Used after profile edits and by the admin full sync.
 */
export async function syncDenormalizedForUser(
  uid: string,
  patch: DenormalizedProfilePatch
): Promise<Pick<SyncDisplayNamesResult, "availabilitiesUpdated" | "participantsUpdated" | "dropOffsUpdated">> {
  const availQ = query(collection(db, "availabilities"), where("userId", "==", uid));
  const availSnap = await getDocs(availQ);
  const availabilitiesUpdated = await commitUpdates(availSnap.docs, {
    userName: patch.userName,
    userPhotoURL: patch.userPhotoURL,
    userEmail: patch.userEmail,
  });

  const partQ = query(collection(db, "eventParticipants"), where("userId", "==", uid));
  const partSnap = await getDocs(partQ);
  const participantsUpdated = await commitUpdates(partSnap.docs, {
    userName: patch.userName,
    userPhotoURL: patch.userPhotoURL,
    userEmail: patch.userEmail,
  });

  const dropQ = query(collection(db, "eventDropOffs"), where("userId", "==", uid));
  const dropSnap = await getDocs(dropQ);
  const dropOffsUpdated = await commitUpdates(dropSnap.docs, {
    userName: patch.userName,
  });

  return { availabilitiesUpdated, participantsUpdated, dropOffsUpdated };
}

/**
 * Syncs every user’s denormalized rows (admin bulk).
 */
export async function syncAllDenormalizedDisplayNames(): Promise<SyncDisplayNamesResult> {
  const usersSnap = await getDocs(collection(db, "users"));
  const result: SyncDisplayNamesResult = {
    usersProcessed: 0,
    availabilitiesUpdated: 0,
    participantsUpdated: 0,
    dropOffsUpdated: 0,
  };

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const patch = patchFromUserDoc(userDoc.data());
    const r = await syncDenormalizedForUser(uid, patch);
    result.availabilitiesUpdated += r.availabilitiesUpdated;
    result.participantsUpdated += r.participantsUpdated;
    result.dropOffsUpdated += r.dropOffsUpdated;
    result.usersProcessed++;
  }

  return result;
}
