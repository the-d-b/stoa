# Stocks

**Category:** Finance | **Status:** Tested | **Polling:** 5 min

---

## Integration

**Secret format:** Blank - no API key needed

> Yahoo Finance is a public API. No credentials required.

**URL required:** None (standalone)

### Setup

1. Admin -> Integrations -> New: type Stocks, no URL, no secret
2. Admin -> Panels -> New: type Stocks - enter ticker symbols in panel config (e.g. AAPL, MSFT, NVDA)

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