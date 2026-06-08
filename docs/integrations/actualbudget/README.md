# Actual Budget

**Category:** Finance | **Status:** Need Testing | **Polling:** 5 min

---

## Integration

**Secret format:** API key

> Set the API_KEY environment variable on the actual-http-api sidecar container. Use that same value here.

**URL required:** Required

**Example URL:** `http://192.168.1.10:5006`

### Setup

1. Deploy the actual-http-api sidecar alongside Actual Budget
2. Set API_KEY env var on the sidecar
3. Admin -> Secrets -> New: paste the API key
4. Admin -> Integrations -> New: type Actual Budget, URL = http://actual-http-api:5006, secret
5. Admin -> Panels -> New: type Actual Budget

---

## Panel

Envelope budgeting panel - monthly income, spending, and available balance with per-category-group progress bars, account balances split into on-budget and off-budget, and a prominent net worth figure.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Income + spent + balance + net worth |
| 2-3x | Summary chips + category group spending bars + account balances |
| 4x+ | Net worth header + three-column: accounts / budget bars / category breakdown |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Requires the unofficial actual-http-api sidecar. If you have multiple budgets, set budgetId in the panel config JSON.