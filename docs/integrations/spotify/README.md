# Spotify

**Category:** Music | **Status:** Requires Premium — untested | **Polling:** 30 s

---

> **Spotify Premium required.** The Spotify Web API — which powers all data in this panel (now playing, recently played, top tracks) — is only available to Spotify Premium subscribers for new developer apps. Free-tier accounts will see the Web API option greyed out in the Spotify Developer Dashboard. If you have Spotify Free, [Last.fm](../lastfm/) is a practical alternative that shows the same data via scrobbling.

---

## Integration

**Secret format:** `clientId:clientSecret`

> Spotify Developer Dashboard → Create App → copy Client ID and Client Secret, formatted as `clientId:clientSecret`

**URL required:** None (OAuth — Spotify cloud API)

### Setup

1. Go to **developer.spotify.com/dashboard** and log in with your Spotify account (Premium required)
2. Click **Create app**, give it a name, and under **Which API/SDKs are you planning to use?** check **Web API**
3. Under **Redirect URIs**, add your Stoa callback URL — the integration edit page shows the exact value:
   ```
   https://your-stoa-hostname/api/spotify/callback
   ```
   > Spotify requires **HTTPS** for all redirect URIs except `http://localhost`. If you access Stoa via a plain IP address on HTTP, the OAuth flow will fail. A reverse proxy with TLS termination is required.
4. Save the app. Go to **Settings** and copy your **Client ID** and **Client Secret**
5. Stoa → **Admin → Secrets → New**: paste `clientId:clientSecret` (colon-separated, no other prefix)
6. Stoa → **Admin → Integrations → New** → select **Spotify**, no URL needed, select the secret → **Save**
7. Click **Edit** on the integration → under **Spotify Account**, click **Connect Spotify**
8. You'll be redirected to Spotify's consent screen — approve access and you'll be returned to Stoa with the account connected
9. Stoa → **Admin → Panels → New** → select **Spotify**, select the integration

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
