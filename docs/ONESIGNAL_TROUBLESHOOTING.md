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

## 2. OneSignal Network Timeout

```
OneSignal: Network timed out while calling https://api.onesignal.com/apps/.../users/by/onesignal_id/...
```

**Cause:** The OneSignal client SDK cannot reach `api.onesignal.com`. Common reasons:

- **Site URL mismatch:** OneSignal only allows one origin per app. Staging must use a separate OneSignal app.
- **Firewall/proxy:** Corporate networks or VPNs may block OneSignal.
- **Browser extensions:** Ad blockers or privacy extensions may block OneSignal.

**Fix for staging:**

1. Create a **separate OneSignal app** for staging (OneSignal does not support multiple origins in one app)
2. In the staging app: **Settings** → **Platforms** → **Web Push** → **Site URL** = `https://ihn-schedule-stg.tungtang.vn` (exact match)
3. Set `VITE_ONESIGNAL_APP_ID`, `ONESIGNAL_APP_ID`, and `ONESIGNAL_REST_API_KEY` in Vercel staging env to the **staging** app's values
4. Test without VPN or ad blockers

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

## Checklist for Staging

- [ ] Separate OneSignal app for staging with Site URL = staging origin
- [ ] Default Icon URL in OneSignal = self-hosted (e.g. `https://your-staging-domain/IHN.png`)
- [ ] Vercel staging env: `VITE_ONESIGNAL_APP_ID`, `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY` from staging app
- [ ] COOP header: `same-origin-allow-popups` in vercel.json
- [ ] Test without VPN or ad blockers
