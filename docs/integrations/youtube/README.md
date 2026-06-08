# YouTube

**Category:** Content | **Status:** Experimental | **Polling:** 60 min

---

## Integration

**Secret format:** clientId:clientSecret

> Google Cloud Console -> APIs & Services -> Credentials -> Create OAuth 2.0 Client ID (Web application). Enable the YouTube Data API v3. Set Redirect URI to http://your-stoa:8080/api/youtube/callback. Format: clientId:clientSecret

**URL required:** None (OAuth - Google/YouTube API)

### Setup

1. Google Cloud Console -> create a project -> enable YouTube Data API v3
2. APIs & Services -> Credentials -> Create OAuth 2.0 Client ID (Web app)
3. Set Authorized Redirect URI to http://your-stoa-host:8080/api/youtube/callback
4. Copy Client ID and Client Secret; format as clientId:clientSecret
5. Admin -> Secrets -> New: paste the credential
6. Admin -> Integrations -> New: type YouTube, no URL, secret = clientId:clientSecret
7. On the integration edit page, click Connect YouTube to authorize via OAuth

---

## Panel

YouTube subscription feed - recent videos from channels you follow with thumbnail grid (4x+), scrollable list (2-3x), or summary bar (1x). Click any video to watch it inline via embedded player. YouTubes built-in fullscreen button works from the embedded player.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Latest video title + channel + age |
| 2-3x | Profile header + scrollable video list |
| 4x+ | Profile header + thumbnail grid (16:9 thumbnails, click to play inline) |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Quota: YouTube Data API v3 free tier is 10,000 units/day. Stoa uses ~27 units per refresh. At the default 60-minute poll interval, that is ~648 units/day - well within the free limit. Feed data is cached for 55 minutes server-side.