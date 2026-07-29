---
id: crypto
name: Crypto
category: Finance
tags: [finance, crypto, built-in]
official_url: https://www.coingecko.com
status: tested
polling: 5min
secret_format: none
url_required: false
---

# Crypto

## What is Crypto?

Crypto is a built-in Stoa feature — not a self-hosted app you deploy — that shows cryptocurrency prices with sparklines, sourced from CoinGecko. It works keyless (subject to rate limits) or with a free CoinGecko Demo key for reliability; you list coin IDs in the panel config.

**Data source:** [coingecko.com](https://www.coingecko.com)

---

## Getting the key

Optional. The public CoinGecko API works without a key but has strict rate limits — get a free **Demo** key at coingecko.com for reliable use.

- **Secret format:** blank, or an optional CoinGecko Demo API key
- **URL:** none (standalone)

---

## Add it to Stoa

1. Optionally get a free Demo API key at coingecko.com.
2. **Admin → Integrations → New** — select **Crypto**, no URL, secret = API key (or blank).
3. **Admin → Panels → New** — select **Crypto**, and enter coin IDs in the panel config.

---

## Panel

Cryptocurrency prices with sparklines, sourced from CoinGecko.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Coin symbols + current prices + change % |
| 2-3x | Coin list with sparklines |
| 4x+ | Full grid with price, change, sparkline, and market cap |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
