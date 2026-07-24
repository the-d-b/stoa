Icons in this directory come from three sources, plus one contributed directly.

## dashboard-icons

Most icons — real self-hosted app and service logos — are sourced from the
[dashboard-icons](https://github.com/homarr-labs/dashboard-icons) project
(copyright Bjorn Lammers, Meier Lukas, Thomas Camlong, and Homarr Labs, 2024),
licensed under the Apache License 2.0 (see `LICENSE` in this directory). Files
are used unmodified aside from being renamed to match Stoa's internal
integration type identifiers.

## simple-icons

`coinbase.svg` and `lastfm.svg` are sourced from the
[simple-icons](https://github.com/simple-icons/simple-icons) project,
released under CC0 1.0 Universal (public domain) — used because dashboard-icons
doesn't carry these two brands. Each file has the brand's canonical color
(from simple-icons' own published metadata) added as a `fill` attribute;
otherwise unmodified.

## Lucide

Panel types with no backing app or service — calendar, notes, checklist,
search, and similar generic concepts — use icons from the
[Lucide](https://github.com/lucide-icons/lucide) project, released under the
ISC License (see `LUCIDE-LICENSE` in this directory). These have no natural
brand color, so `stroke="currentColor"` is replaced with a fixed neutral gray
(`#8a8a8a`) rather than a real brand hex; otherwise unmodified.

## tranga.png

Not found in any of the above catalogs — supplied directly for this project.
