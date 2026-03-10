# Browser Notifications for Availability Changes

## Overview

When a trainer registers or removes availability, notify all other trainers via browser notifications.

**Current flow:**
- Availability is stored in Firestore `availabilities` collection
- Changes happen in [SchedulePage.tsx](../src/pages/SchedulePage.tsx): `handleCreateAvailability`, `handleDeleteSingle`, `handleDeleteSeries`
- Trainers are users with `role === "trainer"` or `role === "admin"` in the `users` collection

---

## Option A: In-App Notifications (Firestore Listeners)

**How it works:** Each trainer's app listens to the full `availabilities` collection. When a document is added or removed by another user, show a browser notification via the [Notification API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API).

### Pros
- No backend changes (no Cloud Functions)
- No FCM setup (VAPID keys, service worker)
- Works with existing Firestore rules
- Quick to implement

### Cons
- **Only works when the app tab is open** (or at least the origin is loaded)
- No notifications when the user has closed the tab or browser

### Implementation outline

1. **Request permission** on first visit (or when trainer opens Dashboard/Schedule)
2. **Listen to `availabilities`** with `onSnapshot` and `includeMetadataChanges` to detect `added` / `removed` changes
3. **Filter out own changes** – ignore docs where `userId === currentUser.uid`
4. **Show notification** – `new Notification("Availability updated", { body: "John Doe added a slot..." })`

### Code locations
- New hook: `src/hooks/useAvailabilityNotifications.ts`
- Call from `DashboardPage` or `Layout` when `isTrainer` and user is signed in

---

## Option B: Firebase Cloud Messaging (FCM) Push Notifications

**How it works:** Each trainer subscribes to FCM and stores their token. A Cloud Function triggers on Firestore `availabilities` writes, fetches all trainer tokens (except the one who made the change), and sends a push notification.

### Pros
- **Works when app is closed or in background**
- Native OS-level notifications
- Better UX for real-time awareness

### Cons
- Requires Firebase Cloud Functions (Blaze plan)
- Service worker for background messages
- FCM token storage and management
- More setup: VAPID keys, `firebase-messaging-sw.js`, token collection in Firestore

### Implementation outline

1. **Firebase Console**
   - Enable Cloud Messaging
   - Generate Web Push certificates (VAPID key pair)

2. **Client**
   - `firebase-messaging-sw.js` in `public/` for background messages
   - Request notification permission and get FCM token
   - Store token in Firestore `users/{uid}/fcmTokens/{tokenId}` (or similar)
   - Call from `AuthContext` or a dedicated hook when trainer signs in

3. **Cloud Function**
   - Trigger: `onDocumentCreated` / `onDocumentDeleted` on `availabilities`
   - Fetch trainer UIDs from `users` where `role in ["trainer","admin"]`
   - Exclude the UID that made the change
   - Fetch FCM tokens for those UIDs
   - Send multicast message via Admin SDK

4. **Firestore structure**
   - `users/{uid}/fcmTokens/{tokenId}`: `{ token, createdAt }` for multi-device support

---

## Recommendation

| Scenario | Recommended approach |
|---------|----------------------|
| Quick win, trainers often have app open | **Option A** |
| Trainers need alerts when away from the app | **Option B** |
| Phased rollout | Start with **Option A**, add **Option B** later |

---

## Next Steps

1. **Option A:** Implement `useAvailabilityNotifications` and wire it into the app for trainers.
2. **Option B:** Set up Firebase Cloud Functions, FCM tokens, and the service worker, then implement the notification Cloud Function.
