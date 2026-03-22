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

**Permission prompt:** On iOS, `Notification.requestPermission()` is only reliable when triggered by a **user gesture** (e.g. a button tap). Automatic calls from `useEffect` often do not show the system dialog. The app uses [IosPushPermissionBanner](mdc:src/components/IosPushPermissionBanner.tsx) for trainers on iOS in standalone mode; [useFcmToken.ts](mdc:src/hooks/useFcmToken.ts) then registers the FCM token after permission is `granted`.

**Not OneSignal tokens:** A “Safari Push” subscription in OneSignal is that vendor’s channel to Apple’s push endpoint. **FCM uses its own registration token** from the Firebase SDK (`getToken`); you cannot paste OneSignal subscription IDs or Safari push URLs into FCM. After migrating to FCM, tokens live only under `users/{uid}/fcmTokens` from this app.

The [AddToHomeScreenPrompt](mdc:src/components/AddToHomeScreenPrompt.tsx) component guides trainers when the site is still opened in Safari instead of the installed PWA.

References:

- [Firebase — Get started with FCM on Web](https://firebase.google.com/docs/cloud-messaging/js/client)
- [Apple — Sending web push notifications in web apps](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)

## Verification checklist (Android works, iOS does not)

Do these **in order** on staging (or locally with the API pointed at the same Firebase project).

### 1. Confirm the iPhone registered a token

1. Sign in on the **iPhone PWA** (opened from the **home screen icon**) as a trainer; tap **Enable notifications** if shown.
2. In **Firebase Console** → **Firestore** → `users` → `{trainerUid}` → subcollection **`fcmTokens`**.
3. You should see at least one document with a long **`token`** string. If **empty**, fix client/VAPID before testing sends.

### 2. See whether FCM accepts each token (server)

1. Set **`NOTIFY_DEBUG=true`** (or `1`) in **Vercel** env for the environment you test (and optionally **`VITE_NOTIFY_DEBUG=true`** so the in-app log panel shows the response).
2. Trigger a notification (e.g. an action that calls `/api/notify` with a valid user token).
3. Open the JSON response **`debug.fcmPerToken`**: each array entry is one FCM send attempt (`success`, or `error.code` / `error.message` if it failed).
   - **`UNREGISTERED` / `NOT_FOUND`** → token stale: re-open the PWA, tap **Enable notifications** again, or delete old `fcmTokens` docs and re-register.
   - **`messaging/invalid-argument`** → wrong project or bad token format; check Firebase web app config matches [scripts/generate-firebase-sw.cjs](mdc:scripts/generate-firebase-sw.cjs) / Vercel env.

If **all** entries are `success: true` but the iPhone still shows nothing, the issue is likely **device/OS** (notifications off, Focus, or testing only while the PWA is **foreground** — try locking the phone or backgrounding the app).

### 3. Device checks (iPhone)

- **Settings → Notifications →** (your PWA name) → **Allow Notifications** on.
- Test with the PWA **in the background** or phone **locked** (foreground behavior can differ from Android).
- **iOS 16.4+**, app installed from **Safari → Add to Home Screen**.

### 4. Same Firebase project everywhere

- **Vercel** `VITE_*` Firebase keys and **`FIREBASE_PROJECT_ID`** for the API must belong to the **same** Firebase project as the **Web Push** VAPID key in the console.

## Interpreting `fcmPerToken` errors

| `error.code` | Meaning |
|--------------|--------|
| `messaging/registration-token-not-registered` | Token expired or revoked (reinstall, cleared site data, browser reset). **Not** an iOS-only bug. |
| `messaging/invalid-argument` | Token string is not a valid FCM registration token (corrupt row, old test data, or truncated paste). |
| *(success: true)* | FCM accepted the message; if the device still shows nothing, check **OS notification settings** and test with the app **backgrounded**. |

The API removes Firestore `fcmTokens` docs that fail with the above codes (logic lives in [api/notify.ts](mdc:api/notify.ts) and is imported by the cron handler) so users re-register a fresh token on next visit. After deploy, **`fcmTokensPruned`** in `NOTIFY_DEBUG` shows how many stale docs were deleted.

## Troubleshooting

- **No token in Firestore:** Check `VITE_FIREBASE_VAPID_PUBLIC_KEY`, HTTPS, and that the browser supports FCM (`isSupported()` in [useFcmToken.ts](mdc:src/hooks/useFcmToken.ts)).
- **No delivery:** Verify `firebase-messaging-sw.js` is served from the site root and that the service worker version matches the app (see [scripts/generate-firebase-sw.cjs](mdc:scripts/generate-firebase-sw.cjs)).
