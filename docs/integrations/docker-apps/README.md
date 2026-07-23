# Docker Apps

**Category:** Monitoring | **Status:** New | **Polling:** Live, on panel load

---

## Panel

App-launcher tiles, auto-discovered from labels on your running Docker containers — grouped by category, collapsible, with an icon, name, and link per app.

**No integration or source picker required.** Any container carrying a `homepage.name` or `homepage.href` label becomes a tile automatically the next time the panel loads — nothing to configure per app beyond the labels themselves.

Optionally, a panel can be scoped to a single `homepage.group` via the **Group filter** field on the panel's edit form (matched case-insensitively; leave blank to show every group). This is for splitting groups across different porticos rather than curating — e.g. a "Network Infrastructure" panel on one portico and a "Storage Infrastructure" panel on another, both reading the same containers, each showing only its own group.

### Why "homepage"

Stoa deliberately reuses the label convention from [Homepage](https://gethomepage.dev) rather than inventing a `stoa.*` equivalent. If you're already running Homepage, pointing Stoa at the same Docker socket populates this panel with zero re-tagging — you can run both dashboards side by side, or migrate from one to the other, without touching your compose files.

Only the static-tile subset of Homepage's labels is honored:

| Label | Effect |
|---|---|
| `homepage.name` | Tile name (falls back to the container name if only `homepage.href` is set) |
| `homepage.href` | Link the tile opens |
| `homepage.icon` | Icon — a bare name (e.g. `sonarr`) resolves against Stoa's bundled icon set; a full `http(s)://` URL is used directly |
| `homepage.description` | Shown as the tile's tooltip |
| `homepage.group` | Section the tile is grouped under (defaults to "Other") |
| `homepage.weight` | Sort order within its group, lowest first |

**`homepage.widget.*` (live stats scraping) is not supported**, on purpose. Stoa's own Integration/Panel system already covers live per-service stats — with auth, secrets, and refresh-interval control — so duplicating that through container labels would just create a second, weaker config path for the same job. Use a real integration + panel for anything beyond a launcher tile.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Total tile count across all groups |
| 2x+ | Grouped, collapsible tile grid — click a group header to collapse/expand it |

---

## Access control

This panel reads live container data, so it's gated the same way as the existing [Docker control panel](../../docker-control-panel.md) — by **Admin → Docker → Enable** and the Docker access group(s) configured there. It does **not** get its own, separately-scoped permission:

- Anyone can add a Docker Apps panel to their dashboard, same as any other panel type
- Whether it shows tiles depends on whether *you* have Docker access — admins always do; regular users need to be in a configured Docker access group
- If Docker isn't enabled, or you don't have access, the panel shows an explicit message rather than a silently empty grid

If you already use the Docker control panel, no additional setup is needed — Docker Apps reads the same host configuration.

---

## Notes

- A container only becomes a tile if it opts in via `homepage.name` or `homepage.href` — containers with no Homepage labels at all are silently skipped, so enabling this panel doesn't dump your entire container list onto the dashboard
- The status dot on each tile (green/gray) reflects whether the container is currently running
- Multiple Docker hosts are aggregated into one tile grid, same as the Docker control panel
