---
id: monica
name: Monica
category: Digital Life
tags: [contacts, self-hosted]
official_url: https://www.monicahq.com
status: needs-testing
polling: 15min
secret_format: api-key
url_required: true
example_url: http://192.168.1.10:8080
---

# Monica

## What is Monica?

Monica is a self-hosted personal CRM (a "personal relationship manager"). It helps you remember details about the people in your life — conversations, important dates, gift ideas, and reminders — so you can stay in better touch, all kept private on your own server.

**Official site:** [monicahq.com](https://www.monicahq.com)

---

## Getting the key

Monica → **Settings → API → Personal Access Tokens → Create** — copy the token.

- **Secret format:** Bearer token
- **URL:** required — point at your Monica port, e.g. `http://192.168.1.10:8080`

---

## Add it to Stoa

1. **Admin → Secrets → New** — paste the token.
2. **Admin → Integrations → New** — select **Monica**, enter the URL, choose the secret.
3. **Admin → Panels → New** — select **Monica**.

---

## Panel

Personal CRM panel — total contact count and upcoming reminders with contact name, date, and days until. Color-coded for reminders due today or within the week.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Contact count + imminent reminders |
| 2-3x | Reminder list |
| 4x+ | Full reminder list with dates and contact detail |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
