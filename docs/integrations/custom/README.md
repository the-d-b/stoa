---
id: custom
name: Text / HTML
category: Stoa Features
tags: [custom, built-in]
status: tested
---

# Text / HTML

## What is the Text / HTML panel?

Text / HTML is a built-in Stoa panel that renders arbitrary HTML you write directly into the panel config — no integration or external service needed. Handy for freeform notes, full-panel images, or embedding MJPEG camera streams.

---

## Panel

A freeform panel that renders arbitrary HTML content. Write anything directly into the panel config - no integration or external service needed.

### Height behavior

| Height | What you see |
|---|---|
| 1x | HTML content (compact) |
| 2-3x | HTML content |
| 4x+ | HTML content (full) |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*

---

## Notes

Use `<img src='...' style='width:100%;height:100%;object-fit:cover;display:block;'>` for full-panel images. Supports Frigate and Blue Iris MJPEG live streams.
