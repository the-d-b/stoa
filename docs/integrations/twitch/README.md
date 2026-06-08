# Twitch

**Category:** Content | **Status:** Need Testing | **Polling:** 60 s

---

## Integration

**Secret format:** clientId:clientSecret

> Twitch Developer Console (dev.twitch.tv/console) -> Register Your Application -> copy Client ID and Client Secret. Format: clientId:clientSecret

**URL required:** None (OAuth - Twitch Helix API)

### Setup

1. Twitch Developer Console -> Register Your Application -> set Redirect URI to http://your-stoa:8080/api/twitch/callback
2. Copy Client ID and Client Secret; format as clientId:clientSecret
3. Admin -> Secrets -> New: paste the credential
4. Admin -> Integrations -> New: type Twitch, no URL, secret = clientId:clientSecret
5. On the integration edit page, click Connect Twitch to authorize via OAuth (scope: user:read:follows)

---

## Panel

Live stream feed panel - followed channels currently live with channel name, stream category, viewer count, and uptime. 2-column thumbnail grid at 4x+.

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