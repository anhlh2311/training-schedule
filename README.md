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
