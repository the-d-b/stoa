---
id: scrutiny
name: Scrutiny
category: Storage & Virtualization
tags: [storage, monitoring, self-hosted]
official_url: https://github.com/AnalogJ/scrutiny
status: needs-testing
polling: 5min
secret_format: none
url_required: true
example_url: http://192.168.1.10:8080
---

# Scrutiny

## What is Scrutiny?

Scrutiny is a self-hosted dashboard for hard-drive SMART health. It collects SMART attributes from your disks, tracks temperature and error trends over time, and warns before a drive fails — wrapping the raw `smartd` data in a clean web UI so you can spot a dying disk early.

**Official site:** [github.com/AnalogJ/scrutiny](https://github.com/AnalogJ/scrutiny)

---

## Getting the key

None — Scrutiny runs unauthenticated by default. Leave the secret blank.

- **Secret format:** none (leave blank)
- **URL:** required — point at your Scrutiny port, e.g. `http://192.168.1.10:8080`

---

## Add it to Stoa

1. **Admin → Integrations → New** — select **Scrutiny**, enter the URL, leave the secret as **None**.
2. **Admin → Panels → New** — select **Scrutiny**.

---

## Panel

Hard drive SMART health — fleet health donut showing passed/warning/failed drive counts, per-drive temperature bars, power-on hours, and reallocated/pending sector warnings.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Healthy/warning/failed counts + avg temp |
| 2-3x | Summary chips + per-drive list with status and temperature |
| 4x+ | Fleet health donut + full drive detail with model, capacity, temps, sectors |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*

---

## Notes

Temperature bars: green <40C, amber 40-49C, red >=50C.
