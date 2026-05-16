# Glyphs and tickers

Glyphs and tickers are persistent widgets that live outside the main panel grid, in the header and footer zones of the dashboard. They stay visible as you scroll, navigate between porticos, and switch views.

---

## Glyphs

Glyphs are compact status indicators placed in fixed zones around the dashboard frame.

### Zones

| Zone | Location |
|---|---|
| `header-left` | Left side of the top bar |
| `header-right` | Right side of the top bar (default) |
| `footer-left` | Left side of the footer |
| `footer-center` | Center of the footer |
| `footer-right` | Right side of the footer |

Multiple glyphs can share a zone — they stack based on their position order.

### Glyph types

| Type | What it shows | Integration required? |
|---|---|---|
| `weather` | Current temperature, icon, and label | Yes — a Weather integration |
| `clock` | Local or server time | No |
| `kuma` | Up/down/paused monitor counts | Yes — an Uptime Kuma integration |
| `truenas` | CPU%, memory%, temperature | Yes — a TrueNAS integration |
| `opnsense` | Total in/out Mbps, gateway status | Yes — an OPNsense integration |
| `proxmox` | CPU%, memory%, load average | Yes — a Proxmox integration |
| `ping` | HTTP response time and up/down status for a host | No — configure a URL directly |
| `text` | Static custom text | No |

### Managing glyphs

**Profile → Glyphs → Add glyph**

Select the type, zone, and (where applicable) the integration to connect it to. Glyphs are personal — each user configures their own.

Enable or disable individual glyphs without deleting them using the toggle switch.

---

## Tickers

Tickers are scrolling strips that flow across the footer, displaying a continuous stream of data. Unlike glyphs, tickers are designed for lists of items — sports scores, stock prices, feed headlines.

### Ticker types

| Type | What it shows | Integration required? |
|---|---|---|
| `stocks` | Stock prices and % change for configured symbols | Yes — a Stocks integration |
| `crypto` | Cryptocurrency prices and % change | Yes — a Crypto integration |
| `sports` | Live and recent scores for configured leagues | Yes — a Sports integration |
| `weather` | Temperature and conditions for one or more locations | Yes — one or more Weather integrations |
| `rss` | Headlines from an RSS or Atom feed | Yes — an RSS integration |

### Managing tickers

**Profile → Tickers → Add ticker**

Select the type, zone, and connected integration. For stocks and crypto tickers, configure the symbols directly on the ticker (e.g. `AAPL, MSFT, NVDA` or `BTC, ETH`). For sports, select the league(s) to include.

Tickers are personal — each user configures their own.

### Ticker zones

Tickers use the same zone system as glyphs but are designed for the footer zones where horizontal space is available for scrolling content. A ticker in `footer-center` will scroll across the full width of the footer.

---

## Glyphs vs. panels

Both glyphs and panels can show similar data (weather, server stats, Kuma status). The choice depends on what you want:

- **Panels** are detailed and occupy space in the grid. They show the full data set — all monitors, all interfaces, full disk breakdown.
- **Glyphs** are compact and persistent. They show a single summary value at a glance regardless of which portico is active.

A common pattern: a TrueNAS panel in the infra portico for detailed stats, plus a TrueNAS glyph in the header for a quick CPU/memory check from any portico.
