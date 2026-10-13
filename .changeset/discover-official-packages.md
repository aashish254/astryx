---
'@astryxdesign/cli': patch
---

[feat] `astryx discover` lists the official Astryx packages, first, from a list each CLI release carries, so a project with no discover source sees the official themes, even offline. Official entries name `Astryx` as their `source`, `meta.sources` reports the list last, and a canary CLI also lists the canary-only packages, as prereleases. When a project's or an integration's source lists an official package, discover keeps that source's entry. A declared official theme package shows as installed. On a package page, an official package's add command pins a version (the project's Core version for a package released with Core, otherwise the CLI's own), and a theme's add text ends with `astryx theme add <slug>`. In a project that loads no integration and has no discover source of its own, a query still answers with the list.
@josephfarina
