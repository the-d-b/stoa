# wg-easy

**Category:** VPN & Security | **Status:** Need Testing | **Polling:** 30 s

---

## Integration

**Secret format:** Bare password (no username)

> Your wg-easy web UI password. Leave blank for no-auth instances.

**URL required:** Required

**Example URL:** `http://192.168.1.10:51821`

### Setup

1. Your wg-easy password (bare, no username)
2. Admin -> Secrets -> New: paste the password (or leave blank if no auth)
3. Admin -> Integrations -> New: type wg-easy, URL = http://wgeasy:51821, secret
4. Admin -> Panels -> New: type wg-easy

---

## Panel

WireGuard VPN server status and client roster - connected/total client counts, per-client handshake recency, and transfer stats.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Connected/total clients + aggregate TX/RX |
| 2-3x | Stat chips + scrollable client list |
| 4x+ | Connected/total donut + stat chips + full client table |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Client status: green = connected (handshake <3 min), grey = enabled/idle, dark = disabled.