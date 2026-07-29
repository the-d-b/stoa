---
id: stocks
name: Stocks
category: Finance
tags: [finance, stocks, crypto, built-in]
official_url: https://finance.yahoo.com
status: tested
polling: 5min
secret_format: none
url_required: false
---

# Stocks

## What is Stocks?

Stocks is a built-in Stoa feature — not a self-hosted app you deploy — that shows US stock quotes with mini sparklines, sourced from the free public Yahoo Finance API. No account or key is needed; you just list ticker symbols in the panel config.

**Data source:** [finance.yahoo.com](https://finance.yahoo.com)

---

## Getting the key

None — Yahoo Finance is a public API, no credentials required.

- **Secret format:** none
- **URL:** none (standalone)

---

## Add it to Stoa

1. **Admin → Integrations → New** — select **Stocks**, no URL, no secret.
2. **Admin → Panels → New** — select **Stocks**, and enter ticker symbols in the panel config (e.g. `AAPL, MSFT, NVDA`).

---

## Panel

US stock quotes with mini sparklines for recent price movement. Sourced from Yahoo Finance.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Ticker symbols + current prices + change % |
| 2-3x | Ticker list with sparklines |
| 4x+ | Full grid with price, change, sparkline, and market cap |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
