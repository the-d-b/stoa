# ruTorrent

**Category:** Downloads | **Status:** Need Testing | **Polling:** 30 s

---

## Integration

**Secret format:** username:password or blank

> Your ruTorrent HTTP Basic Auth credentials, or blank if no auth is configured.

**URL required:** Required

**Example URL:** `http://192.168.1.10:8080`

### Setup

1. Format as username:password (or leave blank if no auth)
2. Admin -> Secrets -> New: paste credential
3. Admin -> Integrations -> New: type ruTorrent, URL = http://rutorrent:8080, secret
4. Admin -> Panels -> New: type ruTorrent

---

## Panel

Active downloads with progress and speed, seeding count, free disk space. Tracker breakdown when the httprpc plugin is available.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Speed + status counts |
| 2-3x | Speed + torrent list with progress bars |
| 4x+ | Speed + tracker breakdown + full torrent list |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*