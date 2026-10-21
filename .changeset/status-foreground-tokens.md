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

[feature] Status colors previously reused `--color-accent` and `--color-info/success/warning/error` across strong fills, plain-surface text/icons/borders, and pale surfaces. These jobs now have separate public roles: strong fills use the base semantic colors with `--color-on-*`, pale surfaces use `--color-*-muted` with `--color-on-*-muted`, and plain surfaces use `--color-status-foreground-*`. First-party appearance changes include Neutral light strong fills moving from `#198100` to `#2f7d33` (success), `#ffce2f` to `#f8d36a` (warning), and `#c9303a` to `#cf3738` (error), with dark Info moving from `#6d9cfe` to `#6eaeff`; Neutral light plain-surface status text and borders moving to passing stop-45 foregrounds; Core-default input and FileInput borders and glyphs using the new foreground roles (warning moves from `#E9AF08` to `#753F07`), with semantic Icon colors following the same roles; Butter dark Info and Error Banner text moving from white (3.54:1 and 3.44:1) to `#1d1c11` (4.84:1 and 4.98:1); Chocolate and Matcha light success/error labels moving from white to their dark status foregrounds (`#4d6800`/`#b40000` and `#3d7a00`/`#cc0000`); Core-default Banner titles taking the matching on-muted status color instead of a generic text role; and Neutral Banner control layers deriving from the neutral palette endpoints instead of separate near-white/near-black literals. Custom themes can preserve their previous appearance by assigning the old values to the corresponding new roles; source-derived role defaults are emitted in each theme scope so nested custom themes that author the source token retain their own colors, and Banner overrides that previously set `--color-accent-muted` or `--color-text-*` should set the matching muted/on-muted roles instead.

@rubyycheung
