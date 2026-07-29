---
id: nextdns
name: NextDNS
category: Network & Security
tags: [dns, adblock, cloud]
official_url: https://nextdns.io
status: needs-testing
polling: 30s
secret_format: api-key
url_required: true
example_url: https://api.nextdns.io/profiles/{profileId}
---

# NextDNS

## What is NextDNS?

NextDNS is a cloud-based DNS resolver that blocks ads, trackers, and malware and enforces filtering and parental-control policies at the DNS level — the cloud counterpart to Pi-hole and AdGuard Home. In Stoa the integration reads your profile's query analytics through the NextDNS API.

**Official site:** [nextdns.io](https://nextdns.io)

---

## Getting the key

NextDNS → **Account → API Key** — copy it. Find your Profile ID in the NextDNS dashboard URL, and build the API URL from it.

- **Secret format:** plain API key
- **URL:** required — your profile API endpoint, `https://api.nextdns.io/profiles/{profileId}`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste the API key.
2. **Admin → Integrations → New** — select **NextDNS**, enter the profile API URL, choose the secret.
3. **Admin → Panels → New** — select **NextDNS**.

---

## Panel

Cloud DNS analytics — total queries, blocked queries and percentage, encrypted %, IPv6 %. 24-hour hourly timeline, top blocked domains, top querying clients, block reason breakdown.

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
