# Prometheus

**Category:** Monitoring | **Status:** Need Testing | **Polling:** 30 s

---

## Integration

**Secret format:** Blank (open) or username:password or Bearer token

> Most home lab Prometheus instances run open (no auth). If you added auth via a reverse proxy, use the matching format.

**URL required:** Required

**Example URL:** `http://192.168.1.10:9090`

### Setup

1. If no auth: leave secret blank
2. If Basic Auth: format as username:password; if Bearer: paste bare token
3. Admin -> Secrets -> New: paste credential (or leave blank)
4. Admin -> Integrations -> New: type Prometheus, URL = http://prometheus:9090, secret
5. Admin -> Panels -> New: type Prometheus - add custom PromQL queries in panel config

---

## Panel

Scrape target health by job, active alerting rule status (firing/pending with severity), Prometheus version, and optional custom PromQL metric cards with 60-minute sparklines.

### Height behavior

| Height | What you see |
|---|---|
| 1x | N/M targets up + firing alert count + custom metric values |
| 2-3x | Health donut + chips + custom metric cards + firing alert list |
| 4x+ | Donut + chips + custom metrics + three-column: jobs / alerts / target health |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Custom PromQL metric cards: add up to 8 expressions in the panel config JSON. Each renders with current value, optional unit suffix, and 1-hour sparkline.