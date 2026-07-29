---
id: paperless
name: Paperless-ngx
category: Digital Life
tags: [documents, self-hosted]
official_url: https://docs.paperless-ngx.com
status: needs-testing
polling: 5min
secret_format: api-key
url_required: true
example_url: http://192.168.1.10:8000
---

# Paperless-ngx

## What is Paperless-ngx?

Paperless-ngx is a self-hosted document management system. It scans, OCRs, tags, and archives your paper documents into a searchable digital library, automatically pulling out dates, correspondents, and types — a private way to go paperless.

**Official site:** [docs.paperless-ngx.com](https://docs.paperless-ngx.com)

---

## Getting the key

Paperless-ngx → **Settings → API → Generate Token** — copy it.

- **Secret format:** API token
- **URL:** required — point at your Paperless-ngx port, e.g. `http://192.168.1.10:8000`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste the token.
2. **Admin → Integrations → New** — select **Paperless-ngx**, enter the URL, choose the secret.
3. **Admin → Panels → New** — select **Paperless-ngx**.

---

## Panel

Total document count, inbox count, document type breakdown (donut chart), tag proportional bars in each tag's own color, correspondent breakdown, and a recent document list with direct links.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Total docs + inbox count + correspondent count + tag count |
| 2-3x | Stat chips + recent document list |
| 4x+ | Left: stats + doc type donut + tag bars + correspondent bars \| Right: recent document list |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*

---

## Notes

Recent document links open directly in the Paperless UI.
