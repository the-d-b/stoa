---
id: unraid
name: Unraid
category: Storage & Virtualization
tags: [nas, storage, virtualization, self-hosted]
official_url: https://unraid.net
status: needs-testing
polling: 30s
secret_format: username-password
url_required: true
example_url: http://192.168.1.10
---

# Unraid

## What is Unraid?

Unraid is a NAS and application-server operating system built around a flexible, parity-protected array that lets you mix drive sizes and expand one disk at a time. Beyond storage it runs Docker containers and virtual machines, which makes it a popular all-in-one home-server OS.

**Official site:** [unraid.net](https://unraid.net)

---

## Getting the key

Use your Unraid WebUI login in `username:password` form (e.g. `root:yourpassword`).

- **Secret format:** `username:password`
- **URL:** required — point at your Unraid host, e.g. `http://192.168.1.10`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste `root:yourpassword` (or your admin user).
2. **Admin → Integrations → New** — select **Unraid**, enter the URL, choose the secret.
3. **Admin → Panels → New** — select **Unraid**.

---

## Panel

CPU usage (per-core and aggregate), memory usage, network throughput, array disk temperatures, running VMs and Docker containers. Uses a persistent WebSocket connection for live data.

### Height behavior

| Height | What you see |
|---|---|
| 1x | CPU/RAM/disk summary |
| 2-3x | Host stats + network |
| 4x+ | All + disk temperatures + container/VM detail |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
