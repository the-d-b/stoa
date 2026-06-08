# NZBGet

**Category:** Downloads | **Status:** Need Testing | **Polling:** 15 s

---

## Integration

**Secret format:** username:password

> Your NZBGet control user credentials. Default is nzbget:tegbzn6789 (change it!).

**URL required:** Required

**Example URL:** `http://192.168.1.10:6789`

### Setup

1. Format as username:password (NZBGet control user)
2. Admin -> Secrets -> New: paste credential
3. Admin -> Integrations -> New: type NZBGet, URL = http://nzbget:6789, secret
4. Admin -> Panels -> New: type NZBGet

---

## Panel

Live download speed, queue with per-group progress bars, free disk space, and recent history.

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