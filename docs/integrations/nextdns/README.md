# NextDNS

**Category:** DNS & Proxy | **Status:** Need Testing | **Polling:** 30 s

---

## Integration

**Secret format:** Plain API key

> NextDNS -> Account -> API Key

**URL required:** None (cloud API - Profile ID configured in integration settings)

### Setup

1. NextDNS -> Account -> copy API Key
2. Note your Profile ID from the NextDNS dashboard URL
3. Admin -> Secrets -> New: paste the API key
4. Admin -> Integrations -> New: type NextDNS, no URL, secret = API key

---

## Panel

Cloud DNS analytics - total queries, blocked queries and percentage, encrypted %, IPv6 %. 24-hour hourly timeline, top blocked domains, top querying clients, block reason breakdown.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Query count + blocked count + encrypted % + IPv6 % |
| 2-3x | Arc gauge + stat chips + 24h sparkline |
| 4x+ | All + three-column: top blocked + top clients + block reason breakdown |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*