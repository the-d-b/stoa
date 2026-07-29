---
id: omv
name: OpenMediaVault
category: Storage & Virtualization
tags: [nas, storage, self-hosted]
official_url: https://www.openmediavault.org
status: needs-testing
polling: 30s
secret_format: username-password
url_required: true
example_url: http://192.168.1.10
---

# OpenMediaVault

## What is OpenMediaVault?

OpenMediaVault (OMV) is a free, Debian-based NAS operating system. It provides a web interface for managing disks, filesystems, and network shares (SMB/NFS/FTP and more), with a plugin system for extra services — a lightweight, fully open-source way to build a home NAS.

**Official site:** [openmediavault.org](https://www.openmediavault.org)

---

## Getting the key

Use your OMV WebUI login in `username:password` form (e.g. `admin:yourpassword`).

- **Secret format:** `username:password`
- **URL:** required — point at your OMV host, e.g. `http://192.168.1.10`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste `admin:yourpassword`.
2. **Admin → Integrations → New** — select **OpenMediaVault**, enter the URL, choose the secret.
3. **Admin → Panels → New** — select **OpenMediaVault**.

---

## Panel

CPU usage, memory usage, per-interface network throughput, filesystem usage, disk temperatures and SMART status.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Compact stats only |
| 2-3x | Network + filesystem rows |
| 4x+ | Full disk table + all stats |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
