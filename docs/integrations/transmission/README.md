# Transmission

**Category:** Downloads | **Status:** Tested | **Polling:** 30 s

---

## Integration

**Secret format:** username:password or blank (if auth disabled)

> Your Transmission Web UI credentials. Leave blank if you disabled authentication in Transmission settings.

**URL required:** Required

**Example URL:** `http://192.168.1.10:9091`

### Setup

1. Format as username:password (or leave blank if no auth)
2. Admin -> Secrets -> New: paste credential
3. Admin -> Integrations -> New: type Transmission, URL = http://transmission:9091, secret
4. Admin -> Panels -> New: type Transmission

---

## Panel

Active downloads with progress and speed, seeding count, total upload/download stats.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Speed + status counts |
| 2-3x | Speed + active torrent list with progress bars |
| 4x+ | Speed + tracker breakdown + full torrent list |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*