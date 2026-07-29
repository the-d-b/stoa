---
id: synology
name: Synology DSM
category: Storage & Virtualization
tags: [nas, storage]
official_url: https://www.synology.com
status: needs-testing
polling: 30s
secret_format: username-password
url_required: true
example_url: http://192.168.1.10:5000
---

# Synology DSM

## What is Synology DSM?

Synology DiskStation Manager (DSM) is the operating system that runs on Synology NAS appliances. It manages storage volumes and RAID, serves files over SMB/NFS/AFP, and runs a large ecosystem of first-party apps (Photos, Drive, Surveillance Station, and more) through a polished web-based desktop.

**Official site:** [synology.com](https://www.synology.com)

---

## Getting the key

Use your Synology DSM login in `username:password` form (e.g. `admin:yourpassword`). A dedicated read-only account is recommended.

- **Secret format:** `username:password`
- **URL:** required — point at your DSM port, e.g. `http://192.168.1.10:5000`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste `admin:yourpassword` (use a dedicated account if possible).
2. **Admin → Integrations → New** — select **Synology**, enter the URL, choose the secret.
3. **Admin → Panels → New** — select **Synology**.

---

## Panel

CPU, memory, network, volume health, disk temperatures and SMART status, shared folder list. Shows hostname, model, DSM version, and uptime.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Compact arcs only |
| 2-3x | Network + volume rows + disk temperatures + shares |
| 4x+ | Full disk table + per-interface network breakdown |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*

---

## Notes

Degraded volumes show an amber warning badge in the panel header at any height.
