# Foundation smoke-check evidence

Base: `b4b905b63e9f3b10a3633c1979dc2bf0be486ce3`
Sandbox guard run: `2dd6d6b501ecf9568b1f5dcf79e5b8566b7e8090`
Final implementation: `f36275b8368d3876969ffddea6dc1e596f4240cc`
Browser: Chromium `149.0.7827.55`.

The final revision changes only Storybook metadata and its regression test. Its rebuilt Storybook guard passed again; the correct-foundation screenshot is byte-identical to the earlier capture. The real built story index now resolves the composition's published VStack root to `@astryxdesign/core`. The new owner regression failed on the old metadata and passed after rebuilding the corrected story.

The production Sandbox and Storybook render the shared Button, TextInput, Card and Table composition. Chromium computed these labelled Button values on separate page loads:

| CSS | Inline start/end | Block start/end | Guard |
| --- | --- | --- | --- |
| Unmodified foundation | 12px / 12px | 8px / 8px | Pass |
| `@layer reset { * { padding: 0; } }` | 12px / 12px | 8px / 8px | Pass, identical to baseline |
| `@layer product { * { padding: 0; } }` | 0px / 0px | 0px / 0px | Rejected |
| `* { padding: 0; }` unlayered | 0px / 0px | 0px / 0px | Rejected |

The same results held in a Sandbox build with `/sandbox` as its base path. Browser readiness also required the input, card, table, header and four rows; no page errors were observed.

Separately, adding the late-layer reset to the real exported Sandbox HTML and running the ordinary guard (without `--self-test`) produced exit 1:

```
foundation: {"inlineStart":"0px","inlineEnd":"0px","blockStart":"0px","blockEnd":"0px"}
Foundation smoke check failed: inlineStart: 0px — check for unlayered resets or resets above astryx-base
```

The unmodified export was restored after this failure injection. No component CSS, tokens, padding props or runtime APIs were changed.

## Reproduce

```
pnpm install --frozen-lockfile
pnpm build
pnpm -F @astryxdesign/sandbox build
pnpm exec playwright install chromium
node .github/scripts/foundation-smoke.js --self-test --output-dir test-results/foundation-smoke
pnpm -F @astryxdesign/storybook build
node .github/scripts/foundation-smoke.js --storybook-dir apps/storybook/dist --self-test
```

For a prefixed build:

```
SANDBOX_BASE_PATH=/sandbox pnpm -F @astryxdesign/sandbox build
node .github/scripts/foundation-smoke.js --base-path /sandbox --self-test
```

## Local checks

- `pnpm build`: pass.
- Sandbox production build: pass, including exported route verification.
- Storybook build and typecheck: pass.
- Core typecheck: pass.
- `pnpm lint:strict`: pass.
- Guard, CI routing, built-story owner and Sandbox route tests: 64 passed in 4 files.
- Full Sandbox typecheck: fails at unchanged `doc-preview/SectionRenderer.tsx:62` (`TS2345`). A separately installed and built clean worktree at the exact base commit produced the same error. No unrelated documentation renderer change is included.

The PNGs are real-browser captures of the smoke composition, not synthetic screenshots. This asset-only branch is disposable after review.
