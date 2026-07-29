---
id: nginxpm
name: Nginx Proxy Manager
category: Network & Security
tags: [proxy, self-hosted]
official_url: https://nginxproxymanager.com
status: tested
polling: 60s
secret_format: username-password
url_required: true
example_url: http://192.168.1.10:81
---

# Nginx Proxy Manager

## What is Nginx Proxy Manager?

Nginx Proxy Manager (NPM) is a web UI on top of nginx for running a reverse proxy without editing config files. You point domains at your internal services, and it manages the nginx configuration and free Let's Encrypt TLS certificates for you — a beginner-friendly way to expose homelab apps over HTTPS.

**Official site:** [nginxproxymanager.com](https://nginxproxymanager.com)

---

## Getting the key

Use your NPM web-UI login, colon-separated as `email:password` (e.g. `admin@example.com:yourpassword`). Stoa exchanges these for a session token via NPM's `/api/tokens` endpoint automatically — no separate API key needed.

- **Secret format:** `email:password`
- **URL:** required — your NPM base URL including port, e.g. `http://192.168.1.10:81`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste `youremail@example.com:yourpassword`.
2. **Admin → Integrations → New** — select **Nginx Proxy Manager**, enter the URL, choose the secret → **Save & Test**.
3. **Admin → Panels → New** — select **Nginx Proxy Manager**.

---

## Panel

Proxy host summary with enabled/disabled donut, SSL cert expiry countdown (color-coded by urgency), disabled host roster, redirect list, and stream/access-list counts.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Inline text: enabled/total hosts · SSL count · expired or expiring cert warnings |
| 2–3x | Enabled/total donut + stat chips (Enabled, Disabled, SSL, Redirects, Expiring/Expired) + full certificate list |
| 4x+ | Donut + chips + certificate list (up to 12, then "+N more") + disabled hosts only + redirect list + stream/access-list counts |

### Certificate expiry colors

| Color | Meaning |
|---|---|
| Green | Healthy (>30 days remaining) |
| Amber | Expiring soon (<30 days) |
| Orange | Expiring very soon (<7 days) |
| Red | Expired |

Let's Encrypt certificates show an **LE** badge. Certificates are always sorted most-urgent first so problems surface at the top.

### Proxy host list

At 4x+, only **disabled** hosts are listed — enabled hosts are already counted in the chips. With large numbers of proxy hosts this keeps the panel readable without a long list of entries that are all healthy.

### Screenshots

| | Dark | Light |
|---|---|---|
| **1x** | ![1x dark](./screenshots/1x-dark.png) | ![1x light](./screenshots/1x-light.png) |
| **2x** | ![2x dark](./screenshots/2x-dark.png) | ![2x light](./screenshots/2x-light.png) |
| **4x** | ![4x dark](./screenshots/4x-dark.png) | ![4x light](./screenshots/4x-light.png) |

---

## Notes

- Tokens are fetched once per day — a credential change in NPM requires a Stoa restart or a 23-hour wait for the cache to expire
- If you run NPM behind a reverse proxy with HTTPS, use your public HTTPS URL as the integration URL and enable **Skip TLS verification** if you use a self-signed certificate
- Streams and access lists are shown as counts only — there is no individual list view for those at any height
