---
id: netbird
name: Netbird
category: Network & Security
tags: [vpn, mesh, self-hosted]
official_url: https://netbird.io
status: needs-testing
polling: 60s
secret_format: api-key
url_required: true
example_url: https://api.netbird.io
---

# Netbird

## What is Netbird?

NetBird is an open-source, self-hostable mesh VPN built on WireGuard — a Tailscale-style overlay network. It connects your machines into a secure peer-to-peer network with a central management plane for peers, groups, and access policies, available either as a hosted cloud service or fully self-hosted.

**Official site:** [netbird.io](https://netbird.io)

---

## Getting the key

NetBird → **Settings → Personal Access Tokens → Create** — copy the token.

- **Secret format:** Personal Access Token (PAT)
- **URL:** required — `https://api.netbird.io` for cloud, or your management URL for self-hosted

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste the PAT.
2. **Admin → Integrations → New** — select **Netbird**, enter the URL (cloud or self-hosted), choose the secret.
3. **Admin → Panels → New** — select **Netbird**.

---

## Panel

WireGuard mesh VPN panel — peer roster with online/offline/expired status, last-seen time, OS, IP, SSH status, group membership, and policy list.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Online/offline/expired + groups + policies |
| 2-3x | Chips + peer list + group list |
| 4x+ | Two-column: full peer detail / groups + policy list |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
