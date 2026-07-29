---
id: omada
name: Omada SDN
category: Network & Security
tags: [network, wifi]
official_url: https://www.omadanetworks.com
status: needs-testing
polling: 30s
secret_format: username-password
url_required: true
example_url: https://192.168.1.10:8043
---

# Omada SDN

## What is Omada SDN?

TP-Link Omada is a software-defined networking (SDN) controller for TP-Link's Omada line of access points, switches, and gateways. It centralizes management, monitoring, and configuration of that hardware across one or more sites from a single controller — a self-hostable alternative to per-device management.

---

## Getting the key

Use your Omada controller login in `username:password` form. Requires Omada **5.0+** with the Open API (v2) enabled in controller settings.

- **Secret format:** `username:password`
- **URL:** required, HTTPS — e.g. `https://192.168.1.10:8043`

---

## Add it to Stoa

1. Ensure Omada 5.0+ and enable the Open API in the controller settings.
2. **Admin → Secrets → New** — paste `username:password`.
3. **Admin → Integrations → New** — select **Omada**, enter the URL, choose the secret.
4. **Admin → Panels → New** — select **Omada**.

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
