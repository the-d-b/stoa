# Security Posture

**Category:** Monitoring | **Status:** New | **Polling:** 24h (per product type, not per integration)

---

## Panel

For a curated set of network- and storage-facing integrations, shows the detected running version alongside known CVEs (Common Vulnerabilities and Exposures) for that product, sourced from the [NVD](https://nvd.nist.gov/) (National Vulnerability Database).

**No integration or source picker required.** Every integration whose type is in the covered list *and that you can see* appears automatically — add a TrueNAS integration, and it shows up here on the next refresh with no additional setup. See [Access control](#access-control) for what "that you can see" means for a non-admin.

This panel deliberately does **not** try to determine "is my version affected" — CVE affected-version ranges are often unstructured free text, and an automated match that's wrong is worse than no match at all. Instead it shows your detected version and the product's known CVEs side by side, and leaves the correlation to you. If you're running TrueNAS 24.10 and see a CVE description that mentions "before 24.10.1," that's your cue to check the release notes — the panel gets you to that moment quickly without asserting anything it can't verify.

### Covered products

Deliberately a small, curated list — not all ~90+ Stoa integration types, only ones where a known vulnerability realistically matters (network-perimeter devices, auth systems, NAS/hypervisor platforms). Each was checked against NVD for real CVE coverage before being added; a few candidates (Gluetun, wg-easy, NextDNS) were dropped because NVD has zero CVEs filed against them, and "Cloudflare" was dropped because as a keyword it matches their entire product portfolio, not the analytics API Stoa's integration actually uses.

TrueNAS · Unraid · OpenMediaVault · Synology · QNAP · Proxmox VE · OPNsense · pfSense · OpenWrt · Traefik · Nginx Proxy Manager · Authentik · Nextcloud · Omada Controller · UniFi Network · Pi-hole · AdGuard Home · Tailscale · Netbird

### Height behavior

| Height | What you see |
|---|---|
| 1x | Total CVE count across all covered integrations, colored by worst severity present |
| 2-3x | List of covered integrations with version and CVE count badge |
| 4x+ | Same list, expandable per integration into the actual CVE list (severity, CVSS score, description, publish date, link to the NVD detail page) |

---

## Access control

This panel auto-discovers integrations rather than referencing one you pick, so it needs its own visibility rule — it uses the exact same one that already governs "My Integrations" everywhere else in Stoa, not a separate permission tier:

- Your own integrations (system or personal) always appear
- A system integration with no group restriction configured appears for everyone
- A system integration restricted to specific groups appears only if you're in one of those groups
- Non-admins never see another individual user's personal integrations; admins see all system integrations regardless of group restriction, but likewise don't see other users' personal integrations

Panel creation itself is open to anyone, same as every other panel type — there's no admin-only panel-type tier. What's scoped is the *data*: if you create a Security Posture panel and share it broadly, a viewer who can't see the underlying integrations (via the rules above) will see fewer entries than you do, or an empty panel if they can see none of them. That's deliberate, not a bug — a widely-shared panel showing a curious viewer another user's Authentik version and its known CVEs, when that viewer has no actual access to Authentik, would be a real information leak (internal hostnames, exact software versions, and a public CVE list handed to someone with no business knowing any of it). If a panel unexpectedly looks empty to someone you shared it with, it means the underlying integrations aren't shared to them — check `integration_groups`, not this panel's own sharing.

---

## How it works

**Version detection** reads from data Stoa's existing integration workers already fetch for their normal panel purposes — no extra call to the target app, with two exceptions: Authentik makes one small additional call to `/api/v3/admin/version/`, and Nginx Proxy Manager makes one to its unauthenticated `/api/` status endpoint (its version comes back as separate major/minor/revision numbers rather than a single string — e.g. `{"major":2,"minor":15,"revision":1}` — and is assembled into `2.15.1`) — neither's normal panel data touches version otherwise. Coverage varies by product: TrueNAS, Unraid, OpenMediaVault, Synology, QNAP, Proxmox, OPNsense, Traefik, Nextcloud, UniFi, Pi-hole, AdGuard Home, pfSense, Authentik, and Nginx Proxy Manager all report a single account-level version today. Tailscale and Netbird are mesh VPNs with no single account-level version — each device/peer reports its own, and a tailnet/network can genuinely be running mixed releases — so both instead report whichever version the most devices/peers share; Tailscale's raw value additionally gets truncated at its first dash, since the client reports a build/commit suffix (`1.98.8-t1241b225b-gbcbaf1889`) that isn't part of the release number.

OpenWrt and Omada are wired in but **unverified against real hardware** — added via research rather than a live test, since neither was available to test against at the time. Confidence differs between the two:

- **OpenWrt** — reads `release.version` from the `ubus call system board` RPC, the same call LuCI's own web UI status page sources its firmware version display from. This is one of the most stable, long-standing ubus calls in OpenWrt and is high-confidence.
- **Omada** — reads `controllerVer` from the existing (already-proven-working) unauthenticated `/api/v2/openapi/logininfo` call, which the login flow already depends on for its `omadacId`. The field name is based on community/vendor documentation of Omada's OpenAPI rather than a verified live response, so confidence is moderate, not high.

Both log a debug line (`OPENWRT`/`OMADA` tags) if the expected field comes back missing, so a wrong assumption will be diagnosable in the logs rather than silently blank forever once real hardware is available to check against.

If a covered product's row is missing a version despite being in the list above, check the backend logs for that product's tag (`TRUENAS`, `OPNSENSE`, `OPENWRT`, `OMADA`, etc.) — each worker logs a debug line for any individual sub-request that fails or comes back in an unexpected shape, rather than dropping it silently.

**CVE data** is fetched from the NVD REST API **once per product type** (not per integration instance) on a 24-hour cycle — the CVE list for "TrueNAS" is the same regardless of how many TrueNAS integrations you have, so it's fetched once and shared. Only product types with at least one configured integration are queried, and requests are paced with a delay between each to stay well within NVD's rate limit.

### NVD API key (optional)

Admin → Settings → NVD API Key. Works without one at NVD's unauthenticated rate limit (5 requests/30s, which is generous for 19 products refreshed once a day); a free key ([request one here](https://nvd.nist.gov/developers/request-an-api-key)) raises that to 50/30s. Only useful if you're seeing rate-limit errors in the logs, which is unlikely at this scale.

### Cutting down CVE noise: "Ignore CVEs before"

NVD's CVE list for a product includes everything ever filed, some of it a decade-plus old — noisy for a box you know is running something recent. Each of the 19 covered integrations has an optional **"Ignore CVEs before"** date field on its own edit form (Admin/Profile → Integrations → edit) — set it to when you know your current version/image was built, and CVEs published before that date are hidden from this integration's row (count, badge color, and expanded list all reflect the filtered set). Leave it blank to see everything, which is the default.

This is deliberately a manual date you set, not an automated lookup — same reasoning as not attempting "is my version affected" matching. A CVE published after your ignore-date might still not apply to you, and one published before it occasionally still does (a vulnerability can be filed years after the vulnerable code shipped) — this is a coarse noise filter based on your own knowledge of your build date, not a precision tool. It's per-integration rather than a single panel-wide date because different products get updated on wildly different schedules; a date that clears out year-old TrueNAS noise would just as easily hide a real 3-week-old Authentik CVE.

---

## Notes

- **CVSS severity colors:** Critical (red), High (orange), Medium (amber), Low (green-ish), Unknown (grey) — matches the standard CVSS severity bands.
- **A "clean" badge** means NVD currently has zero CVEs on file for that product — not a guarantee of no vulnerabilities, just no *published* ones. Smaller self-hosted projects are sometimes thinly tracked in CVE databases even when they patch real issues in their own release notes.
- **This is not "upgrade available" tracking.** Security Posture tells you what's known to be vulnerable in general for a product; it doesn't compare your version against a "latest release" feed. If you want that, a container-registry watcher like [Diun](https://github.com/crazy-max/diun) covers different ground (new image tags/digests) and is a better fit for that specific job than rebuilding it here.
