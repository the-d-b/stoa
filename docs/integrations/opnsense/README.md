---
id: opnsense
name: OPNsense
category: Network & Security
tags: [firewall, router, vpn, self-hosted]
official_url: https://opnsense.org
status: tested
polling: 30s
secret_format: composite
url_required: true
example_url: https://192.168.1.1
---

# OPNsense

## What is OPNsense?

OPNsense is an open-source, FreeBSD-based firewall and routing platform. It handles perimeter firewalling, VPNs, traffic shaping, and intrusion detection through a web UI, and is a popular open alternative to commercial firewall appliances (and a fork-sibling of pfSense).

**Official site:** [opnsense.org](https://opnsense.org)

---

## Getting the key

OPNsense → **System → Access → Users** → edit your API user → **+ New API Key**. You get a key + secret pair — join them with a colon.

- **Secret format:** `key:secret` (colon-separated)
- **URL:** required, HTTPS — e.g. `https://192.168.1.1`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste `key:secret`.
2. **Admin → Integrations → New** — select **OPNsense**, enter the URL, choose the secret. Enable **Skip TLS verify** for the self-signed certificate.
3. **Admin → Panels → New** — select **OPNsense**.

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
