---
id: truenas
name: TrueNAS
category: Storage & Virtualization
tags: [nas, storage, self-hosted]
official_url: https://www.truenas.com
status: tested
polling: 30s
secret_format: api-key
url_required: true
example_url: http://192.168.1.10
---

# TrueNAS

## What is TrueNAS?

TrueNAS is an open-source storage operating system built on ZFS. It turns a dedicated machine into a NAS/SAN — managing pools of disks with snapshots, replication, and end-to-end data-integrity checks — and layers on file sharing (SMB/NFS/iSCSI) plus apps and VMs. It ships in two editions: SCALE (Linux-based) and CORE (FreeBSD-based).

**Official site:** [truenas.com](https://www.truenas.com)

---

## Getting the key

TrueNAS → **Credentials → API Keys → Add** — copy the key.

- **Secret format:** plain API key
- **URL:** required — point at your TrueNAS host, e.g. `http://192.168.1.10`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste the API key.
2. **Admin → Integrations → New** — select **TrueNAS**, enter the URL, choose the secret.
3. **Admin → Panels → New** — select **TrueNAS**.

---

## Panel

CPU, RAM, ARC, disk I/O, network throughput, pool health, disk temperatures, alerts, VMs, apps. Uses a persistent WebSocket connection — data updates every ~2 seconds.

### Height behavior

| Height | What you see |
|---|---|
| 1x | CPU/RAM/pool summary |
| 2-3x | Host stats + network + pool health |
| 4x+ | Full stats + disk temperatures + VM/app counts |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*

---

## Notes

Works with both TrueNAS SCALE and TrueNAS CORE. WebSocket connection provides ~2s live updates.
