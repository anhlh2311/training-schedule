# Training Schedule

A React app for teams to register and view training availability on a shared calendar.

## Tech Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- Firebase Auth (Google) + Firestore
- react-big-calendar + dayjs
- React Router v7
- OneSignal Web SDK v16 (push notifications)

## Prerequisites

- Node.js 18+
- A Firebase project with Google Auth and Firestore enabled

## Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com) and create a new project
2. Navigate to **Authentication > Sign-in method** and enable **Google**
3. Navigate to **Firestore Database** and create a database (start in **test mode** for development)
4. Go to **Project settings > General** and copy your web app config
5. Deploy security rules: run `firebase deploy --only firestore:rules` (requires `firebase init` if not set up), or paste [firestore.rules](firestore.rules) into Firebase Console > Firestore > Rules

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
| `VITE_FIREBASE_VAPID_PUBLIC_KEY` | (Optional) Web Push VAPID key for FCM fallback. From Firebase Console > Project settings > Cloud Messaging > Web Push certificates |
| `VITE_ONESIGNAL_APP_ID` | **Required for push notifications.** OneSignal App ID. From [OneSignal](https://onesignal.com) > Settings > Keys & IDs. Injected at build time into [index.html](index.html). |
| `VITE_APP_URL` | Base URL of the deployed app (e.g. `https://your-app.vercel.app`) |

**For Vercel API (trainer notifications):** set these in Vercel project settings so `/api/notify` and the cron can use Firebase Admin and OneSignal:

| Variable | Description |
|---|---|
| `FIREBASE_PROJECT_ID` | Same as `VITE_FIREBASE_PROJECT_ID` |
| `FIREBASE_CLIENT_EMAIL` | Service account client email (JSON key) |
| `FIREBASE_PRIVATE_KEY` | Service account private key (JSON key; keep newlines or use `\n`) |
| `ONESIGNAL_APP_ID` | OneSignal App ID. Must match `VITE_ONESIGNAL_APP_ID`. |
| `ONESIGNAL_REST_API_KEY` | OneSignal REST API key (Settings > Keys & IDs). Required for sending push notifications. |
| `CRON_SECRET` | (Optional) Secret for securing `/api/cron/process-batch` if not using Vercel Cron |

## Push Notifications (OneSignal)

Trainers receive push notifications when availability changes or when someone subscribes/drops off an event. The app uses **OneSignal** for web push (better iOS support than FCM).

### OneSignal Setup

1. Create an app at [OneSignal](https://onesignal.com)
2. Go to **Settings > Platforms > Web Push**
3. Add your **Site URL** (e.g. `https://your-app.vercel.app`) — each domain (staging, production) must be added
4. Upload your icon (e.g. `/IHN.png`)
5. Configure welcome notification in the OneSignal dashboard (optional)
6. Set `VITE_ONESIGNAL_APP_ID`, `ONESIGNAL_APP_ID`, and `ONESIGNAL_REST_API_KEY` in your environment

### How It Works

- **Client:** OneSignal SDK loads in [index.html](index.html) and initializes early so the permission prompt appears on first visit. The [useOneSignal](src/hooks/useOneSignal.ts) hook links the subscription to the user's Firebase UID (`external_id`) when a trainer logs in.
- **Server:** [api/notify.ts](api/notify.ts) receives events from the app and sends via OneSignal REST API. Notifications include event title, time, and drop-off reason.
- **iOS:** Add the app to the home screen (PWA) for push to work. An in-app banner guides iOS trainers.

### Fallback

If OneSignal env vars are not set, the app logs a console error and push is disabled. FCM remains available as a fallback when `VITE_FIREBASE_VAPID_PUBLIC_KEY` is set, but OneSignal is recommended.

## Trainer Notifications

Admins can enable **notification aggregation** under **Settings** so updates are batched (e.g. every 30–60 min for availability, 5–10 min for event-soon changes). The backend is Vercel serverless (`/api/notify` + cron `/api/cron/process-batch`); no Firebase Cloud Functions required.

**Note:** On Vercel Hobby, crons can run only once per day; the batch job is set to 09:00 UTC. For more frequent batching (e.g. every 5–10 min), use Vercel Pro or call `GET /api/cron/process-batch` from an external cron (e.g. cron-job.org) with `Authorization: Bearer <CRON_SECRET>`.

## Deploying to Vercel

1. Push the repo to GitHub
2. Import the project on [Vercel](https://vercel.com)
3. Add all `VITE_FIREBASE_*` and `VITE_ONESIGNAL_APP_ID` environment variables in the Vercel project settings
4. Add server vars: `FIREBASE_*`, `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`
5. Deploy

For staging/production, use separate OneSignal apps or add each domain to the OneSignal Site URL settings. The `Cross-Origin-Opener-Policy: same-origin-allow-popups` header is set in [vercel.json](vercel.json) for Firebase Auth popup compatibility.

## Project Structure

```text
api/
  notify.ts              Vercel serverless: receives events, sends OneSignal
  manifest.ts            PWA manifest endpoint
  cron/
    process-batch.ts     Batched notification delivery
public/
  OneSignalSDKWorker.js  OneSignal service worker (imports CDN script)
  firebase-messaging-sw.js  FCM fallback (generated from env)
src/
  components/
    AddToHomeScreenPrompt.tsx  iOS PWA install banner
    CalendarView.tsx           Shared calendar component
    Layout.tsx                 App shell with nav bar
    ProtectedRoute.tsx         Auth route guard
  context/
    AuthContext.tsx            Auth state provider
  hooks/
    useOneSignal.ts            Links OneSignal subscription to Firebase UID
    useFcmToken.ts             FCM token registration (fallback)
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
