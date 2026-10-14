---
'@astryxdesign/core': patch
---

[docs] `DropdownMenu` docs match the component: `button` is mutually exclusive with `renderTrigger` (there is no `trigger` prop, and the development warning now says so), the private menu radius defaults to `--radius-container`, and a disabled `DropdownMenuCheckboxItem` or `DropdownMenuRadioItem` takes no focus — the arrow keys, typeahead, and the pointer highlight skip it — while it stays in the accessibility tree as disabled.

@cixzhang
