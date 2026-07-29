---
id: docspell
name: Docspell
category: Digital Life
tags: [documents, self-hosted]
official_url: https://docspell.org
status: needs-testing
polling: 15min
secret_format: username-password
url_required: true
example_url: http://192.168.1.10:7880
---

# Docspell

## What is Docspell?

Docspell is a self-hosted document organizer. It ingests your files (email, scans, uploads), OCRs and auto-tags them, links documents to people and organizations, and makes everything full-text searchable — an open-source document archive.

**Official site:** [docspell.org](https://docspell.org)

---

## Getting the key

Use your Docspell account credentials. Stoa exchanges them for a session token.

- **Secret format:** `account:password` — `collective/user:password` for multi-collective setups, or `user:password` for a single collective
- **URL:** required — point at your Docspell port, e.g. `http://192.168.1.10:7880`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste the credential.
2. **Admin → Integrations → New** — select **Docspell**, enter the URL, choose the secret.
3. **Admin → Panels → New** — select **Docspell**.

---

## Panel

Document archive stats (item count, storage, tag count) and a recent document list with name, date, correspondent, folder, and tags.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Items + storage + tags |
| 2-3x | Chips + recent document list |
| 4x+ | Two-column: stats + full recent list |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
