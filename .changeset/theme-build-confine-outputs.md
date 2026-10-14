---
'@astryxdesign/cli': minor
---

[breaking] `astryx theme build` and `themeBuild()` write only inside the working directory (`cwd` for the API). An absolute `--out` path outside it, or a theme file outside it whose outputs would go beside it (also with `--family`), now fails with `ERR_PATH_TRAVERSAL` before anything is written, and `--check` refuses the same paths; before, both wrote outside the working directory. Absolute paths inside the working directory still build, including ones that reach it through a symlink. To migrate, run the build from a directory that contains the theme file and its outputs, such as the package or repository root, or pass an `--out` path inside the working directory; API callers pass a `cwd` that contains them.

@josephfarina
