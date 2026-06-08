# SABnzbd

**Category:** Downloads | **Status:** Need Testing | **Polling:** 15 s

---

## Integration

**Secret format:** Plain API key

> SABnzbd -> Config -> General -> API Key

**URL required:** Required

**Example URL:** `http://192.168.1.10:8080`

### Setup

1. SABnzbd -> Config -> General -> copy API Key
2. Admin -> Secrets -> New: paste the key
3. Admin -> Integrations -> New: type SABnzbd, URL = http://sabnzbd:8080, secret
4. Admin -> Panels -> New: type SABnzbd

---

## Panel

Live download speed, queue with per-slot progress bars, and recent history.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Speed + status chip + queue count |
| 2-3x | Speed header + full queue list with progress bars |
| 4x+ | Speed + stats + history + queue slots |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*