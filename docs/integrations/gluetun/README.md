# Gluetun

**Category:** VPN & Security | **Status:** Need Testing | **Polling:** 60 s

---

## Integration

**Secret format:** Blank or password if you configured Gluetun HTTP proxy auth

> Most Gluetun instances expose the control server without auth. Leave blank unless you added authentication.

**URL required:** Required

**Example URL:** `http://192.168.1.10:8000`

### Setup

1. Gluetun exposes a control server on port 8000 by default
2. Admin -> Integrations -> New: type Gluetun, URL = http://gluetun:8000, no secret (or password)
3. Admin -> Panels -> New: type Gluetun

---

## Panel

VPN status, current public IP address and geo-location, WireGuard/OpenVPN mode indicator.

### Height behavior

| Height | What you see |
|---|---|
| 1x | VPN status + public IP + location |
| 2-3x | Status + IP + location + VPN mode |
| 4x+ | Full detail including port forwarding status |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*