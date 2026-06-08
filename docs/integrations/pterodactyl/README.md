# Pterodactyl

**Category:** Gaming | **Status:** Need Testing | **Polling:** 60 s

---

## Integration

**Secret format:** Client API key (Bearer)

> Pterodactyl -> Account -> API Credentials -> Create API Key (client key, not admin key).

**URL required:** Required

**Example URL:** `http://192.168.1.10`

### Setup

1. Pterodactyl -> Account (top right) -> API Credentials -> Create API Key
2. Admin -> Secrets -> New: paste the key
3. Admin -> Integrations -> New: type Pterodactyl, URL = http://pterodactyl, secret
4. Admin -> Panels -> New: type Pterodactyl

---

## Panel

All servers accessible to your API key with state (running/starting/stopping/offline), CPU, memory, disk, and uptime.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Running/total count |
| 2-3x | Compact server list with state and CPU/RAM |
| 4x+ | Full server cards with resource bars and uptime |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Use the client API key (from Account), not the admin API key.