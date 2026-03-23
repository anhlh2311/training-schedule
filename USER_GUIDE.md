# Training Schedule — User Guide

This guide helps you use **Training Schedule** in the browser or as an installed app, and how to turn on **push notifications** if you are a **trainer**.

## What this app does

- View team **training availability** on a shared calendar.
- **Trainers** can add or remove their availability and see when others join or leave events.
- **Members** can browse the schedule; capabilities depend on how your team administrator set up accounts.

## Sign in

1. Open your team’s Training Schedule URL (your administrator or coach will share it).
2. Choose **Sign in with Google** and pick the Google account you use for this team.
3. If you are asked to set a **display name**, enter how you want others to see you on the calendar.

---

## Push notifications (trainers only)

**Only users with the trainer role** receive push alerts—for example when someone updates availability or joins or leaves an event.

If you are not a trainer, you can skip this section.

### Why install the app first (especially on iPhone)

On **iPhone and iPad**, web push works only if:

- Your device runs **iOS / iPadOS 16.4 or later**, and  
- You **add the app to your Home Screen** and **open it from the app icon** (not only inside Safari).

The app may show a **blue banner** with steps: Share → **Add to Home Screen** → open from the home screen → allow notifications.

---

## Add to Home Screen

### iPhone or iPad (Safari)

1. Open Training Schedule in **Safari** (not Chrome on iOS for the best install flow).
2. Tap the **Share** button (square with an arrow pointing up).
3. Scroll and tap **Add to Home Screen**.
4. Edit the name if you like, then tap **Add**.
5. **Open the app by tapping the new icon on your Home Screen**—not the Safari tab you used before.

### Android (Chrome)

1. Open Training Schedule in **Chrome**.
2. Tap the **menu** (⋮) in the top corner.
3. Tap **Install app** or **Add to Home screen** (wording varies by Chrome version).
4. Confirm. You can open the app from your home screen like any other app.

**Samsung Internet / other Android browsers:** Look for **Add to Home screen** or **Install** in the browser menu; behavior is similar to Chrome.

### Computer (Chrome, Edge, Brave)

1. Open Training Schedule in the browser.
2. Look for an **install** icon in the address bar, or use the browser menu → **Install Training Schedule** / **Install app**.
3. After installing, you can open it from your applications or taskbar.

---

## Enable push notifications

Permission must be allowed **for this site**. If you blocked notifications earlier, use your device settings to allow them (see [Troubleshooting](#troubleshooting)).

### iPhone / iPad (installed app from Home Screen)

1. Open **Training Schedule** using the **icon you added** (standalone app), not inside Safari.
2. Sign in as a **trainer**.
3. If you see a **green bar** asking you to get alerts on this device, tap **Enable notifications**.  
   Apple requires this to be started by **you tapping the button**—it may not appear if you only browse in Safari without installing.
4. When the system dialog appears, tap **Allow**.

If you never see the prompt, check **Settings → Notifications** on your device and ensure notifications are allowed for Training Schedule / the web app.

### Android (Chrome and similar)

1. Open the app in **Chrome** (installed shortcut or a tab—both can work on Android).
2. Sign in as a **trainer**.
3. When the browser asks to allow notifications, tap **Allow**.  
   If you dismissed it, use the lock or site icon in the address bar → **Notifications** → **Allow**, or **Chrome → Settings → Site settings → Notifications** for your site.

### Desktop (Chrome, Brave, Edge)

1. Sign in as a **trainer**.
2. When the browser asks **Allow notifications**, click **Allow**.  
   If you blocked the site before: click the lock or tune icon in the address bar → **Site settings** → set **Notifications** to **Allow**, then reload the page.

### Firefox (desktop / Android)

Web push support varies by platform and version. If notifications do not work, try **Chrome** or **Edge**, or on iPhone use **Safari** with **Add to Home Screen** as described above.

---

## What you might be notified about

Typical trainer alerts include:

- Someone **added** or **removed** training availability.
- Someone **joined** or **left** an event (including optional notes when someone leaves).

Exact wording depends on your team’s language and settings.

---

## Troubleshooting

| Issue | What to try |
|--------|-------------|
| No “Allow notifications” on iPhone | Install with **Add to Home Screen**, open from the **home screen icon**, sign in as trainer, use the **Enable notifications** button in the green bar if it appears. |
| Still no alerts on iPhone | **Settings → Notifications** — find Training Schedule / Safari / the web app and turn notifications **on**. Ensure **Focus** / Do Not Disturb is not blocking. |
| Worked before, stopped now | Open the app again while online; if you cleared site data or reinstalled the browser, **allow notifications** again when asked. |
| Android: no prompt | Chrome → **Site settings** for this URL → **Notifications** → **Allow**. |
| Two devices | Each device must **sign in** and **allow notifications** on that device. |
| I’m not a trainer | Only **trainer** (and sometimes **admin**) accounts receive these pushes. |

If your team uses a **staging** or test URL and **production** URL, use the same URL you were given—tokens and permissions are **per site**.

---

## Privacy and turning notifications off

- You can **revoke** notification permission anytime: browser or phone **Settings** for this site or app.
- **Signing out** stops this app from associating new alerts with your account on that device; your administrator manages who has the trainer role.

---

## Need more help?

Contact your **team administrator** or coach. For technical documentation aimed at developers (FCM, PWA, environment), see [README.md](README.md) and [docs/FCM_WEB_PUSH.md](docs/FCM_WEB_PUSH.md).
