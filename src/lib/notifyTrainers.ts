import { auth } from "./firebase";

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
		if (!res.ok && import.meta.env.DEV) {
			console.warn(
				"notifyTrainers failed:",
				res.status,
				await res.text(),
			);
		}
	} catch (err) {
		if (import.meta.env.DEV) {
			console.warn("notifyTrainers error:", err);
		}
	}
}
