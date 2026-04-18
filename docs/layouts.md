# Layout modes

Each portico can use one of three layout modes, selectable from Profile → Porticos.

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
