# Theming

Stoa ships with 6 built-in color themes and two ways to make your own: upload a hand-written CSS file, or build one with color pickers — no CSS required. All three paths (built-in, hand-written CSS, picker-built CSS) apply the same way and can be switched between freely.

---

## Built-in themes

**Profile → Appearance → Theme → Built-in**

| Theme | Mode |
|---|---|
| Void | Dark |
| Slate | Dark |
| Carbon | Dark |
| Paper | Light |
| Fog | Light |
| Linen | Light |

Each built-in theme is a fixed set of 14 CSS custom properties (`--bg`, `--surface`, `--text`, `--accent`, and so on) applied as a stylesheet — picking one fully replaces the previous theme's values, so there's never a mix of two themes' colors at once.

A compact theme switcher (the color wheel button, bottom-right of the dashboard) also lets you swap between built-in themes without opening Profile.

---

## Custom CSS (hand-written)

**Profile → Appearance → Theme → Custom CSS → Upload**

For full control, write a `:root { ... }` block overriding any of the 14 theme variables and upload it as a `.css` file. You only need to include the variables you want to change — anything you omit falls back to Stoa's base defaults.

`↓ Export CSS` downloads the currently-active theme (built-in or custom) as a starting `.css` file, pre-filled with its current values and commented with common customization examples.

Uploaded sheets are stored on the server (`Admin`/`Profile → Appearance`) and survive updates. You can upload multiple sheets and switch between them; delete a sheet you no longer want with the × next to its name.

### The 14 variables

| Variable | Purpose |
|---|---|
| `--bg` | Page background |
| `--surface` / `--surface2` | Panel/card backgrounds (two tiers) |
| `--border` / `--border2` | Border colors (two tiers) |
| `--text` / `--text-muted` / `--text-dim` | Text colors (three tiers, decreasing emphasis) |
| `--accent` / `--accent2` | Primary accent and its lighter/darker companion |
| `--accent-bg` | Accent tinted background (used for active/selected states) |
| `--green` / `--red` / `--amber` | Status colors (success/error/warning) |

---

## Custom theme builder (color pickers)

**Profile → Appearance → Theme → Custom CSS → + Create with color pickers**

For anyone who'd rather not touch CSS at all: pick 8 colors — Background, Panels, Borders, Text, Accent, Success, Error, Warning — plus a Dark/Light toggle, and Stoa derives the remaining 6 variables (the two surface/border/text tiers, the accent companion, and the accent background tint) using the same ratios observed across the 6 built-in themes.

Toggle **Preview live** to see the whole dashboard update as you adjust colors, before saving anything. **Save as theme** generates a real `.css` file from your picks and uploads it through the same pipeline as a hand-written file — it shows up in the Custom CSS list like any other sheet, and can be exported, edited by hand afterward, or deleted the same way.

---

## How theme selection is stored and restored

Your active theme (built-in name, or a reference to a custom sheet) is saved to your user preferences and restored automatically wherever you log in — dashboard, admin pages, everywhere — not just while Profile is open. If a custom sheet you had selected gets deleted, Stoa falls back to the Void theme rather than leaving stale styles applied.
