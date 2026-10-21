---
'@astryxdesign/cli': patch
---

[feat] Docs can mark an experimental surface: every doc type, schema field, and enum value accepts `stability: 'experimental'`. A marked command shows `[experimental]` in help, and a marked schema field or enum value is left out of its stable table so its feature's own docs describe it. An integration check finding can have severity `info`, which is reported and never fails, even under `--strict`. A namespace the CLI ships can adopt a doc group from every installed package (`source.packages: 'all'`). Docs and findings that use none of these read exactly as before.

@josephfarina
