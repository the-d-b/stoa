---
id: pihole
name: Pi-hole
category: Network & Security
tags: [dns, adblock, self-hosted]
official_url: https://pi-hole.net
status: needs-testing
polling: 30s
secret_format: api-key
url_required: true
example_url: http://192.168.1.10
---

# Pi-hole

## What is Pi-hole?

Pi-hole is a self-hosted, network-wide DNS ad and tracker blocker. It acts as your LAN's DNS resolver, blocking requests to known ad, tracking, and malware domains for every device on the network — no per-device software required — and reports on exactly what it blocked.

**Official site:** [pi-hole.net](https://pi-hole.net)

---

## Getting the key

- **v5:** Pi-hole → **Settings → API / Web interface → Show API token** — copy it.
- **v6:** use your Pi-hole web-UI password (or an app password).

Stoa auto-detects the Pi-hole version at connection time.

- **Secret format:** API token (v5) or web password (v6)
- **URL:** required — point at your Pi-hole, e.g. `http://192.168.1.10`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste the token (v5) or password (v6).
2. **Admin → Integrations → New** — select **Pi-hole**, enter the URL, choose the secret.
3. **Admin → Panels → New** — select **Pi-hole**.

---

## Panel

DNS query statistics — total queries, blocked percentage, unique clients, gravity size. 24-hour query timeline, top blocked domains, top querying clients, query type breakdown, upstream resolver distribution.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Query count + blocked % + client count + gravity size |
| 2-3x | Arc gauge + stat chips + 24h sparkline |
| 4x+ | All + top blocked domains + top clients + query type + upstream resolvers |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*

---

## Notes

Stoa auto-detects the Pi-hole version at connection time.
