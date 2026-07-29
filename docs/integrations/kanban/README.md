---
id: kanban
name: Kanban
category: Stoa Features
tags: [tasks, built-in]
status: tested
---

# Kanban

## What is Kanban?

Kanban is a built-in Stoa panel for tracking tasks on boards — no external service or integration needed; data is stored locally in Stoa. Cards move across swim lanes (Not Started → In Progress → On Hold → Completed → Cancelled), with drag-and-drop on desktop and a lane picker on mobile.

---

## Panel

Task tracking panel - multiple named boards per panel. List view (flat table with status filter pills) and Board view (5 swim lanes: Not Started / In Progress / On Hold / Completed / Cancelled). Drag and drop on desktop; lane picker + Move button on mobile.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Board list + card counts + overdue indicator |
| 2-3x | Board list + status summary badges |
| 4x+ | Board selector + full card grid preview |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*

---

## Notes

Cards have: title (required), status, due date (optional), notes (optional). Add as a calendar source to show cards with due dates on the Calendar.
