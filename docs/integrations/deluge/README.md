# Deluge

**Category:** Downloads | **Status:** Need Testing | **Polling:** 30 s

---

## Integration

**Secret format:** Bare password (no username)

> Just the password - no username. Deluge Web UI authenticates with a password only.

**URL required:** Required

**Example URL:** `http://192.168.1.10:8112`

### Setup

1. Your Deluge Web UI password (no username needed)
2. Admin -> Secrets -> New: paste the password
3. Admin -> Integrations -> New: type Deluge, URL = http://deluge:8112, secret
4. Admin -> Panels -> New: type Deluge

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