# Tailscale

**Category:** VPN & Security | **Status:** Need Testing | **Polling:** 60 s

---

## Integration

**Secret format:** API token (tskey-api-...)

> Tailscale admin console -> Settings -> Keys -> Generate access token. The token starts with tskey-api-.

**URL required:** None (Tailscale cloud API)

### Setup

1. Tailscale admin console -> Settings -> Keys -> Generate access token
2. Admin -> Secrets -> New: paste the token
3. Admin -> Integrations -> New: type Tailscale, no URL, secret = token
4. Admin -> Panels -> New: type Tailscale

---

## Panel

Mesh VPN device roster - online/offline status, Tailscale IP, OS, assigned user, and role (exit node, subnet router). Surfaces update availability, key expiry warnings, and unauthorized devices.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Online/total + updates + exit nodes + offline count |
| 2-3x | Online/total donut + stat chips + device list |
| 4x+ | Donut + full stat chips + device table with OS/user/roles/expiry |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

No URL field - Stoa calls the Tailscale API directly at api.tailscale.com.