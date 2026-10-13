---
'@astryxdesign/cli': patch
---

[fix] The CLI finds the project's `@astryxdesign/core` from any folder inside the project. `component`, `hook`, `build`, `search`, `swizzle`, `theme targets`, `doctor` and `upgrade --from` now work five or more folders below the folder that installs Core, in a workspace member whose Core the workspace installs at its root, and in Yarn Plug'n'Play projects. A `packages/core` folder that holds another package is no longer read as Core, and an integration named in `astryx.config` now loads when the workspace installs it at its root, as an autolinked one already did.

@josephfarina
