# Plex

**Category:** Media Servers | **Status:** Tested | **Polling:** 60 s

---

## Integration

**Secret format:** Plex token (`X-Plex-Token`)

> Sign in at plex.tv, then get your token from any Plex API request header, or visit plex.tv/web in a browser, open DevTools Network tab, find any /library request, and copy the X-Plex-Token query param.

**URL required:** Required

**Example URL:** `http://192.168.1.10:32400`

### Setup

1. Get your Plex token (see Secret hint above)
2. Admin -> Secrets -> New: paste the token
3. Admin -> Integrations -> New: type Plex, URL = http://your-plex:32400, secret = above
4. Admin -> Panels -> New: type Plex, select integration

---

## Panel

Active streams with user, title, and progress. Library counts. Update availability indicator.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Active stream count + currently playing title |
| 2-3x | Stream list + library counts |
| 4x+ | Full stream detail + library breakdown + update indicator |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*