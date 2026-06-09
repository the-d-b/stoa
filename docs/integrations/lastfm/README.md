# Last.fm

**Category:** Music | **Status:** Need Testing | **Polling:** 30 s

---

## Integration

**Secret format:** username:apiKey

> Your Last.fm username + API key from last.fm/api (free, no OAuth required). Format: yourusername:yourapikey

**URL required:** None (Last.fm API)

### Setup

1. Get a free Last.fm API key at last.fm/api -> Create API Account
2. Format as yourusername:yourapikey
3. Admin -> Secrets -> New: paste the credential
4. Admin -> Integrations -> New: type Last.fm, no URL, secret = username:apiKey
5. Admin -> Panels -> New: type Last.fm

---

## Panel

Music scrobbling panel - now playing indicator, current/recent track with artist/album, lifetime scrobble count, top artists bar chart, top tracks and albums (7-day window).

### Height behavior

| Height | What you see |
|---|---|
| 1x | Now-playing dot + track + artist + scrobble count |
| 2-3x | Now-playing section + recent scrobble list |
| 4x+ | Album art + full stats + top artists chart + top tracks/albums |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

No OAuth required. Profile must be public.