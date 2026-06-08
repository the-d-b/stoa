# Coinbase

**Category:** Finance | **Status:** Need Testing | **Polling:** 5 min

---

## Integration

**Secret format:** apiKey:apiSecret

> Coinbase -> Settings -> API -> New API Key (read-only). Store as apiKey:apiSecret (colon-separated).

**URL required:** None (Coinbase cloud API)

### Setup

1. Coinbase -> Settings -> API -> New API Key (read-only scopes)
2. Format as apiKey:apiSecret
3. Admin -> Secrets -> New: paste the credential
4. Admin -> Integrations -> New: type Coinbase, no URL, secret = apiKey:apiSecret
5. Admin -> Panels -> New: type Coinbase

---

## Panel

Total portfolio value in USD, per-asset allocation donut, and full account list with crypto quantities and native USD values.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Total USD value + asset count |
| 2-3x | Total value + account list with USD values and quantities |
| 4x+ | Total value + allocation donut + full account list with proportional bars |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Stoa signs requests with HMAC-SHA256 using the secret. Zero-balance accounts are filtered out.