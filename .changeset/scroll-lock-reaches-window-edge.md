---
'@astryxdesign/core': patch
---

[fix] A modal `Dialog`, `Drawer`, `BottomSheet`, `Lightbox`, or `MobileNav` now reaches the window edge when the browser has a classic, space-taking scrollbar (Windows, Linux, and macOS with scroll bars set to always show). Locking scroll hides the document's scrollbar, and the lock used to hold that scrollbar's gutter open on the viewport with `scrollbar-gutter: stable` so the page would not reflow sideways. A gutter reserved on the viewport is not paintable: the browser clips the top layer — the modal surface and its `::backdrop` included — at the gutter's inner edge, so a blank strip of page background a scrollbar wide ran down the window's right edge beside every open overlay. A side drawer and a fullscreen dialog stopped short of the window, a full-bleed divider inside them ended early on the right, and a centered dialog sat off-center.

The lock now lets the viewport take the full window width and compensates where the width went: the locked element is padded on the right by exactly the width it grew, measured rather than assumed, so in-flow content keeps its place, and that width is published on `<html>` as `--astryx-scrollbar-gutter` for the duration of the lock. `position: fixed` chrome anchored to the window's right edge stays still by adding it to its offset — `right: calc(16px + var(--astryx-scrollbar-gutter, 0px))` — which `ToastViewport` and the `ChatLayout` composer dock now do. Fixed chrome that does not read the property moves by the scrollbar's width while an overlay is open, as it did before #5219. A page that reserves the gutter itself (`scrollbar-gutter: stable` on the root) never grows and is left alone, as before. Nothing changes where the scrollbar is an overlay one (mobile, default macOS).

@imdreamrunner
