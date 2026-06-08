# Homebox

**Category:** Personal | **Status:** Need Testing | **Polling:** 15 min

---

## Integration

**Secret format:** email:password

> Your Homebox login. Format: user@example.com:yourpassword

**URL required:** Required

**Example URL:** `http://192.168.1.10:7745`

### Setup

1. Format as email:password (your Homebox login)
2. Admin -> Secrets -> New: paste the credential
3. Admin -> Integrations -> New: type Homebox, URL = http://homebox:7745, secret
4. Admin -> Panels -> New: type Homebox

---

## Panel

Home inventory panel - total items, locations, labels, warranty count, and inventory value. Per-location item counts with proportional bars.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Total items + locations + warranties |
| 2-3x | Stat chips + location list |
| 4x+ | Stat chips + location bars + value breakdown |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*