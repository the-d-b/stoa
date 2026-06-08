# Omada SDN

**Category:** Networking | **Status:** Need Testing | **Polling:** 30 s

---

## Integration

**Secret format:** username:password

> Omada controller login credentials. Requires Omada 5.0+ with Open API v2 enabled.

**URL required:** Required

**Example URL:** `https://192.168.1.10:8043`

### Setup

1. Omada 5.0+ required; enable Open API in the controller settings
2. Format secret as username:password
3. Admin -> Secrets -> New: paste the credential
4. Admin -> Integrations -> New: type Omada, URL = https://omada-controller:8043, secret

---

## Panel

Device status across gateways, APs, and switches with online/offline counts. Total client counts, per-site breakdown, device list, recent alerts.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Device and client counts |
| 2-3x | Device type badges + wireless/wired split + site list |
| 4x+ | All + scrollable device list + client list + alerts |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*