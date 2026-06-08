# Nextcloud

**Category:** Storage | **Status:** Need Testing | **Polling:** 5 min

---

## Integration

**Secret format:** username:password

> Use an app password: Nextcloud -> Settings -> Security -> App passwords -> create one. Safer than your main password.

**URL required:** Required

**Example URL:** `https://cloud.example.com`

### Setup

1. Nextcloud -> Settings -> Security -> App passwords -> generate one
2. Format as username:app-password
3. Admin -> Secrets -> New: paste the credential
4. Admin -> Integrations -> New: type Nextcloud, URL = https://your-cloud, secret

---

## Panel

Active users in last 5m/1h/24h, storage free space, share counts by type, app update warnings, server info (PHP, database, memory).

### Height behavior

| Height | What you see |
|---|---|
| 1x | Users + files + free space + app updates |
| 2-3x | Stat chips + active user bars + share breakdown |
| 4x+ | Three-column: server info / users & activity / shares & storage |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Memory data requires the serverinfo app (enabled by default on most installs).