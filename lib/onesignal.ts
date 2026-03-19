import type { Firestore } from "firebase-admin/firestore";

/** Firestore `in` query supports max 30 values. */
const FIRESTORE_IN_LIMIT = 30;

/**
 * Get OneSignal push subscription IDs from our Firestore table (client-registered).
 * Chunks trainer UIDs by 30 due to Firestore `in` limit.
 */
export async function getPushSubscriptionIdsFromDb(
  db: Firestore,
  trainerUids: string[],
  excludeUserId?: string
): Promise<string[]> {
  if (trainerUids.length === 0) return [];

  const ids: string[] = [];
  for (let i = 0; i < trainerUids.length; i += FIRESTORE_IN_LIMIT) {
    const batch = trainerUids.slice(i, i + FIRESTORE_IN_LIMIT);
    const snap = await db
      .collection("oneSignalSubscriptions")
      .where("userId", "in", batch)
      .get();

    for (const doc of snap.docs) {
      const data = doc.data();
      const userId = data.userId as string | undefined;
      if (userId && userId !== excludeUserId) {
        ids.push(doc.id);
      }
    }
  }
  return ids;
}

export interface OneSignalSendResult {
  sent: number;
  error?: string;
}

export async function sendOneSignalPush(
  appId: string,
  restApiKey: string,
  subscriptionIds: string[],
  title: string,
  body: string
): Promise<OneSignalSendResult> {
  if (subscriptionIds.length === 0) {
    return { sent: 0 };
  }

  const res = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Key ${restApiKey}`,
    },
    body: JSON.stringify({
      app_id: appId,
      include_subscription_ids: subscriptionIds,
      headings: { en: title },
      contents: { en: body },
      data: { url: "/" },
    }),
  });

  const text = await res.text();
  let responseBody: unknown;
  try {
    responseBody = text ? (JSON.parse(text) as unknown) : {};
  } catch {
    responseBody = text || {};
  }

  if (!res.ok) {
    return {
      sent: 0,
      error: `OneSignal API ${res.status}: ${JSON.stringify(responseBody)}`,
    };
  }

  const sent = (responseBody as { recipients?: number }).recipients ?? 0;
  return { sent };
}
