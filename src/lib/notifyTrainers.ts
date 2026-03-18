import { auth } from "./firebase";
import { dispatchNotifyDebug } from "./notifyDebug";

export type NotifyEventType =
	| "availability_added"
	| "availability_removed"
	| "event_subscribe"
	| "event_drop_off";

export interface NotifyPayload {
	type: NotifyEventType;
	userId: string;
	userName?: string;
	availabilityId?: string;
	eventId?: string;
	occurrenceId?: string;
	eventStartTime?: string;
	/** Pre-formatted in client's timezone (e.g. "Mar 21, 2026, 1:30 PM GMT+7"). Used in notification body. */
	eventStartTimeFormatted?: string;
	eventTitle?: string;
	dropOffReason?: string;
}

/** Format a Date for notification body in the client's local timezone. */
export function formatEventStartForNotify(date: Date): string {
	return date.toLocaleString(undefined, {
		year: "numeric",
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		timeZoneName: "short",
	});
}

/**
 * Notify other trainers via the backend (push or queue).
 * Call after a successful Firestore write. Failures are logged but not thrown.
 */
const NOTIFY_DEBUG =
	import.meta.env.VITE_NOTIFY_DEBUG === "true" || import.meta.env.VITE_NOTIFY_DEBUG === "1";

export async function notifyTrainers(payload: NotifyPayload): Promise<void> {
	const user = auth.currentUser;
	if (!user) return;
	try {
		const token = await user.getIdToken();
		const res = await fetch("/api/notify", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify(payload),
		});
		const response = await res.json().catch(() => ({}));
		if (NOTIFY_DEBUG) {
			dispatchNotifyDebug({
				payload: payload as unknown as { type: string; [key: string]: unknown },
				status: res.status,
				response,
			});
		}
		if (!res.ok && import.meta.env.DEV) {
			console.warn("notifyTrainers failed:", res.status, response);
		}
	} catch (err) {
		if (NOTIFY_DEBUG) {
			dispatchNotifyDebug({
				payload: payload as unknown as { type: string; [key: string]: unknown },
				status: 0,
				response: { error: String(err) },
			});
		}
		if (import.meta.env.DEV) {
			console.warn("notifyTrainers error:", err);
		}
	}
}
