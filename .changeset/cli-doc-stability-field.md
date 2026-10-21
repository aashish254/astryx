---
'@astryxdesign/cli': patch
---

[feat] Docs can mark an experimental surface: every doc type, schema field, and enum value accepts `stability: 'experimental'`. A marked command shows `[experimental]` in help, a marked schema field or enum value is left out of its stable table so its feature's own docs describe it, and `astryx search` leaves out a marked doc, which is read on its own route. An integration check finding can have severity `info`, which is reported and never fails, even under `--strict`. A namespace the CLI ships can adopt a doc group from every installed package (`source.packages: 'all'`). `integration check` reports, at `info`, a template or namespace doc that sets `stability` while the package's CLI peer range admits a release before 0.7.2, which drops that descriptor. Docs and findings that use none of these read exactly as before.

@josephfarina
