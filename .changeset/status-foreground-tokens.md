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

[feature] Status colors previously reused `--color-accent` and `--color-info/success/warning/error` across strong fills, plain-surface text/icons/borders, and pale surfaces. These jobs now have separate public roles: strong fills use the base semantic colors with `--color-on-*`, pale surfaces use `--color-*-muted` with `--color-on-*-muted`, and plain surfaces use `--color-status-foreground-*`. Custom themes can preserve their previous appearance by assigning the old values to the corresponding new roles; Banner overrides that previously set `--color-accent-muted` or `--color-text-*` should set the matching muted/on-muted roles instead.

@rubyycheung
