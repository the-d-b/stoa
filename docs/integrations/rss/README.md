# RSS / Atom

**Category:** Content | **Status:** Tested | **Polling:** 5 min

---

## Integration

**Secret format:** Blank (public feeds) or Bearer token (authenticated feeds)

> Most RSS feeds are public - leave blank. For password-protected feeds, paste a Bearer token.

**URL required:** Feed URL (configured per panel, not per integration)

**Example URL:** `https://example.com/feed.xml`

### Setup

1. Admin -> Integrations -> New: type RSS, leave URL blank (or enter a default), no secret
2. Admin -> Panels -> New: type RSS - enter the specific feed URL in the panel config

---

## Panel

Items from any RSS or Atom feed - title, summary, and link. The feed URL is configured per panel, so a single RSS integration can back multiple panels pointing to different feeds.

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