---
id: homebox
name: Homebox
category: Digital Life
tags: [inventory, self-hosted]
official_url: https://homebox.software
status: needs-testing
polling: 15min
secret_format: username-password
url_required: true
example_url: http://192.168.1.10:7745
---

# Homebox

## What is Homebox?

Homebox is a self-hosted home inventory manager. It catalogs your belongings by location and label, tracks purchase details, warranties, and values, and makes it easy to find what you own and where it is — handy for insurance and organization.

**Official site:** [homebox.software](https://homebox.software)

---

## Getting the key

Use your Homebox login in `email:password` form (e.g. `user@example.com:yourpassword`).

- **Secret format:** `email:password`
- **URL:** required — point at your Homebox port, e.g. `http://192.168.1.10:7745`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste the credential.
2. **Admin → Integrations → New** — select **Homebox**, enter the URL, choose the secret.
3. **Admin → Panels → New** — select **Homebox**.

---

## Panel

Home inventory panel — total items, locations, labels, warranty count, and inventory value. Per-location item counts with proportional bars.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Total items + locations + warranties |
| 2-3x | Stat chips + location list |
| 4x+ | Stat chips + location bars + value breakdown |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
