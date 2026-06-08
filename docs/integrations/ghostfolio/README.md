# Ghostfolio

**Category:** Finance | **Status:** Need Testing | **Polling:** 5 min

---

## Integration

**Secret format:** Security token

> Ghostfolio -> User Account -> Security Token (the token shown on your account page, used for anonymous auth).

**URL required:** Required

**Example URL:** `http://192.168.1.10:3333`

### Setup

1. Ghostfolio -> User Account -> copy Security Token
2. Admin -> Secrets -> New: paste the token
3. Admin -> Integrations -> New: type Ghostfolio, URL = http://ghostfolio:3333, secret
4. Admin -> Panels -> New: type Ghostfolio

---

## Panel

Current net worth, today/year/all-time performance with color-coded returns, a multi-segment holdings donut showing allocation by asset, and a full holdings list.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Net worth + today change % + all-time return % + holding count |
| 2-3x | Net worth + performance trio + allocation bar + top holdings list |
| 4x+ | Large net worth + performance table + holdings donut + full holdings list |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Stoa exchanges the security token for a short-lived JWT on each refresh.