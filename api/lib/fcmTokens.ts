import type { Firestore } from "firebase-admin/firestore";

/** One row per `users/{uid}/fcmTokens/{docId}` document. */
export interface FcmTokenEntry {
  token: string;
  /** Firestore path, e.g. `users/abc/fcmTokens/xyz` */
  path: string;
}

/**
 * Loads all FCM registration tokens for the given user IDs (trainers/admins).
 */
export async function getFcmTokenEntries(
  db: Firestore,
  uids: string[]
): Promise<FcmTokenEntry[]> {
  const entries: FcmTokenEntry[] = [];
  for (const uid of uids) {
    const snap = await db.collection("users").doc(uid).collection("fcmTokens").get();
    for (const d of snap.docs) {
      const t = d.data().token;
      if (typeof t === "string" && t.trim().length > 0) {
        entries.push({ token: t, path: d.ref.path });
      }
    }
  }
  return entries;
}

/** FCM error codes that mean this token should be removed from Firestore. */
const PRUNE_ERROR_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  /** Malformed or non-FCM token string; safe to drop when multicast uses the same payload for others. */
  "messaging/invalid-argument",
]);

/**
 * Deletes Firestore `fcmTokens` docs whose send failed with a permanent token error.
 * Returns how many documents were deleted.
 */
export async function removeDeadFcmTokensAfterSend(
  db: Firestore,
  entries: FcmTokenEntry[],
  responses: Array<{ success: boolean; error?: { code?: string } }>
): Promise<number> {
  const paths: string[] = [];
  for (let i = 0; i < responses.length; i++) {
    const r = responses[i];
    if (r.success) continue;
    const code = r.error?.code;
    if (!code || !PRUNE_ERROR_CODES.has(code)) continue;
    const path = entries[i]?.path;
    if (path) paths.push(path);
  }
  if (paths.length === 0) return 0;

  let batch = db.batch();
  let ops = 0;
  let total = 0;
  for (const path of paths) {
    batch.delete(db.doc(path));
    ops++;
    total++;
    if (ops >= 450) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  return total;
}
