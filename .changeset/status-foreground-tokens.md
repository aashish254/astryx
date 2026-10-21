---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
'@astryxdesign/richtext': patch
'@astryxdesign/theme-neutral': patch
'@astryxdesign/theme-butter': patch
'@astryxdesign/theme-chocolate': patch
'@astryxdesign/theme-gothic': patch
'@astryxdesign/theme-matcha': patch
'@astryxdesign/theme-stone': patch
'@astryxdesign/theme-y2k': patch
---

[feature] Status colors previously reused `--color-accent` and `--color-info/success/warning/error` across strong fills, plain-surface text/icons/borders, and pale surfaces. These jobs now have separate public roles: strong fills use the base semantic colors with `--color-on-*`, pale surfaces use `--color-*-muted` with `--color-on-*-muted`, and plain surfaces use `--color-status-foreground-*`. First-party appearance changes include Butter dark Info and Error Banner text moving from white (3.54:1 and 3.44:1) to `#1d1c11` (4.84:1 and 4.98:1), Neutral light plain-surface status text and borders moving to passing stop-45 foregrounds while strong fills keep their pale semantic stops, Core-default Banner titles taking the matching on-muted status color instead of a generic text role, and Neutral Banner control layers deriving from the neutral palette endpoints instead of separate near-white/near-black literals. Custom themes can preserve their previous appearance by assigning the old values to the corresponding new roles; Banner overrides that previously set `--color-accent-muted` or `--color-text-*` should set the matching muted/on-muted roles instead.

@rubyycheung
