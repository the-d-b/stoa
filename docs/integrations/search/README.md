# Search

**Category:** Productivity | **Status:** Tested | **Requires integration:** No - data stored locally in Stoa

---

## Panel

A search bar panel that passes queries to a configured search engine. Supports any search engine with a URL pattern, including self-hosted options like SearXNG.

### Height behavior

| Height | What you see |
|---|---|
| 1x | Search input bar |
| 2-3x | Search bar + recent searches |
| 4x+ | Search bar + recent searches + quick links |

### Screenshots

| 1x | 2x | 4x |
|---|---|---|
| ![1x](./screenshots/1x.png) | ![2x](./screenshots/2x.png) | ![4x](./screenshots/4x.png) |

*Screenshots pending - add as screenshots/1x.png, screenshots/2x.png, screenshots/4x.png.*
---

## Notes

Configure the search engine URL pattern directly in the panel config. E.g. https://searxng.local/search?q={query}