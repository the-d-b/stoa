# Layout modes

Each portico can use one of four layout modes, selectable from Profile → Porticos. Any layout (except Seira) can also enable [**auto-h**](#dynamic-panel-height-auto-h) — a toggle that trims empty space from panels so the grid fits together far more tightly; it makes a big visual difference and is worth turning on first.

---

## Stylos (στῦλος — column, pillar)

Panels fill **top-to-bottom** within each column. When a column reaches the configured height limit, panels continue into the next column.

```
Column 1    Column 2    Column 3
┌────────┐  ┌────────┐  ┌────────┐
│   A    │  │   D    │  │   G    │
│  (2x)  │  │  (1x)  │  │  (1x)  │
├────────┤  ├────────┤  └────────┘
│   B    │  │   E    │
│  (1x)  │  │  (2x)  │
├────────┤  │        │
│   C    │  └────────┘
│  (4x)  │
│        │
│        │
└────────┘
```

**Configuration:**
- **Columns** — how many columns (2–6)
- **Column height** — how many height units before wrapping to the next column (4, 6, 8, 10, 12, 16)

**Best for:** Mixed-height panels where you want to control which panels group together vertically. Server dashboards with a tall panel (TrueNAS 4x) anchoring one column and smaller panels filling others.

---

## Seira (σειρά — row, series)

Panels flow **left-to-right**, wrapping to the next row when the column count is exhausted. Panels use CSS grid row spans, so different heights coexist without gaps.

```
Row 1
┌────────┐ ┌────────┐ ┌────────┐
│   A    │ │   B    │ │   C    │
│  (1x)  │ │  (2x)  │ │  (1x)  │
└────────┘ │        │ └────────┘
           └────────┘
Row 2
┌────────┐ ┌────────┐ ┌────────┐
│   D    │ │   E    │ │   F    │
│  (1x)  │ │  (1x)  │ │  (1x)  │
└────────┘ └────────┘ └────────┘
```

**Configuration:**
- **Columns** — how many panels per row (2–6)

**Best for:** Panels of similar height that you want in a consistent grid. Media dashboards with uniform card sizes. The CSS grid ensures alignment is pixel-perfect.

**Note:** Unlike Rema, rows in Seira maintain their height even if panels collapse — the grid track is fixed. Use Rema if you want rows to shrink when panels collapse.

---

## Rema (ῥεῦμα — flow, stream)

Panels flow **left-to-right** in explicit rows. Each row sizes to its tallest panel. When all panels in a row collapse to their header, the row itself collapses — no wasted space.

```
Row 1 (all expanded)
┌────────┐ ┌────────┐ ┌────────┐
│   A    │ │   B    │ │   C    │
│  (2x)  │ │  (2x)  │ │  (2x)  │
└────────┘ └────────┘ └────────┘

Row 1 (B collapsed)
┌────────┐ ┌──────────────────┐ ┌────────┐
│   A    │ │ B ▼ collapsed    │ │   C    │
│  (2x)  │ └──────────────────┘ │  (2x)  │
└────────┘                      └────────┘

Row 1 (all collapsed)
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ A ▼         │ │ B ▼         │ │ C ▼         │
└─────────────┘ └─────────────┘ └─────────────┘
```

**Configuration:**
- **Columns** — how many panels per row (2–6)

**Best for:** Dashboards where you frequently collapse panels to hide them temporarily. The layout breathes — collapsed rows disappear, expanded rows take their natural height.

---

## Custom

Panels are manually assigned to specific columns. You control exactly which column each panel appears in, and panel order within each column follows your saved panel order.

**Configuration:**
- **Columns** — how many columns to assign panels across (2–6)
- **Configure columns** — opens the column assignment editor, which lists every panel visible on this portico. Click a column number next to each panel to assign it. Assignments cascade — moving a panel to a higher column also shifts adjacent panels to maintain a valid order.

**Best for:** Porticos where you want precise, fixed placement — e.g. always keeping a specific panel in column 1 and a different set in columns 2 and 3 regardless of other settings.

---

## Dynamic panel height (auto-h)

The **`auto-h`** toggle — the single most impactful layout setting for most dashboards. When off, every panel card is exactly as tall as its configured height units, even when its content doesn't fill that space, leaving dead air at the bottom of taller panels. When on, each card sizes to the height its content actually needs: tall panels with little content **shrink to trim the empty space**, and panels whose content would overflow **grow to fit** instead of clipping. The result is a much tighter, more elegant grid on nearly every layout style — no manual per-panel height tuning required.

```
auto-h OFF — 4x panel, ~2x of content     auto-h ON
┌────────────┐                            ┌────────────┐
│  content   │                            │  content   │
│            │                            └────────────┘
│            │  ← wasted empty space        (card ends at
│            │                               its content;
└────────────┘                              rows below rise up)
```

Because the empty space is gone, the panels below it move up and the whole portico reflows to its natural, compact height.

- Toggle it per-portico from the **`auto-h`** button in the portico's settings row (Profile → Porticos)
- The **height** setting still matters — it controls how much content a panel renders (e.g. how many rows a list shows). `auto-h` only removes the leftover empty space around that content; it doesn't change what's rendered.
- Growth is capped at 8× height units (~1072px) so a content-heavy panel can't run away down the page
- Available for Stylos, Rema, and Custom. Not available for Seira — that layout uses CSS grid row spans which require fixed heights.

**Best for:** Almost everything. Turn it on first, then only fall back to hand-tuned fixed heights on a portico where you specifically want uniform card sizes.

---

## Mobile behaviour

All three modes collapse to a single column on mobile, stacking panels in panel order. Your panel order (set in Profile → Panel Order) determines the mobile stack sequence regardless of layout mode.

---

## Choosing a mode

| Situation | Suggested mode |
|---|---|
| Mixed heights, want vertical grouping | Stylos |
| Uniform heights, want clean grid | Seira |
| Frequently collapse panels | Rema |
| Building a "command center" with one dominant panel | Stylos |
| Media/content dashboard with cards | Seira |
| Quick-reference panels you toggle open/closed | Rema |
| Want exact control over which panel is in which column | Custom |
| Content length varies too much to tune heights manually | Any + auto-h |
| Panels leave dead space at the bottom | Any (except Seira) + auto-h |
