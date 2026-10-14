---
'@astryxdesign/cli': patch
---

[fix] `astryx theme build` and `themeBuild()` keep every write inside the working directory (`cwd` for the API), as every other command does. An absolute `--out` path outside it, a theme file outside it (whose outputs go beside it), and `--family` with its root theme file outside it now fail with `ERR_PATH_TRAVERSAL` and write nothing; `--check` refuses the same paths. Absolute paths inside the working directory still build, also through a symlink. To migrate, run the build from a folder that holds the theme and its outputs, or pass an `--out` path inside that folder; API callers pass a `cwd` that holds them.

@josephfarina
