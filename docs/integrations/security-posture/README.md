# Security Posture

**Category:** Monitoring | **Status:** New | **Polling:** 24h (per product type, not per integration)

---

## Panel

For a curated set of network- and storage-facing integrations, shows the detected running version alongside known CVEs (Common Vulnerabilities and Exposures) for that product, sourced from the [NVD](https://nvd.nist.gov/) (National Vulnerability Database).

**No integration or source picker required.** Every integration you've already configured whose type is in the covered list appears automatically — add a TrueNAS integration, and it shows up here on the next refresh with no additional setup.

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

## How it works

**Version detection** reads from data Stoa's existing integration workers already fetch for their normal panel purposes — no extra call to the target app, with one exception: Authentik makes one small additional call to `/api/v3/admin/version/` since nothing else in its panel data touches version. Coverage varies by product: TrueNAS, Unraid, OpenMediaVault, Synology, QNAP, Proxmox, OPNsense, Traefik, Nextcloud, UniFi, Pi-hole, AdGuard Home, Netbird, pfSense, and Authentik all report a version today; Tailscale reports the version shared by the most devices in your tailnet, truncated to the release number (there's no single account-level version — devices can genuinely be on different releases, and each one's raw clientVersion includes a build/commit suffix like `1.98.8-t1241b225b-gbcbaf1889` that isn't part of the release itself). OpenWrt, Nginx Proxy Manager, and Omada don't currently have a version field wired into their fetchers — their row shows CVEs without a version badge until that's added.

If a covered product's row is missing a version despite being in the list above, check the backend logs for that product's tag (`TRUENAS`, `OPNSENSE`, etc.) — each worker now logs a debug line for any individual sub-request that fails, rather than dropping it silently.

**CVE data** is fetched from the NVD REST API **once per product type** (not per integration instance) on a 24-hour cycle — the CVE list for "TrueNAS" is the same regardless of how many TrueNAS integrations you have, so it's fetched once and shared. Only product types with at least one configured integration are queried, and requests are paced with a delay between each to stay well within NVD's rate limit.

### NVD API key (optional)

Admin → Settings → NVD API Key. Works without one at NVD's unauthenticated rate limit (5 requests/30s, which is generous for 19 products refreshed once a day); a free key ([request one here](https://nvd.nist.gov/developers/request-an-api-key)) raises that to 50/30s. Only useful if you're seeing rate-limit errors in the logs, which is unlikely at this scale.

---

## Notes

- **CVSS severity colors:** Critical (red), High (orange), Medium (amber), Low (green-ish), Unknown (grey) — matches the standard CVSS severity bands.
- **A "clean" badge** means NVD currently has zero CVEs on file for that product — not a guarantee of no vulnerabilities, just no *published* ones. Smaller self-hosted projects are sometimes thinly tracked in CVE databases even when they patch real issues in their own release notes.
- **This is not "upgrade available" tracking.** Security Posture tells you what's known to be vulnerable in general for a product; it doesn't compare your version against a "latest release" feed. If you want that, a container-registry watcher like [Diun](https://github.com/crazy-max/diun) covers different ground (new image tags/digests) and is a better fit for that specific job than rebuilding it here.
