---
id: rss
name: RSS Feed
category: Online Content
tags: [news, feeds]
official_url:
status: tested
polling: 5min
secret_format: none
url_required: false
example_url: https://example.com/feed.xml
---

# RSS / Atom

## What is RSS?

RSS (and Atom) are open web-feed formats that publish a site's latest content — articles, blog posts, podcasts, release notes — in a machine-readable stream. The RSS panel shows items from any feed URL you point it at; no account needed.

---

## Getting the key

None for public feeds — leave the secret blank. For password-protected feeds, paste a Bearer token. The feed URL is configured **per panel**, not per integration, so one RSS integration can back many panels pointing at different feeds.

- **Secret format:** none (public feeds) or a Bearer token (authenticated feeds)
- **URL:** the feed URL, set in each panel's config, e.g. `https://example.com/feed.xml`

---

## Add it to Stoa

1. **Admin → Integrations → New** — select **RSS**, leave URL blank, no secret.
2. **Admin → Panels → New** — select **RSS**, and enter the specific feed URL in the panel config.

---

## Panel

Items from any RSS or Atom feed — title, summary, and link. The feed URL is configured per panel, so a single RSS integration can back multiple panels pointing to different feeds.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Latest item title + source + age |
| 2-3x | Item list with summaries |
| 4x+ | Full item list with content preview |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*

---

## Notes

A single RSS integration can serve multiple panels each pointing to different feed URLs.
