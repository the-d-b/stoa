# AdGuard Home

**Category:** DNS & Proxy | **Status:** Need Testing | **Polling:** 30 s

---

## Integration

**Secret format:** username:password

> Your AdGuard Home WebUI login. Format: admin:yourpassword

**URL required:** Required

**Example URL:** `http://192.168.1.10:3000`

### Setup

1. Format secret as username:password
2. Admin -> Secrets -> New: paste the credential
3. Admin -> Integrations -> New: type AdGuard Home, URL = http://adguard:3000, secret
4. Admin -> Panels -> New: type AdGuard Home

---

## Panel

DNS query statistics - total queries, blocked percentage, per-category breakdown. 24-hour timeline, top blocked domains, top clients, top queried domains, upstream resolver breakdown, active blocklist inventory.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Query count + blocked % + avg latency + total rules |
| 2-3x | Arc gauge + stat chips + 24h sparkline |
| 4x+ | All + three-column: top blocked/queried + top clients/upstreams + blocklist table |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Safe Browsing, Safe Search, and Parental Control chips only appear when those features are enabled with non-zero counts.