---
id: qnap
name: QNAP QTS
category: Storage & Virtualization
tags: [nas, storage]
official_url: https://www.qnap.com
status: needs-testing
polling: 30s
secret_format: username-password
url_required: true
example_url: http://192.168.1.10:8080
---

# QNAP QTS

## What is QNAP QTS?

QNAP QTS is the operating system that runs on QNAP NAS appliances. It manages storage volumes and RAID, serves network shares, and runs a broad app catalog — multimedia, backup, virtualization, and containers — through its web-based desktop.

**Official site:** [qnap.com](https://www.qnap.com)

---

## Getting the key

Use your QNAP WebUI login in `username:password` form (e.g. `admin:yourpassword`).

- **Secret format:** `username:password`
- **URL:** required — point at your QNAP host, e.g. `http://192.168.1.10:8080`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste `admin:yourpassword`.
2. **Admin → Integrations → New** — select **QNAP**, enter the URL, choose the secret.
3. **Admin → Panels → New** — select **QNAP**.

---

## Panel

CPU, memory, aggregate network, volume health, disk temperatures and SMART status, shared folder list. Shows hostname, model, firmware version, and uptime.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Compact arcs only |
| 2-3x | Disk temperature rows + shares |
| 4x+ | Full disk table with model, size, and SMART detail |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
