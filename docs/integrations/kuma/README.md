---
id: kuma
name: Uptime Kuma
category: Network & Security
tags: [monitoring, self-hosted]
official_url: https://github.com/louislam/uptime-kuma
status: tested
polling: 60s
secret_format: api-key
url_required: true
example_url: http://192.168.1.10:3001
---

# Uptime Kuma

## What is Uptime Kuma?

Uptime Kuma is a self-hosted uptime monitoring tool — a lightweight, open-source alternative to services like UptimeRobot. It periodically checks your websites, services, and hosts (HTTP, TCP, ping, DNS, and more), tracks response times and uptime percentages, and can notify you the moment something goes down.

**Official site:** [github.com/louislam/uptime-kuma](https://github.com/louislam/uptime-kuma)

---

## Getting the key

Kuma 1.23+: **Settings → API Keys → Add**. Older versions run without auth — leave the secret blank.

- **Secret format:** plain API key (Kuma 1.23+), or blank for older versions
- **URL:** required — point at your Kuma port, e.g. `http://192.168.1.10:3001`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste the key, or leave blank.
2. **Admin → Integrations → New** — select **Uptime Kuma**, enter the URL, choose the secret.
3. **Admin → Panels → New** — select **Uptime Kuma**.

---

## Panel

Monitor status (up/down/pending), response times, uptime percentages, incident history.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Up/down count + overall status |
| 2-3x | Monitor list with status dots + response times |
| 4x+ | Full monitor list + uptime bars + incident history |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
