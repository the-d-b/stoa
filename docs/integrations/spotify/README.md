---
id: spotify
name: Spotify
category: Music
tags: [music, streaming, cloud, oauth]
official_url: https://www.spotify.com
status: needs-testing
polling: 30s
secret_format: oauth
url_required: false
---

# Spotify

## What is Spotify?

Spotify is the leading music-streaming service. Its Web API exposes what you're currently playing, recently played, and your top tracks/artists — which is what Stoa's now-playing panel shows after you connect via OAuth.

**Official site:** [spotify.com](https://www.spotify.com)

> **Spotify Premium required.** The Spotify Web API — which powers all data in this panel (now playing, recently played, top tracks) — is only available to Spotify Premium subscribers for new developer apps. Free-tier accounts will see the Web API option greyed out in the Spotify Developer Dashboard. If you have Spotify Free, [Last.fm](../lastfm/) is a practical alternative that shows the same data via scrobbling.

---

## Getting the key

Create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) (Premium required), enable **Web API**, and add your Stoa callback as a redirect URI. Copy the **Client ID** and **Client Secret**.

- **Secret format:** `clientId:clientSecret`
- **URL:** none — OAuth against Spotify's cloud API

> Spotify requires **HTTPS** for all redirect URIs except `http://localhost`. If you access Stoa via a plain IP on HTTP, the OAuth flow will fail — a reverse proxy with TLS termination is required. The exact redirect URI to register is shown on the integration edit page (`https://your-stoa-hostname/api/spotify/callback`).

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste `clientId:clientSecret`.
2. **Admin → Integrations → New** — select **Spotify**, no URL, choose the secret.
3. Click **Edit** on the integration → under **Spotify Account**, click **Connect Spotify**, and approve access on Spotify's consent screen.
4. **Admin → Panels → New** — select **Spotify**.

---

## Panel

Now-playing panel — current or most recently played track with album art, live progress bar, and playback controls. Recent play history at taller heights.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Track name · artist · playing indicator |
| 2–3x | Track info + progress bar |
| 4x+ | Album art + full track info + progress bar + controls + recent play history |

### Playback controls

Play, pause, skip previous, and skip next — shown at 4x+ height. Controls are gated behind Premium; they are hidden automatically for Free accounts even if the panel otherwise loads.

### Screenshots

*No screenshots yet — this integration has not been tested. If you get it running, screenshots would be a welcome contribution (see the main README for how to help).*

---

## Notes

- **HTTPS required** — Spotify does not accept `http://` redirect URIs for non-localhost addresses. Your Stoa instance must be behind a reverse proxy with TLS termination
- Access tokens are stored server-side and refreshed automatically — your Spotify credentials never reach the browser
- The exact redirect URI to register in the Spotify Developer Dashboard is displayed on the integration edit page in Stoa
- If you're on Spotify Free, consider [Last.fm](../lastfm/) instead — it integrates with Spotify via scrobbling, has no subscription requirement, and shows equivalent data (now playing, top tracks, top artists, recent history)
