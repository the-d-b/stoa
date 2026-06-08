# Traefik

**Category:** DNS & Proxy | **Status:** Need Testing | **Polling:** 30 s

---

## Integration

**Secret format:** Blank (open) or username:password (Basic Auth) or Bearer token

> Most home lab Traefik instances run the dashboard open (no auth). If you added Basic Auth or a Bearer token, use that format.

**URL required:** Required

**Example URL:** `http://192.168.1.10:8080`

### Setup

1. No credential needed for open instances - leave secret blank
2. If Basic Auth: format as username:password; if Bearer token: paste bare token
3. Admin -> Integrations -> New: type Traefik, URL = http://traefik:8080, secret (or blank)
4. Admin -> Panels -> New: type Traefik

---

## Panel

HTTP/TCP route inventory with enabled/warning/disabled status, backend service health (servers UP/DOWN), TLS indicators, entry point labels, and provider badges.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Route count + backend health + active providers |
| 2-3x | Section chips + degraded backends + service list |
| 4x+ | Two-column: service list + route table |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Backend health requires Traefik health checks to be enabled for your services.