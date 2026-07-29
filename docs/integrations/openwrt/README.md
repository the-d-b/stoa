---
id: openwrt
name: OpenWrt
category: Network & Security
tags: [router, firewall, self-hosted]
official_url: https://openwrt.org
status: needs-testing
polling: 5s
secret_format: username-password
url_required: true
example_url: http://192.168.1.1
---

# OpenWrt

## What is OpenWrt?

OpenWrt is an open-source Linux operating system for routers and other network devices. It replaces stock vendor firmware with a fully configurable system — advanced networking, a package manager, and the LuCI web interface — giving you deep control over routing, WiFi, firewall, and network services.

**Official site:** [openwrt.org](https://openwrt.org)

---

## Getting the key

Use your OpenWrt login in `username:password` form. The default username is `root`.

- **Secret format:** `username:password` (e.g. `root:yourpassword`)
- **URL:** required — point at your router, e.g. `http://192.168.1.1`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste `root:yourpassword`.
2. **Admin → Integrations → New** — select **OpenWrt**, enter the URL, choose the secret.
3. **Admin → Panels → New** — select **OpenWrt**.

---

## Panel

Hostname, uptime, load average, memory usage, per-interface traffic rates (Mbps deltas), and WiFi client list with signal strength and per-client TX/RX rates.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Compact bar |
| 2-3x | Load/memory bars + interface list |
| 4x+ | All + WiFi client list with signal bars |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*

---

## Notes

Uses ubus JSON-RPC. Polls every 5 seconds for live interface stats.
