# Cloudflare

**Category:** DNS & Proxy | **Status:** Tested | **Polling:** 5 min

---

## Integration

**Secret format:** Scoped API token or email:globalApiKey (legacy)

> Recommended: Cloudflare -> Profile -> API Tokens -> Create Token with Zone:Read + Analytics:Read + Tunnel:Read. Legacy: account email + global API key separated by colon.

**URL required:** None (Cloudflare cloud API)

### Setup

1. Cloudflare -> Profile -> API Tokens -> Create Token -> Zone:Read + Analytics:Read + Tunnel:Read
2. Admin -> Secrets -> New: paste the token
3. Admin -> Integrations -> New: type Cloudflare, no URL needed, secret = token
4. Admin -> Panels -> New: type Cloudflare

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

No URL field - Stoa calls the Cloudflare API directly. Scoped tokens are strongly recommended over the Global API Key.