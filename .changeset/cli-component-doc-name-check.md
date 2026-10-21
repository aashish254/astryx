---
'@astryxdesign/cli': patch
---

[feat] `astryx doctor integration validate` and `astryx integration check` warn `doc_name_mismatch` when a component doc's `name` is not the name the component is listed under and its source provably does not export that name, so `astryx component` would print a broken import. The `Fix:` proposes the file name when the source exports it, otherwise the component the source exports. A doc whose source exports cannot all be read without running it (a re-export from another package, `export =`, a destructured binding, a namespace) is never reported; validate's new `docNames` report lists it as not checked, with the reason, and `integration check --strict` does not fail on it.

@josephfarina
