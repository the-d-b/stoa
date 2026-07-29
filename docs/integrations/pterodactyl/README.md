---
id: pterodactyl
name: Pterodactyl
category: Gaming
tags: [gaming, self-hosted]
official_url: https://pterodactyl.io
status: needs-testing
polling: 60s
secret_format: api-key
url_required: true
example_url: http://192.168.1.10
---

# Pterodactyl

## What is Pterodactyl?

Pterodactyl is an open-source game-server management panel. It runs game servers in isolated Docker containers and gives admins and users a web UI to deploy, control, and monitor them, with resource limits and multi-node support.

**Official site:** [pterodactyl.io](https://pterodactyl.io)

---

## Getting the key

Pterodactyl → **Account** (top right) → **API Credentials → Create API Key**. Use the **client** key (`ptlc_…`), not the admin key.

- **Secret format:** client API key (Bearer)
- **URL:** required — point at your Pterodactyl panel, e.g. `http://192.168.1.10`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste the client API key.
2. **Admin → Integrations → New** — select **Pterodactyl**, enter the URL, choose the secret.
3. **Admin → Panels → New** — select **Pterodactyl**.

---

## Panel

All servers accessible to your API key with state (running/starting/stopping/offline), CPU, memory, disk, and uptime.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Running/total count |
| 2-3x | Compact server list with state and CPU/RAM |
| 4x+ | Full server cards with resource bars and uptime |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*

---

## Notes

Use the client API key (from Account), not the admin API key.
