# Spotify

**Category:** Music | **Status:** Tested | **Polling:** 30 s

---

## Integration

**Secret format:** clientId:clientSecret

> Spotify Developer Dashboard (developer.spotify.com) -> Create App -> copy Client ID and Client Secret. Format: clientId:clientSecret

**URL required:** None (OAuth - Spotify cloud API)

### Setup

1. Spotify Developer Dashboard -> Create App -> set Redirect URI to http://your-stoa:8080/api/spotify/callback
2. Copy Client ID and Client Secret; format as clientId:clientSecret
3. Admin -> Secrets -> New: paste the credential
4. Admin -> Integrations -> New: type Spotify, no URL, secret = clientId:clientSecret
5. On the integration edit page, click Connect Spotify to authorize via OAuth

---

## Panel

Now-playing panel - current or most recently played track with album art, progress bar, and playback controls (Premium). Recent play history at taller heights.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Now-playing indicator + track + artist |
| 2-3x | Album art + track info + progress bar + controls |
| 4x+ | All of above + recent play history |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Playback controls require Spotify Premium. Controls proxy through the Stoa backend - your access token never reaches the browser.