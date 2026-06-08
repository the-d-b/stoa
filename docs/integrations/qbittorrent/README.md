# qBittorrent

**Category:** Downloads | **Status:** Tested | **Polling:** 30 s

---

## Integration

**Secret format:** username:password

> Your qBittorrent WebUI login. Default is admin:adminadmin (change it!).

**URL required:** Required

**Example URL:** `http://192.168.1.10:8080`

### Setup

1. Format as username:password
2. Admin -> Secrets -> New: paste credential
3. Admin -> Integrations -> New: type qBittorrent, URL = http://qbittorrent:8080, secret
4. Admin -> Panels -> New: type qBittorrent

---

## Panel

Active downloads with progress and speed, seeding count, free disk space, tracker breakdown.

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