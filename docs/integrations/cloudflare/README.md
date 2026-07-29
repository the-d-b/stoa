---
id: cloudflare
name: Cloudflare
category: Network & Security
tags: [dns, proxy, cloud]
official_url: https://www.cloudflare.com
status: needs-testing
polling: 5min
secret_format: api-key
url_required: false
---

# Cloudflare

## What is Cloudflare?

Cloudflare is a global network that sits in front of your websites and services, providing DNS, CDN caching, DDoS protection, a web application firewall, and Zero Trust tunnels. In Stoa the integration reads your zone analytics and Cloudflare Tunnel health through the Cloudflare API.

**Official site:** [cloudflare.com](https://www.cloudflare.com)

---

## Getting the key

Recommended: Cloudflare → **Profile → API Tokens → Create Token** with **Zone:Read + Analytics:Read + Tunnel:Read**. Legacy: your account email + global API key, colon-separated.

- **Secret format:** scoped API token (recommended) or `email:globalApiKey` (legacy)
- **URL:** none — Stoa calls the Cloudflare cloud API directly

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste the API token.
2. **Admin → Integrations → New** — select **Cloudflare**, no URL needed, choose the secret.
3. **Admin → Panels → New** — select **Cloudflare**.

---

## Panel

Zone list with 24h analytics (requests, threats blocked, bandwidth, unique visitors) and tunnel health. Each tunnel shows connection status, active PoP connections, and ingress rules.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Requests + threats + tunnel health + zone count |
| 2-3x | Aggregate chips + tunnel list + zone list |
| 4x+ | Two-column: full tunnel detail (ingress rules) + full zone list |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*

---

## Notes

No URL field — Stoa calls the Cloudflare API directly. Scoped tokens are strongly recommended over the Global API Key.
