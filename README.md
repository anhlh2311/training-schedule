# Training Schedule

A React app for teams to register and view training availability on a shared calendar.

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
| `VITE_APP_URL` | Base URL of the deployed app (e.g. `https://your-app.vercel.app`) |

**For Vercel API (trainer notifications):** set these in Vercel project settings so `/api/notify` and the cron can use Firebase Admin and FCM:

| Variable | Description |
|---|---|
| `FIREBASE_PROJECT_ID` | Same as `VITE_FIREBASE_PROJECT_ID` |
| `FIREBASE_CLIENT_EMAIL` | Service account client email (JSON key) |
| `FIREBASE_PRIVATE_KEY` | Service account private key (JSON key; keep newlines or use `\n`) |
| `NOTIFY_DEBUG` | (Optional) Set to `true` or `1` to include debug info (payloadSummary, FCM counts) in `/api/notify` responses. Useful for staging. |
| `VITE_NOTIFY_DEBUG` | (Optional) Set to `true` or `1` to show a log panel at the bottom of the page with notify API responses. Use with `NOTIFY_DEBUG`. |
| `CRON_SECRET` | (Optional) Secret for securing `/api/cron/process-batch` if not using Vercel Cron |

## Push Notifications (FCM)

Trainers receive push notifications when availability changes or when someone subscribes/drops off an event. The app uses **Firebase Cloud Messaging** for web push (service worker + VAPID).

### Setup

1. Enable **Cloud Messaging** in Firebase and add **Web Push certificates** (VAPID) in Project settings
2. Set `VITE_FIREBASE_VAPID_PUBLIC_KEY` in the client env; build generates [public/firebase-messaging-sw.js](public/firebase-messaging-sw.js) from `scripts/generate-firebase-sw.cjs`
3. Server routes [api/notify.ts](api/notify.ts) and [api/cron/process-batch.ts](api/cron/process-batch.ts) send via `firebase-admin` to FCM registration tokens stored under `users/{uid}/fcmTokens/*`

See [docs/FCM_WEB_PUSH.md](docs/FCM_WEB_PUSH.md) for iOS PWA requirements and references.

### How it works

- **Client:** [useFcmToken](src/hooks/useFcmToken.ts) registers the FCM token when a trainer is signed in and stores it in Firestore
- **Server:** [api/notify.ts](api/notify.ts) sends `notification` + `data` payloads to all trainer tokens (excluding the actor)

## Trainer Notifications

Admins can enable **notification aggregation** under **Settings** so updates are batched (e.g. every 30–60 min for availability, 5–10 min for event-soon changes). The backend is Vercel serverless (`/api/notify` + cron `/api/cron/process-batch`); no Firebase Cloud Functions required.

**Note:** On Vercel Hobby, crons can run only once per day; the batch job is set to 09:00 UTC. For more frequent batching (e.g. every 5–10 min), use Vercel Pro or call `GET /api/cron/process-batch` from an external cron (e.g. cron-job.org) with `Authorization: Bearer <CRON_SECRET>`.

## Deploying to Vercel

1. Push the repo to GitHub
2. Import the project on [Vercel](https://vercel.com)
3. Add all `VITE_FIREBASE_*` environment variables (including `VITE_FIREBASE_VAPID_PUBLIC_KEY`) in the Vercel project settings
4. Add server vars: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
5. Deploy

The `Cross-Origin-Opener-Policy: same-origin-allow-popups` header is set in [vercel.json](vercel.json) for Firebase Auth popup compatibility.

## Project Structure

```text
api/
  notify.ts              Vercel serverless: receives events, sends FCM
  manifest.ts            PWA manifest endpoint
  cron/
    process-batch.ts     Batched notification delivery
public/
  firebase-messaging-sw.js  FCM service worker (generated from env at build)
src/
  components/
    AddToHomeScreenPrompt.tsx  iOS PWA install banner
    CalendarView.tsx           Shared calendar component
    Layout.tsx                 App shell with nav bar
    ProtectedRoute.tsx         Auth route guard
  context/
    AuthContext.tsx            Auth state provider
  hooks/
    useFcmToken.ts             FCM token registration for trainers
  lib/
    firebase.ts                 Firebase initialization
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

The build uses Vite with:

- **Chunk splitting:** React, Firebase, and react-big-calendar are split into separate vendor chunks
- **Lazy loading:** Admin pages load on demand when navigating to `/admin/*`
