---
'@astryxdesign/core': patch
---

[fix] Modal dialogs, drawers, sheets, navigation, and lightboxes cover the window's scrollbar edge while preserving the background's containing-block width, fixed chrome, and overlapping scroll locks. Hidden-scrollbar layouts keep their existing geometry. No public API changes are required.

Compatibility limitation: an author-defined stable root gutter combined with viewport-unit-based background sizing can still reflow during a lock.
@imdreamrunner
