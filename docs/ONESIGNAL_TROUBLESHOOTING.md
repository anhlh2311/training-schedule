# OneSignal Staging Troubleshooting

Common console errors on staging and how to fix them.

---

## 1. Image CORS Error

```
Access to image at 'https://img.onesignal.com/permanent/...' from origin 'https://your-staging-domain.com' 
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

**Cause:** The notification icon or site icon in OneSignal is hosted on `img.onesignal.com`, which does not send CORS headers for cross-origin requests.

**Fix:** Use a self-hosted icon URL in the OneSignal dashboard:

1. Go to **OneSignal Dashboard** → **Settings** → **Platforms** → **Web Push**
2. Under **Default Icon URL** (or **Site Icon**), change from the OneSignal CDN URL to your app's icon:
   - Example: `https://ihn-schedule-stg.tungtang.vn/IHN.png`
3. Ensure the icon is served from the same origin as your app (or a CDN that allows CORS)

---

## 2. OneSignal Network Timeout (`users/by/onesignal_id`)

```
OneSignal: Network timed out while calling https://api.onesignal.com/apps/.../users/by/onesignal_id/...
```

**What it is:** This request is made **inside the OneSignal Web SDK** (often from `OneSignalSDK.sw.js`), not by your app code or `/api/notify`. The SDK syncs user state by calling OneSignal’s REST API to load a user by `onesignal_id`. Our backend uses Firestore **subscription IDs** for sends; we do **not** call this endpoint from the server.

**Cause:** The browser (or service worker) cannot complete `api.onesignal.com` requests in time. Common reasons:

- **Site URL mismatch:** OneSignal only allows one origin per app. Staging must use a **separate** OneSignal app with **Site URL** exactly matching your origin.
- **Network:** Slow or blocked path to `api.onesignal.com` (firewall, VPN, corporate proxy, DNS, ISP).
- **Extensions:** Ad blockers or privacy tools blocking OneSignal.
- **OneSignal:** Temporary slowness or outage (check [status.onesignal.com](https://status.onesignal.com) if available).

**What you can do:**

1. **Confirm the OneSignal app matches your origin** (see checklist below).
2. **Test** in a clean browser profile (no extensions), **disable VPN**, try another network.
3. **From the machine** run `curl -I https://api.onesignal.com` — if it hangs or fails, the issue is network/DNS, not the app.
4. If timeouts persist but push still works, the console noise is often **benign**; the SDK retries. If push never works, fix Site URL / network first.

**Staging checklist:**

1. Create a **separate OneSignal app** for staging (OneSignal does not support multiple origins in one app).
2. In the staging app: **Settings** → **Platforms** → **Web Push** → **Site URL** = your exact origin (e.g. `https://ihn-schedule-stg.tungtang.vn`).
3. Set `VITE_ONESIGNAL_APP_ID`, `ONESIGNAL_APP_ID`, and `ONESIGNAL_REST_API_KEY` in Vercel staging env to the **staging** app’s values.
4. Test without VPN or ad blockers.

---

## 3. OneSignal API 400 on Subscriptions

```
api.onesignal.com/apps/.../subscriptions/...: Failed to load resource: the server responded with a status of 400
```

**Cause:** Invalid subscription update request. Can be due to:

- Site URL mismatch (same as #2)
- Stale or invalid subscription state
- OneSignal SDK version mismatch

**Fix:** Ensure Site URL matches the deployed origin exactly. Use a separate OneSignal app for staging.

---

## 4. Service Worker Message Event Warning

```
Event handler of 'message' event must be added on the initial evaluation of worker script.
```

**Cause:** Chrome requires service worker `message` listeners to be registered synchronously when the worker script loads. The OneSignal SDK may add its listener asynchronously.

**Fix:** This is a known OneSignal SDK behavior. It does not affect the subscription table or push delivery. The notification flow still works. If it causes issues, check OneSignal SDK version and GitHub issues.

---

## 5. Firebase Auth: Cross-Origin-Opener-Policy

```
Cross-Origin-Opener-Policy policy would block the window.closed call.
```

**Cause:** Firebase Auth uses a popup for Google sign-in. The COOP header must allow popup communication.

**Fix:** Ensure [vercel.json](vercel.json) sets:

```json
{ "key": "Cross-Origin-Opener-Policy", "value": "same-origin-allow-popups" }
```

Not `unsafe-none` or `same-origin` (strict).

---

## 6. SES / lockdown-install.js

```
SES Removing unpermitted intrinsics
```

**Cause:** From a browser extension or testing framework (e.g. lockdown.js). Not from the app.

**Fix:** Ignore or disable the extension when testing.

---

## 7. Notification shows title only (no body), even with curl

**Symptom:** The OS shows a title (or app name) and source/domain, but **no message line** — including when you send with `curl` and explicit `headings` / `contents`.

**Implication:** The problem is **not** in app code that builds the payload (e.g. empty `contents` from `undefined`). The REST request already contains a body; something else controls what the OS renders.

**Checklist:**

1. **Use the current API host** (same as [api/notify.ts](mdc:api/notify.ts)):
   - Prefer: `POST https://api.onesignal.com/notifications`
   - Older `https://onesignal.com/api/v1/notifications` may still work but align with [OneSignal’s docs](https://documentation.onesignal.com/reference/create-notification) when debugging.

2. **Confirm in OneSignal Dashboard**  
   Open **Messages** → select the delivery → verify the message **content** and **per-channel** preview. If the dashboard shows the full body but the device does not, the issue is **client/OS/display**, not the JSON you sent.

3. **Platform behavior**
   - **iOS (web / PWA):** Notification center layout and “Show Previews” / Focus settings can change how much text is visible; test the **same** payload on **Chrome desktop** (Windows/macOS) to see if the body appears there.
   - **Android:** Ensure the site’s notification channel is not set to **minimize** or hide sensitive content (system **Settings → Apps → Chrome → Notifications**).

4. **Dashboard overrides**  
   Check **Templates**, **Journeys**, or **A/B** tests that might override content for web.

5. **API key exposure**  
   If a REST API key was pasted into chat or committed to a repo, **rotate it** in OneSignal (**Settings → Keys & IDs**) and update Vercel env vars.

---

## Checklist for Staging

- [ ] Separate OneSignal app for staging with Site URL = staging origin
- [ ] Default Icon URL in OneSignal = self-hosted (e.g. `https://your-staging-domain/IHN.png`)
- [ ] Vercel staging env: `VITE_ONESIGNAL_APP_ID`, `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY` from staging app
- [ ] COOP header: `same-origin-allow-popups` in vercel.json
- [ ] Test without VPN or ad blockers
