---
'@astryxdesign/cli': patch
---

[fix] The CLI finds the project's `@astryxdesign/core` from any folder inside the project. `component`, `hook`, `build`, `search`, `swizzle`, `theme targets` and `doctor` now work five or more folders below the folder that installs Core, in a workspace member whose Core the workspace installs at its root, and in Yarn Plug'n'Play projects. Beyond the folders they searched before, they stop at the project's workspace root, and they skip a Core above the project when the project declares another version. `upgrade --from` run from any folder in a project upgrades that project, scanning its `src` by default and refreshing its agent docs. It targets only the project's own Core: the one in the project's `node_modules`, or the one its workspace holds when that is the version the project declares. A `packages/core` folder that holds another package is no longer read as Core, and an integration named in `astryx.config` now loads when the workspace installs it at its root, as an autolinked one already did.

@josephfarina
