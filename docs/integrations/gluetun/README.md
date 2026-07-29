---
id: gluetun
name: Gluetun
category: Network & Security
tags: [vpn, self-hosted]
official_url: https://github.com/qdm12/gluetun
status: tested
polling: 60s
secret_format: api-key
url_required: true
example_url: http://192.168.1.10:8000
---

# Gluetun

## What is Gluetun?

Gluetun is a lightweight VPN client that runs in a Docker container. You route other containers' traffic through it so their internet access always goes over a commercial VPN — with a built-in kill switch — and it exposes a small control server reporting VPN status, public IP, and forwarded ports. It's most commonly used to keep download clients behind a VPN.

**Official site:** [github.com/qdm12/gluetun](https://github.com/qdm12/gluetun)

---

## Getting the key

Gluetun exposes a control server on port 8000 by default. **Gluetun v3.40+** requires an API key for the restricted routes (`/v1/publicip/ip`, `/v1/vpn/settings`) — without one the panel shows only VPN status and forwarded port. Create an auth role by mounting a file at `/gluetun/auth/config.toml` inside the container:

```toml
[[roles]]
name = "stoa"
auth = "apikey"
apikey = "your-long-random-key"
routes = [
  "GET /v1/publicip/ip",
  "GET /v1/vpn/settings",
  "GET /v1/vpn/status",
  "GET /v1/openvpn/status",
  "GET /v1/openvpn/portforwarded",
  "GET /v1/portforward",
]
```

Restart Gluetun after adding it. (Generate a key with e.g. `openssl rand -hex 24`.)

- **Secret format:** control-server API key (blank works only on pre-3.40 Gluetun)
- **URL:** required — point at the control server, e.g. `http://192.168.1.10:8000`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste the API key.
2. **Admin → Integrations → New** — select **Gluetun**, enter the URL, choose the secret (leave blank only for pre-3.40 Gluetun).
3. **Admin → Panels → New** — select **Gluetun**.

---

## Panel

VPN status, current public IP address and geo-location, WireGuard/OpenVPN mode indicator.

### Height behavior

| Height | What you see |
|---|---|
| 1x | VPN status + public IP + location |
| 2-3x | Status + IP + location + VPN mode |
| 4x+ | Full detail including port forwarding status |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
