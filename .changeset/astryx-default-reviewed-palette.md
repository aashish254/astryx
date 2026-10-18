---
'@astryxdesign/core': patch
---

[feat] Align the default Astryx color tokens to one reviewed Light/Dark palette. The Blue accent anchors remain `#0064E0` and `#2694FE`, core surfaces and primary text preserve their established anchors, Red becomes `#E71E40` / `#F64054`, Purple centers on `#7952FF`, and warning keeps `#E9AF08` / `#F2C00B`. Status, categorical, overlay, and muted values now use coherent stops from those families. This changes colors only; token names, typography, spacing, radii, motion, shadow geometry, structure, and behavior are unchanged. Products that need the earlier appearance can keep it through existing token overrides.

@rubyycheung
