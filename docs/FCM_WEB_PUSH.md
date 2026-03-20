# FCM Web Push (Training Schedule)

Trainer notifications use **Firebase Cloud Messaging (FCM)** with the Web Push API. The server sends via `firebase-admin` ([api/notify.ts](mdc:api/notify.ts)); the client registers tokens with [useFcmToken.ts](mdc:src/hooks/useFcmToken.ts) and stores them under `users/{uid}/fcmTokens/{tokenId}`.

## Configuration

1. **Firebase Console** → Project settings → **Cloud Messaging** → **Web Push certificates** — generate a key pair and copy the **public** key into `VITE_FIREBASE_VAPID_PUBLIC_KEY`.
2. Run `yarn build` (or `node scripts/generate-firebase-sw.cjs`) so [public/firebase-messaging-sw.js](mdc:public/firebase-messaging-sw.js) is generated with your Firebase web config.
3. Vercel must expose the same Firebase env vars and `FIREBASE_*` service account credentials for `/api/notify` and `/api/cron/process-batch`.

## iOS (Safari) and PWA

Web push on iPhone/iPad requires:

- **iOS/iPadOS 16.4+** with the app **added to the Home Screen** and opened from there
- A valid **web app manifest** (see [api/manifest.ts](mdc:api/manifest.ts))
- Notification permission granted by the user

The [AddToHomeScreenPrompt](mdc:src/components/AddToHomeScreenPrompt.tsx) component guides trainers on iOS.

References:

- [Firebase — Get started with FCM on Web](https://firebase.google.com/docs/cloud-messaging/js/client)
- [Apple — Sending web push notifications in web apps](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)

## Troubleshooting

- **No token in Firestore:** Check `VITE_FIREBASE_VAPID_PUBLIC_KEY`, HTTPS, and that the browser supports FCM (`isSupported()` in [useFcmToken.ts](mdc:src/hooks/useFcmToken.ts)).
- **No delivery:** Verify `firebase-messaging-sw.js` is served from the site root and that the service worker version matches the app (see [scripts/generate-firebase-sw.cjs](mdc:scripts/generate-firebase-sw.cjs)).
