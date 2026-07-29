---
id: youtube
name: YouTube
category: Online Content
tags: [video, streaming, cloud, oauth]
official_url: https://www.youtube.com
status: tested
polling: 60min
secret_format: oauth
url_required: false
---

# YouTube

## What is YouTube?

YouTube is the world's largest video-sharing platform. Stoa connects via Google OAuth to read your subscription feed and show recent uploads from the channels you follow, playable inline in the panel.

**Official site:** [youtube.com](https://www.youtube.com)

---

## Getting the key

OAuth 2.0 credentials from the Google Cloud Console. No URL is needed — Stoa calls the YouTube Data API v3 directly.

> **Already have a Google Calendar integration?** You can add YouTube to the same Google Cloud project — enable the YouTube Data API v3 on the existing project and add the YouTube redirect URI to the same OAuth client.

1. [console.cloud.google.com](https://console.cloud.google.com) → **New Project** (or open your existing Stoa project)
2. **APIs & Services → Library** → search **YouTube Data API v3** → **Enable**
3. **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID** → Application type **Web application** → under **Authorized redirect URIs** add `https://your-stoa-domain/api/youtube/callback` → **Create**, then copy the **Client ID** and **Client Secret**

- **Secret format:** `clientId:clientSecret` (no spaces)
- **URL:** none — always uses the YouTube Data API v3

> **Redirect URI must be publicly routable.** Google does not allow `http://` for non-localhost redirect URIs. On first connect, Google may show an "unverified app" warning — this is expected for personal projects; choose **Advanced → Go to [app]** to proceed.

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste `clientId:clientSecret`.
2. **Admin → Integrations → New** — select **YouTube**, no URL, choose the secret.
3. On the integration edit page, click **Connect YouTube** and complete the Google OAuth consent flow — the page should then show your channel name.
4. **Admin → Panels → New** — select **YouTube**.

> **Personal integrations:** Non-admin users can create YouTube integrations from their profile page under **My Integrations**; the OAuth flow works identically.

---

## Panel

Subscription feed showing recent videos from channels you follow. Videos are sorted by publish date — newest first. Click any video to watch it inline via an embedded player with full-screen support. Use the **← Back** button to return to the feed.

The feed is cached server-side for 55 minutes. Stoa fetches your top 25 subscriptions by relevance, pulls the 3 most recent uploads per channel, and returns the 30 newest across all of them.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Latest video — title, channel name, age |
| 2x | Header + 3 most recent videos as compact rows |
| 3x | Header + 7 most recent videos as compact rows |
| 4x | Header + 1 featured hero thumbnail (latest) + scrollable list of remaining videos |
| 5x+ | Header + 2 side-by-side hero thumbnails + scrollable list of remaining videos |

### Video player

Clicking any video or thumbnail opens an inline YouTube embed within the panel. The player supports fullscreen via YouTube's native button. Clicking **← Back** dismisses the player and returns to the feed at any panel size.

### Screenshots

| | Dark | Light |
|---|---|---|
| **1x** | ![1x dark](./screenshots/1x-dark.png) | ![1x light](./screenshots/1x-light.png) |
| **2x** | ![2x dark](./screenshots/2x-dark.png) | ![2x light](./screenshots/2x-light.png) |
| **3x** | ![3x dark](./screenshots/3x-dark.png) | ![3x light](./screenshots/3x-light.png) |
| **4x** | ![4x dark](./screenshots/4x-dark.png) | ![4x light](./screenshots/4x-light.png) |
| **5x** | ![5x dark](./screenshots/5x-dark.png) | ![5x light](./screenshots/5x-light.png) |
| **Playing** | ![playing dark](./screenshots/video-playing-dark.png) | ![playing light](./screenshots/video-playing-light.png) |

---

## Notes

- **Quota:** YouTube Data API v3 free tier is 10,000 units/day. Stoa uses ~27 units per feed refresh. At the default 60-minute poll interval that is ~648 units/day — well within the free limit
- **Feed source:** Videos come from your YouTube subscriptions, not recommendations. Channels you are not subscribed to will not appear
- **Curating the feed:** Subscribe only to the channels you want to see in Stoa. The feed refreshes within 55 minutes; to force an immediate refresh, disconnect and reconnect the integration
- **Token refresh:** Access tokens are refreshed automatically when they approach expiry — no manual re-authorization needed
- **Shared vs personal:** YouTube integrations can be created as system-wide (admin) or personal (per-user). Each user connecting their own account needs their own integration and OAuth authorization
