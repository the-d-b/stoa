# OPNsense

**Category:** Networking | **Status:** Tested | **Polling:** 30 s (SSE stream)

---

## Integration

**Secret format:** key:secret

> OPNsense -> System -> Access -> Users -> edit API user -> + New API Key. You get a key + secret pair - join them with a colon: key:secret

**URL required:** Required

**Example URL:** `https://192.168.1.1`

### Setup

1. OPNsense -> System -> Access -> Users -> API user -> + New API Key
2. Format as key:secret (colon-separated)
3. Admin -> Secrets -> New: paste the credential
4. Admin -> Integrations -> New: type OPNsense, URL = https://opnsense-ip, secret

---

## Panel

Interface traffic rates (live SSE stream), firewall event donut, top WAN talkers, DNS stats, PF states, firmware version.

### Height behavior

| Height | What you see |
|---|---|
| 1x | WAN/LAN throughput + PF states |
| 2-3x | Interface rates + firewall donut |
| 4x+ | Full dashboard + top talkers + DNS stats |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Enable Skip TLS verify if using the OPNsense self-signed certificate.