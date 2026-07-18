# Gluetun

**Category:** VPN & Security | **Status:** Tested | **Polling:** 60 s

---

## Integration

**Secret format:** Control-server API key (required for full data on Gluetun v3.40+; blank works only on older versions)

> Gluetun v3.40+ requires an API key for `/v1/publicip/ip` and `/v1/vpn/settings` — without one, the panel shows only VPN status and forwarded port (no public IP, location, or provider). The status and port-forward routes stay public for backwards compatibility, which is why a keyless setup looks "half working".

**URL required:** Required

**Example URL:** `http://192.168.1.10:8000`

### Setup

1. Gluetun exposes a control server on port 8000 by default
2. **Gluetun v3.40+:** create an auth role so Stoa can read the restricted routes. Mount a file at `/gluetun/auth/config.toml` inside the Gluetun container:

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
3. Stoa -> Admin -> Secrets -> New: paste the API key
4. Admin -> Integrations -> New: type Gluetun, URL = http://gluetun:8000, select the secret (leave blank only for pre-3.40 Gluetun)
5. Admin -> Panels -> New: type Gluetun

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