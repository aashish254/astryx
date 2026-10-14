---
'@astryxdesign/core': patch
---

[fix] A focused `DropdownMenu` row stays visible under forced colors (Windows High Contrast and similar modes). Rows show focus with a translucent background, which forced colors replace with the page color, so a keyboard user could not tell which row Enter would activate. Action, checkbox, radio, and sub-menu rows now also draw a `Highlight` outline on focus in forced-colors mode only; nothing changes outside it. The same rows render in `ContextMenu` and breadcrumb menus.

@cixzhang
