# Concepts

Understanding these five concepts will make everything else in Stoa click.

---

## Users

Every person gets their own login. Users are either **admins** (full access to all settings and content) or **regular users** (can personalize their own experience within shared content).

- Admins create system panels, integrations, tags, and groups
- Regular users can reorder panels, set their layout, add personal panels and integrations, and activate tags
- Every user gets their own panel order, portico layout, glyphs, and tickers
- Local accounts always work regardless of OAuth configuration — useful as a fallback if SSO breaks

---

## Groups

Groups organize users and control access to content. A panel shared with a group is visible to every member of that group.

- Users can belong to multiple groups
- The **default group** is special — new users are automatically added to it. Anything shared with the default group is visible to everyone by default
- Create groups for different teams, roles, or household members

---

## Tags

Tags are how users filter what appears on their dashboard. You assign tags to panels; users activate the tags they care about.

- Tags are for **filtering**, not access control — access is managed through groups
- A panel can have multiple tags
- A user can have multiple tags active at once
- Users can also create **personal tags** visible only to them, layered on top of system tags

---

## Panels

Panels are the widgets on the dashboard — Sonarr queues, server stats, bookmarks, media info, and more.

- **System panels** are created by admins and shared with groups — all group members see them
- **Personal panels** are created by users and visible only to them
- Each panel connects to an **integration** for its data
- Panels have a height (1x, 2x, 4x, 8x) that controls how much vertical space they occupy
- Panel order is per-user — reordering your dashboard doesn't affect anyone else

---

## Porticos

Porticos (στοά) are named views of your dashboard — like tabs or saved filter presets.

- Each portico has its own set of active tags, so switching porticos instantly changes which panels are shown
- Porticos have their own panel order, independent of other porticos
- Each portico can use a different **layout mode** (Stylos, Seira, or Rema)
- The **Home** portico always shows panels with all of your active tags

A typical use: one portico for work services (tagged "work"), one for media (tagged "media"), one for infrastructure (tagged "infra"). Switching between them is one click.

---

## How they fit together

```
Admin creates:
  Integration (TrueNAS credentials)
    ↓
  System Panel (TrueNAS panel, connected to integration)
    ↓
  Tags assigned to panel ("infra", "storage")
    ↓
  Group sharing (panel visible to "homelab" group)

User:
  Is member of "homelab" group → sees the panel
  Activates "infra" tag → panel appears
  Creates a Portico tagged "infra" → one-click view of all infra panels
  Reorders panels → their order, doesn't affect others
```
