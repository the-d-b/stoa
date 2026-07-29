---
id: fireflyiii
name: Firefly III
category: Finance
tags: [finance, budgeting, self-hosted]
official_url: https://www.firefly-iii.org
status: needs-testing
polling: 60min
secret_format: api-key
url_required: true
example_url: http://192.168.1.10:8080
---

# Firefly III

## What is Firefly III?

Firefly III is a self-hosted personal finance manager. You record income and expenses across accounts, organize them with budgets, categories, and bills, and track net worth over time — a private, double-entry alternative to commercial budgeting apps.

**Official site:** [firefly-iii.org](https://www.firefly-iii.org)

---

## Getting the key

Firefly III → **Profile** (top-right) → **OAuth → Personal Access Tokens → Create new token** — copy it.

- **Secret format:** Personal Access Token (PAT)
- **URL:** required — point at your Firefly III port, e.g. `http://192.168.1.10:8080`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste the token.
2. **Admin → Integrations → New** — select **Firefly III**, enter the URL, choose the secret.
3. **Admin → Panels → New** — select **Firefly III**.

---

## Panel

Monthly summary figures (earned, spent, net worth, bills paid/unpaid, left to spend, net savings) and asset account balances.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Net worth + earned + spent + left to spend |
| 2-3x | Summary chips + full monthly summary + account list |
| 4x+ | Large net-worth header + monthly summary column + account balances column |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*

---

## Calendar

Add Firefly III as a calendar source (Profile/Admin → Calendar panel → Calendar sources → **Stoa integration**) to see upcoming bill payment dates and recurring transactions on the calendar. Each expected payment appears as an all-day "Due soon" event 3 days before its due date; recurring bills show every occurrence in the window. See [Calendar](../calendar/README.md#firefly-iii) for details.

---

## Notes

Summary figures cover the current calendar month. Polls hourly - financial data changes infrequently.
