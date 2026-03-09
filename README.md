# Training Schedule

A React app for teams to register and view training availability on a shared calendar.

## Tech Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- Firebase Auth (Google) + Firestore
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
| `VITE_FIREBASE_VAPID_PUBLIC_KEY` | (Optional) Web Push VAPID public key for trainer push notifications. From Firebase Console > Project settings > Cloud Messaging > Web Push certificates |

**For Vercel API (trainer notifications):** set these in Vercel project settings so `/api/notify` and the cron can use Firebase Admin and FCM:

| Variable | Description |
|---|---|
| `FIREBASE_PROJECT_ID` | Same as `VITE_FIREBASE_PROJECT_ID` |
| `FIREBASE_CLIENT_EMAIL` | Service account client email (JSON key) |
| `FIREBASE_PRIVATE_KEY` | Service account private key (JSON key; keep newlines or use `\n`) |
| `CRON_SECRET` | (Optional) Secret for securing `/api/cron/process-batch` if not using Vercel Cron |

## Trainer notifications

Trainers receive browser push notifications when availability changes or when someone subscribes/drops off an event. Admins can enable **notification aggregation** under **Settings** so updates are batched (e.g. every 30–60 min for availability, 5–10 min for event-soon changes). The backend is Vercel serverless (`/api/notify` + cron `/api/cron/process-batch`); no Firebase Cloud Functions required.

## Deploying to Vercel

1. Push the repo to GitHub
2. Import the project on [Vercel](https://vercel.com)
3. Add all `VITE_FIREBASE_*` environment variables in the Vercel project settings
4. Deploy

For SPA routing, Vercel automatically handles this with the Vite framework preset.

## Project Structure

```text
src/
  components/
    CalendarView.tsx      Shared calendar component
    Layout.tsx            App shell with nav bar
    ProtectedRoute.tsx    Auth route guard
  context/
    AuthContext.tsx        Auth state provider
  lib/
    firebase.ts           Firebase initialization
  pages/
    LoginPage.tsx         Google sign-in
    DashboardPage.tsx     Team availability calendar
    SchedulePage.tsx      Register/manage own availability
  types/
    index.ts              Shared TypeScript types
```
