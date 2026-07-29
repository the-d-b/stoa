---
id: twitch
name: Twitch
category: Online Content
tags: [video, streaming, cloud, oauth]
official_url: https://www.twitch.tv
status: needs-testing
polling: 60s
secret_format: oauth
url_required: false
---

# Twitch

## What is Twitch?

Twitch is the leading live-streaming platform for gaming and creators. Stoa connects via OAuth to show which of the channels you follow are currently live, with category, viewer count, and uptime.

**Official site:** [twitch.tv](https://www.twitch.tv)

---

## Getting the key

Register an app in the [Twitch Developer Console](https://dev.twitch.tv/console) → **Register Your Application** → set the Redirect URI to `http://your-stoa:8080/api/twitch/callback` → copy the **Client ID** and **Client Secret**.

- **Secret format:** `clientId:clientSecret`
- **URL:** none — OAuth against the Twitch Helix API

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste `clientId:clientSecret`.
2. **Admin → Integrations → New** — select **Twitch**, no URL, choose the secret.
3. On the integration edit page, click **Connect Twitch** to authorize via OAuth (scope: `user:read:follows`).
4. **Admin → Panels → New** — select **Twitch**.

---

## Panel

Live stream feed panel — followed channels currently live with channel name, stream category, viewer count, and uptime. 2-column thumbnail grid at 4x+.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Live count badge + top channel name/game |
| 2-3x | Profile header + compact stream list |
| 4x+ | Profile header + 2-column thumbnail grid (440x248 previews) |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*

---

## Notes

Empty state when no followed channels are live.
