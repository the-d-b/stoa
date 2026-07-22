# Why Stoa

## The starting point

Home dashboards were already a solved problem when Stoa was started. [Homepage](https://gethomepage.dev) had perfected the data-rich integration model — dozens of services, live stats, beautiful icons. [Homarr](https://homarr.site) had nailed the multi-user story and HTTP-based configuration. Both were excellent.

So why build another one?

Because neither was quite what we wanted. We kept running into the same friction:

- Homepage is single-user. There's no concept of "my view" vs "everyone's view". In a household or small team, one person ends up owning the config for everyone.
- Homarr's per-user experience is limited to bookmarks and basic customization. Shared panels exist but the filtering and personalization story is thin.
- Neither has a first-class concept of **views** — ways to switch between different slices of your dashboard without maintaining separate installs.

We wanted to borrow the best of both and build something more opinionated.

---

## What we borrowed

**From Homepage:** The integration model. Homepage proved that a dashboard should be a live window into your services, not just a launchpad. Stats, queues, media activity, server health — if the service has an API, the dashboard should show it. Stoa follows this model faithfully: most panels are backed by a real integration that pulls live data. We also borrowed Homepage's Docker-label auto-discovery outright, down to the label names — a Docker Apps panel reads the same `homepage.name`/`icon`/`href`/`group` labels Homepage does, so a Homepage config runs alongside Stoa, or migrates to it, without touching a single container.

**From Homarr:** Multi-user from the ground up. Stoa is built on the assumption that more than one person will use it, with different roles, different panels, different preferences. Shared system panels, per-user personal panels, groups for access control, and individual panel ordering — all of this is core, not an afterthought.

---

## What we added

**Porticos.** The thing we missed most in both products was the ability to create named views. A portico is a saved layout with its own tag filter, column configuration, and panel order. Switch between "infra", "media", and "family" with one click — no separate installs, no manual tag toggling. The live preview in profile settings lets you see exactly what each portico looks like before you switch.

**Tags as user-controlled filters.** Rather than hardcoding panel visibility to groups, tags let each user control what they see. Admins assign tags to panels; users activate the tags they care about. A panel tagged "media" and "infra" appears when either tag is active. Personal tags let users create their own filters without admin involvement.

**Notes.** A shared note panel with per-user locking. In a multi-user environment, notes become a lightweight shared scratchpad — useful for things that don't belong in a ticket tracker or wiki but need to be visible to everyone on the dashboard.

**Checklists.** Simple shared checklists, also panel-based. Useful for recurring tasks, shopping lists, deployment checklists — anything where everyone on the team needs to see and update the same list.

**Calendar.** Multi-source calendar that aggregates from Sonarr, Radarr, Lidarr, Readarr, and Google Calendar into a single view. Each source is independently configurable with a days-ahead window. The result is a single calendar that shows media releases alongside personal appointments.

**Sports, Stocks, Crypto.** Data panels that don't require any self-hosted service. ESPN scores, stock quotes, and cryptocurrency prices — configure a panel and the data appears. No API server to run.

**Glyphs and Tickers.** Persistent widgets that live in the header and footer zones outside the panel grid. A weather glyph in the corner. A sports score ticker scrolling across the bottom. TrueNAS CPU and memory always visible at a glance. These complement the main panel grid rather than competing with it.

**Express setup.** A first-run wizard that bulk-creates secrets, integrations, and panels in one step. Point it at your Sonarr/Radarr/Plex/etc. instances and walk away with a working dashboard.

---

## What we left behind

Stoa isn't trying to be everything. A few deliberate omissions:

**No reverse proxy.** Tools like Nginx Proxy Manager and Traefik do this better than any dashboard ever could. Stoa integrates with them but doesn't replace them.

**No plugin system.** Every integration in Stoa is a first-class feature with real UI. A plugin ecosystem would let us support more services faster, but it also means fragmentation, abandoned plugins, and inconsistent UX. We'd rather support fewer things well.

**No plugin-style theme library.** Stoa ships 6 built-in themes (Void, Slate, Carbon, Paper, Fog, Linen) and, for anyone who wants to go further, three ways to customize past them: upload a hand-written CSS file, build one with color pickers (no CSS required — pick 8 colors, the rest are derived), or both. Custom sheets are stored on the server, survive updates, and can be exported, edited by hand, and re-imported at any time. See [Theming](theming.md).

---

## The name

Stoa (στοά) is the Greek word for a covered walkway — the kind of colonnaded portico common in ancient Greek public spaces where people would gather, converse, and share information. The Stoics took their name from the Stoa Poikile where they met.

A dashboard is a similar thing: a shared space where information is gathered and made visible to everyone who needs it.

The panel concepts follow the same theme: porticos (στοά), stylos (στῦλος — column), seira (σειρά — row/series), rema (ῥεῦμα — flow/stream).
