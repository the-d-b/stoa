# Kanban Lite

Stoa includes a built-in task board system called **Kanban Lite** — real kanban board functionality scoped to what you actually need on a personal dashboard, without the overhead of a full project management tool like Vikunja or Plane.

All data is stored locally in Stoa's SQLite database. No external service, integration, or API key is required.

---

## Concepts

### Panels and boards

A **Kanban panel** is a dashboard widget that holds one or more named **boards**. Each board is independent — it has its own swim lanes and cards.

A single Kanban panel might hold:
- `Personal` — personal to-dos
- `Home` — household tasks
- `Work` — professional tasks

Or you might create separate panels for separate concerns and assign them to different groups.

### Cards

Each board contains **cards**. A card has:

| Field | Required | Description |
|---|---|---|
| Title | Yes | Short description of the task |
| Status | Yes | One of the five statuses below |
| Due date | No | Optional deadline, shown on the card and in the calendar |
| Notes | No | Free-text notes, included in full-text search |

### Statuses

Cards are assigned to one of five statuses, each with its own swim lane in board view:

| Status | Color |
|---|---|
| Not Started | Grey |
| In Progress | Blue |
| On Hold | Amber |
| Completed | Green |
| Cancelled | Red |

---

## Panel view

The Kanban panel on the dashboard shows the list of boards. Each board row displays:

- **Status dots** — small colored indicators for in-progress and not-started card counts, plus an overdue dot if any cards are past their due date.
- **Card count** — total cards in the board.
- **Due soon / Overdue** — amber count for cards due within 7 days; red count for past-due cards.

Click any board row to open the board overlay.

---

## Board overlay

The board overlay is a full-screen view of a single board. It has two views toggled via tabs:

### List view

A flat table of all cards with:

- **Status filter pills** — toggle any combination of Not Started / In Progress / On Hold / Completed / Cancelled. Multi-select: clicking multiple pills shows cards matching any of the selected statuses.
- **Sortable columns** — click Title, Status, or Due Date headers to sort ascending or descending.
- **Search** — full-text search bar filters by title and notes.
- **Add card** — inline form at the bottom of the list.

### Board view (Status)

Five swim lanes arranged horizontally, one per status. Each lane shows its cards stacked vertically.

**Desktop drag-and-drop:** Cards can be dragged between lanes (changing status) or reordered within a lane (changing sort order). Drag handles the full card surface. The drop animation completes before the change is persisted — the save fires after the animation, not on mouseup.

**Mobile:** On small screens, one lane is visible at a time. A lane picker at the top switches between statuses. Each card has a **Move** button to change its status without drag.

---

## Creating and editing cards

Click **+ Add card** in list view, or **+** in any swim lane in board view. The add form requires a title; status defaults to Not Started.

Click any card to open the edit modal. The modal shows all fields and allows changing status, due date, and notes. Status can also be changed from the status dropdown in the modal — changes made this way persist immediately via the same endpoint as drag-and-drop.

Closing the modal returns to the board overlay without navigating away.

---

## Calendar integration

Any Kanban panel can be added as a source to a Calendar panel. Cards with due dates appear as calendar events.

**What appears:** Cards with a due date set, excluding cards with status Completed or Cancelled.

**Event label:** Uses the board name and card title. The calendar source is labeled `Panel Title › Board Name`.

**Adding a Kanban source:**

In Admin → Panels (for system calendars) or Profile → Calendar Sources (for personal calendars):

1. Expand the calendar panel.
2. In the **Calendar sources** section, open the **+ Add source...** dropdown.
3. Select **Kanban** — only Kanban panels accessible to you appear (your own panels plus system panels shared to groups you belong to).
4. Select the board and click **Add**.

---

## Search

Kanban cards (title and notes) are included in Stoa's full-text search. Search results link directly to the board overlay for the matching card's board, regardless of which portico you are searching from.

---

## System vs. personal panels

Kanban panels follow the same system/personal model as all other panels.

**System panels** are created by admins and shared with groups. Every member of the assigned group sees the panel and its boards. If no group is assigned, the panel is visible to all users.

**Personal panels** are created by users from their profile and visible only to them.

Group membership also controls whether a Kanban panel appears as an available calendar source — a user only sees Kanban panels they own or that are shared to groups they belong to.

---

## Admin setup

1. Go to **Admin → Panels**.
2. Click **+ New panel**, select type **Kanban**, set a title and height.
3. Assign to groups if the panel should be scoped to specific users; leave unassigned for all users.
4. Save the panel — it now appears on the dashboard.
5. Click the panel to open it, then use **+ New board** to create boards.

The panel height controls how many board rows are visible before scrolling. A height of `2×` fits roughly 3–4 boards comfortably.

---

## Scope and limitations

Kanban Lite is intentionally narrow. It covers:

- Multiple boards per panel
- Five fixed statuses (not customizable)
- Per-card due dates and notes
- Drag-and-drop reorder and lane changes on desktop
- Calendar integration via due dates
- Full-text search

It does not include: assignees, labels/tags, comments, attachments, custom statuses, subtasks, time tracking, Gantt charts, or sprint/iteration management. For those needs, integrate a dedicated tool (Vikunja, Plane, Linear, Jira) and embed it via a **Web Embed** panel, or use Stoa's **Custom API** panel to surface data from its API.
