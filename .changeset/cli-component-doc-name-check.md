---
'@astryxdesign/cli': patch
---

[feat] `astryx doctor integration validate` and `astryx integration check` check the component names a package's docs and blocks give:

- `doc_name_mismatch` warns when a component doc's `name` is not the name the component is listed under and the module its printed import names (the doc's `import`, the published subpath, or the package root) provably does not export that name, so `astryx component` would print a broken import. The `Fix:` proposes the file name when that module exports it, otherwise the component it exports. A name that module's exports cannot prove or rule out (a re-export from another package, `export =`, a destructured binding, a namespace, an import that resolves to no file, or, when no import can be resolved, a source that only exports a default) is never reported; validate's new `docNames` report lists it as not checked, with the reason.
- `unknown_block_component` warns when a template's `exampleFor` or `componentsUsed` names a component neither the package nor Core has (every doc `astryx component` resolves in Core counts) and the template does not import it. Imports the template's local helpers make count too, including through a barrel such as `parts/index.ts`. A name it may render through a namespace import (`import * as UI from ...`), members of an imported binding (`<UI.Panel />`, `const {Panel} = UI`, `createElement(UI.Panel)`), `require()` or a dynamic `import()`, or a local module this check cannot read, and, without Core installed, any name only Core could resolve, is listed in the new `blockComponents` report as not checked, never reported.

`integration check --strict` does not fail on anything listed as not checked.

@josephfarina
