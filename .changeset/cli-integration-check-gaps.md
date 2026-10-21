---
'@astryxdesign/cli': patch
---

[fix] `astryx doctor integration validate`, `astryx integration check` and `astryx integration verify` catch more package mistakes, and each finding ends in a `Fix:` that clears it:

- Two docs for one component (`AcmeWidget.doc.mjs` and `AcmeWidget.doc.js`) warn `duplicate_component_doc` and name the one read; discovery now always reads the same one.
- A component doc whose file name differs from its source only in letter case is one error that says which file to rename, on every disk.
- A root reached through a symlinked folder warns `symlinked_root`, and `verify` says npm pack does not follow it instead of asking for a `files` entry.
- An absolute root says roots are relative and gives the relative path; a root that is a file is reported by every check instead of crashing it.
- A package.json without `name` or `version`, or with a `name` npm rejects, warns with a fix, instead of a crash or a pass; `verify` fails on it.
- A manifest key one letter off a known key asks "did you mean"; an empty doc or manifest, or one with no default export, says so instead of "(root): Invalid input".
- A contribution file Astryx cannot read warns `unreadable_file`, before npm pack fails on it; when a theme's `defineTheme` name differs from the files its package exports, `verify` says a rebuild writes files under the new name instead of only saying to rebuild.
- A theme descriptor named for the built file says it must share its stem with the `defineTheme` source; theme and template pairing errors, and a `.jsx` component source, get a fix.
- `verify` names packed files by their path in the package, not the scratch copy's.

@josephfarina
