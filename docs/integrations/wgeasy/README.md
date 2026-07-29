---
id: wgeasy
name: wg-easy
category: Network & Security
tags: [vpn, self-hosted]
official_url: https://github.com/wg-easy/wg-easy
status: needs-testing
polling: 30s
secret_format: password
url_required: true
example_url: http://192.168.1.10:51821
---

# wg-easy

## What is wg-easy?

wg-easy is the easiest way to run your own WireGuard VPN server. It wraps WireGuard in a simple web UI for creating and managing client configs (with QR codes for phones), so you can set up secure remote access to your home network without hand-editing WireGuard config files.

**Official site:** [github.com/wg-easy/wg-easy](https://github.com/wg-easy/wg-easy)

---

## Getting the key

Use your wg-easy web-UI password (bare — no username). Leave the secret blank for a no-auth instance.

- **Secret format:** bare password (no username)
- **URL:** required — point at your wg-easy port, e.g. `http://192.168.1.10:51821`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste the password (or leave blank for a no-auth instance).
2. **Admin → Integrations → New** — select **wg-easy**, enter the URL, choose the secret.
3. **Admin → Panels → New** — select **wg-easy**.

---

## Panel

WireGuard VPN server status and client roster — connected/total client counts, per-client handshake recency, and transfer stats.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Connected/total clients + aggregate TX/RX |
| 2-3x | Stat chips + scrollable client list |
| 4x+ | Connected/total donut + stat chips + full client table |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*

---

## Notes

Client status: green = connected (handshake <3 min), grey = enabled/idle, dark = disabled.
