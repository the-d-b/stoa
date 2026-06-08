# Navidrome

**Category:** Photos & Libraries | **Status:** Need Testing | **Polling:** 30 s

---

## Integration

**Secret format:** username:password

> Your Navidrome login credentials. Format: admin:yourpassword

**URL required:** Required

**Example URL:** `http://192.168.1.10:4533`

### Setup

1. Format secret as username:password
2. Admin -> Secrets -> New: paste the formatted credential
3. Admin -> Integrations -> New: type Navidrome, URL, secret
4. Admin -> Panels -> New: type Navidrome

---

## Panel

Music library browser with built-in player. Choose a playlist, see the track list, and play music directly from the dashboard. Selected playlist persists per panel.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Playlist name + track count |
| 2-3x | Playlist selector + track list |
| 4x+ | Full player with album art, seek, prev/next |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*