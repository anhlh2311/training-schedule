# Training Schedule

A React app for teams to register and view training availability on a shared calendar.

**End users:** see [USER_GUIDE.md](USER_GUIDE.md) for signing in, add-to-home-screen, and push notifications (iOS, Android, desktop).

## Tech Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- Firebase Auth (Google) + Firestore
- Firebase Cloud Messaging (FCM) for web push notifications
- react-big-calendar + dayjs
- React Router v7

## Prerequisites

- Node.js 18+
- A Firebase project with Google Auth and Firestore enabled

## Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com) and create a new project
2. Navigate to **Authentication > Sign-in method** and enable **Google**
3. Navigate to **Firestore Database** and create a database (start in **test mode** for development)
4. Go to **Project settings > General** and copy your web app config
5. For push: **Project settings > Cloud Messaging > Web Push certificates** — generate a key pair and copy the **public** key into `VITE_FIREBASE_VAPID_PUBLIC_KEY`
6. Deploy security rules: run `firebase deploy --only firestore:rules` (requires `firebase init` if not set up), or paste [firestore.rules](firestore.rules) into Firebase Console > Firestore > Rules

## Getting Started

```bash
# Install dependencies
yarn

# Copy environment template and fill in your Firebase config
cp .env.example .env

# Start development server
yarn dev
```

## Environment Variables

Create a `.env` file from `.env.example` with your Firebase project values:

| Variable | Description |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |
| `VITE_FIREBASE_VAPID_PUBLIC_KEY` | **Required for push notifications.** Web Push VAPID key from Firebase Console > Project settings > Cloud Messaging > Web Push certificates |
| `VITE_APP_URL` | Base URL of the deployed app (e.g. `https://your-app.vercel.app`) — also used in invite emails |
| `VITE_ADMIN_EMAIL` | **Bootstrap admin only.** Google account email that receives `role: admin` on **first** sign-in when no `users/{uid}` doc exists yet. Other admins are assigned in-app. |

**For Vercel API (trainer notifications):** set these in Vercel project settings so `/api/notify` and the cron can use Firebase Admin and FCM:

| Variable | Description |
|---|---|
| `FIREBASE_PROJECT_ID` | Same as `VITE_FIREBASE_PROJECT_ID` |
| `FIREBASE_CLIENT_EMAIL` | Service account client email (JSON key) |
| `FIREBASE_PRIVATE_KEY` | Service account private key (JSON key; keep newlines or use `\n`) |
| `NOTIFY_DEBUG` | (Optional) Set to `true` or `1` to include debug info (payloadSummary, FCM counts) in `/api/notify` responses. Useful for staging. |
| `VITE_NOTIFY_DEBUG` | (Optional) Set to `true` or `1` to show a log panel at the bottom of the page with notify API responses. Use with `NOTIFY_DEBUG`. |
| `CRON_SECRET` | (Optional) Secret for securing `/api/cron/process-batch` if not using Vercel Cron |

**For invite emails (`/api/invite`):** set on the server (e.g. Vercel):

| Variable | Description |
|---|---|
| `RESEND_API_KEY` | API key from [Resend](https://resend.com) |
| `RESEND_FROM_EMAIL` | Sender address, e.g. `Training Schedule <noreply@yourdomain.com>`. Must use a domain you have verified in Resend (or Resend’s test domain while evaluating). |

## Invitations (trainers & members)

Invitations tie **Google sign-in** to an initial **role** before the user exists in Firestore.

### How it works

1. **Bootstrap admin (first operator)**  
   Set `VITE_ADMIN_EMAIL` to the Google email of the first admin. On their **first** successful sign-in, [AuthContext](src/context/AuthContext.tsx) creates `users/{uid}` with `role: admin` (no invite document needed).

2. **Inviting trainers or members**  
   An admin opens **Admin → Trainers** ([TrainersPage.tsx](src/pages/admin/TrainersPage.tsx)), enters an email and role (**trainer** or **member**), and submits. The app:
   - Writes **`invites/{email}`** in Firestore (document id = lowercase email) with `role` and `createdAt`.
   - **`POST`s [api/invite.ts](api/invite.ts)** to send a welcome email. If the request fails, the invite **still exists** in Firestore (email is best-effort).

3. **First sign-in for an invited user**  
   When a new Google user has **no** `users/{uid}` document yet, the app checks **`invites/{email}`**. If present, their `role` is set from that document (trainer or member), then the invite document is **deleted**. If there is no invite and they are not `VITE_ADMIN_EMAIL`, the default role is **user**.

4. **Pending invites**  
   Admins can see and revoke rows under the `invites` collection from the same page (delete = revoke).

Firestore security rules for `invites` are in [firestore.rules](firestore.rules) (admins create/delete; invitee can delete their own pending invite by email match on token).

### Third-party service: Resend

[Resend](https://resend.com) is used only for **transactional email** from [api/invite.ts](api/invite.ts) (HTML + text “your account is ready” with app link and logo URL derived from `VITE_APP_URL`). It is **not** used for push notifications (those use FCM).

**Setup:**

1. Create a Resend account and generate an **API key**.
2. **Verify a sending domain** in Resend (SPF/DKIM) and use an address on that domain in `RESEND_FROM_EMAIL`, or use Resend’s documented test flow for development.
3. Set **`RESEND_API_KEY`**, **`RESEND_FROM_EMAIL`**, and **`VITE_APP_URL`** on your deployment so `/api/invite` can build links and authenticate to Resend.

**Local development:** Standard `yarn dev` serves the Vite app only; **`/api/invite` runs on Vercel** (or via `vercel dev` with the same env). You can still create **`invites`** documents from the UI locally; the email sends only when the Resend-backed route runs with valid `RESEND_*` env.

## Push Notifications (FCM)

Trainer push uses **Firebase Cloud Messaging (FCM) for web** only (service worker + VAPID). There is **no third-party push SDK**—tokens live in Firestore and the server uses **Firebase Admin**.

### Migration note

If you are coming from an older setup that used another vendor for web push, **FCM registration tokens are not portable**. Users must open this app again (with notification permission) so a new token is stored under `users/{uid}/fcmTokens/*`.

### Setup

1. Enable **Cloud Messaging** in Firebase and add **Web Push certificates** (VAPID) in Project settings
2. Set `VITE_FIREBASE_VAPID_PUBLIC_KEY` in the client env; `yarn build` runs `scripts/generate-firebase-sw.cjs`, which writes [public/firebase-messaging-sw.js](public/firebase-messaging-sw.js) with your Firebase web config
3. Server routes [api/notify.ts](api/notify.ts) and [api/cron/process-batch.ts](api/cron/process-batch.ts) send via `firebase-admin` to every FCM token under `users/{uid}/fcmTokens/*` for target trainers (excluding the actor where applicable)

### How delivery works (web)

- **Data-only FCM messages:** The API sends **`data` only** (`title`, `body`, `type`, `url` as strings)—not a separate `notification` block. On web, that avoids unreliable auto-display and ensures a **single** path: the service worker calls `showNotification()` in `onBackgroundMessage`.
- **Background / PWA:** [public/firebase-messaging-sw.js](public/firebase-messaging-sw.js) (generated) handles background messages and shows the notification.
- **Foreground (tab focused):** After a successful token save, [registerFcmToken.ts](src/lib/registerFcmToken.ts) attaches Firebase **`onMessage`** so trainers still see a system notification while the app is open. The listener is detached when the user signs out or is no longer a trainer (see [Layout.tsx](src/components/Layout.tsx)).
- **Client registration:** [useFcmToken.ts](src/hooks/useFcmToken.ts) requests permission (where the platform allows) and calls `registerTrainerFcmToken` to write the token to Firestore.
- **iOS (Safari PWA):** Notification permission must be triggered by a **user gesture**. Trainers on iOS in standalone mode see [IosPushPermissionBanner.tsx](src/components/IosPushPermissionBanner.tsx); see [docs/FCM_WEB_PUSH.md](docs/FCM_WEB_PUSH.md) for requirements and troubleshooting.

### Stale tokens and debug

- Invalid tokens (e.g. `messaging/registration-token-not-registered`) are **removed from Firestore** after a failed send so the next request does not retry them. Affected users should reopen the app and ensure notifications are allowed to register a fresh token.
- With **`NOTIFY_DEBUG`** enabled, `/api/notify` responses can include **`fcmPerToken`** (per-device success/errors), **`fcmTokensPruned`**, and payload summaries—useful on staging. Pair with **`VITE_NOTIFY_DEBUG`** for the in-app log panel.

### Serverless bundling (Vercel)

Shared FCM helpers (`getFcmTokenEntries`, `removeDeadFcmTokensAfterSend`) are **exported from** [api/notify.ts](api/notify.ts) and imported by the cron handler so all code is bundled on deploy. See [docs/VERCEL_API_BUNDLING.md](docs/VERCEL_API_BUNDLING.md) if you add more API routes that share server code.

## Trainer Notifications

Admins can enable **notification aggregation** under **Settings** so updates are batched (e.g. every 30–60 min for availability, 5–10 min for event-soon changes). The backend is Vercel serverless (`/api/notify` + cron `/api/cron/process-batch`); no Firebase Cloud Functions required.

**Note:** On Vercel Hobby, crons can run only once per day; the batch job is set to 09:00 UTC. For more frequent batching (e.g. every 5–10 min), use Vercel Pro or call `GET /api/cron/process-batch` from an external cron (e.g. cron-job.org) with `Authorization: Bearer <CRON_SECRET>`.

## Deploying to Vercel

1. Push the repo to GitHub
2. Import the project on [Vercel](https://vercel.com)
3. Add all `VITE_FIREBASE_*` environment variables (including `VITE_FIREBASE_VAPID_PUBLIC_KEY` and `VITE_ADMIN_EMAIL` / `VITE_APP_URL` as needed) in the Vercel project settings
4. Add server vars: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, plus `RESEND_API_KEY` and `RESEND_FROM_EMAIL` if you use email invites
5. Deploy

The `Cross-Origin-Opener-Policy: same-origin-allow-popups` header is set in [vercel.json](vercel.json) for Firebase Auth popup compatibility.

## Project Structure

```text
api/
  notify.ts              Vercel serverless: receives events, sends FCM (exports shared FCM helpers)
  invite.ts              Resend: welcome email after admin creates an invite
  manifest.ts            PWA manifest endpoint
  cron/
    process-batch.ts     Batched notification delivery (imports FCM helpers from notify.ts)
public/
  firebase-messaging-sw.js  FCM service worker (generated from env at build)
src/
  components/
    AddToHomeScreenPrompt.tsx   iOS PWA install banner
    IosPushPermissionBanner.tsx iOS PWA: user-gesture “Enable notifications”
    NotifyDebugLog.tsx          Optional notify API debug panel (VITE_NOTIFY_DEBUG)
    CalendarView.tsx            Shared calendar component
    Layout.tsx                  App shell; detaches FCM foreground listener on logout
    ProtectedRoute.tsx          Auth route guard
  context/
    AuthContext.tsx            Auth state provider
  hooks/
    useFcmToken.ts             FCM token registration for trainers
  lib/
    firebase.ts                 Firebase initialization
    registerFcmToken.ts         getToken + Firestore write + foreground onMessage
    notifyTrainers.ts           Client API for triggering notifications
  pages/
    LoginPage.tsx               Google sign-in
    DashboardPage.tsx           Team availability calendar
    SchedulePage.tsx             Register/manage own availability
    admin/
      UsersPage.tsx             User management (lazy-loaded)
      TrainersPage.tsx          Trainer management (lazy-loaded)
      EventsPage.tsx            Event management (lazy-loaded)
      NotificationSettingsPage.tsx  Aggregation settings (lazy-loaded)
  types/
    index.ts                    Shared TypeScript types
```

## Build

The build runs `scripts/generate-firebase-sw.cjs` first so **FCM service worker** config matches `.env`, then Vite.

The build uses Vite with:

- **Chunk splitting:** React, Firebase, and react-big-calendar are split into separate vendor chunks
- **Lazy loading:** Admin pages load on demand when navigating to `/admin/*`
