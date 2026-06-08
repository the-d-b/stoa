# Pi-hole

**Category:** DNS & Proxy | **Status:** Tested | **Polling:** 30 s

---

## Integration

**Secret format:** API token (v5) or web password (v6)

> v5: Pi-hole -> Settings -> API / Web interface -> Show API token. v6: your Pi-hole web UI password (or an app password).

**URL required:** Required

**Example URL:** `http://192.168.1.10`

### Setup

1. v5: Pi-hole -> Settings -> API / Web interface -> Show API token
2. v6: use your web UI password
3. Admin -> Secrets -> New: paste the token/password
4. Admin -> Integrations -> New: type Pi-hole, URL = http://pihole-ip, secret

---

## Panel

DNS query statistics - total queries, blocked percentage, unique clients, gravity size. 24-hour query timeline, top blocked domains, top querying clients, query type breakdown, upstream resolver distribution.

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