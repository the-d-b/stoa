---
id: iframe
name: Web Embed
category: Stoa Features
tags: [custom, built-in]
status: tested
---

# Web Embed

## What is the Web Embed panel?

Web Embed is a built-in Stoa panel that renders any URL inside an iframe filling the panel — useful for embedding web pages, dashboards, or other live content. No integration needed; the URL is set in the panel config.

---

## Panel

Renders any URL inside an iframe that fills the panel. Useful for embedding web pages, dashboards, or other live content.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Embedded page (compact view) |
| 2-3x | Embedded page |
| 4x+ | Embedded page (full height) |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*

---

## Notes

For image URLs, use a Text/HTML panel instead - the browser built-in image viewer does not resize to fit the panel dimensions.
