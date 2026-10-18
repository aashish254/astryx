---
schema_version: 2
template_version: 2
kind: theme
id: theme:astryx
authority: draft
approved_by: null
approved_at: null
review_triggers:
  [tokens, palette-values, component-mappings, contrast, artifacts]
verified_by:
  [
    packages/core/palette/astryxColorMappings.test.ts,
    scripts/generate-astryx-palette-refs.test.mjs,
    packages/core/src/theme/contrast.test.ts,
  ]
package: '@astryxdesign/core'
source_theme: packages/core/src/theme/tokens.stylex.ts
references:
  [
    architecture:theme-authoring-contract,
    architecture:theme-tokens,
    architecture:theme-compilation,
    architecture:component-theming-surface,
    spec:AST-008,
  ]
---

# Astryx default theme specification

## Intent and audience

The default Astryx color system gives products a cool, restrained foundation,
a clear blue accent, recognizable semantic status colors, and distinct
categorical families in light and dark modes. It serves builders who use Core
without installing a package theme.

## Inheritance and base

Astryx Core supplies these values directly through `colorDefaults` without
extending a package theme. Package themes override supported tokens without
inheriting this palette as authoring data.

## Portable token overrides

`source_theme` owns the portable Core color-token names and their default
`light-dark()` values. Typography, spacing, size, radius, motion, shadow geometry,
interaction structure, syntax colors, and data colors remain outside this mapping.

## Theme-local role definitions

The default theme defines no theme-local color roles. Components consume the
portable semantic and categorical Core token vocabulary.

## Tonal palette definitions

The default authoring palette contains complete Light and Dark ramps for
Neutral, Red, Orange, Yellow, Green, Teal, Cyan, Blue, Purple, and Pink, using
stops `0` through `100` in increments of five. The generated module and receipt
are private authoring and audit data rather than public Core exports.

Neutral is one subtly blue-toned family. Its exact anchors preserve the default
surface and content hierarchy while intermediate stops make the family coherent.
Blue is a separate chromatic family with exact accent anchors at Light 50
`#0064E0` and Dark 60 `#2694FE`. Red anchors at Light 50 `#E71E40` and Dark 60
`#F64054`. Purple centers both modes on exact stop 50 `#7952FF`. Yellow preserves
the warning anchors at Light 75 `#E9AF08` and Dark 80 `#F2C00B`.

Regeneration is an explicit reviewed authoring action. Normal Core builds do not
rerun the generator or adopt a newly generated candidate.

## Component and state mappings

Every portable Core color role maps to a named family, mode, and stop in
`astryxColorMappings.ts`; alpha roles append their reviewed opacity. Literal
StyleX defaults keep palette machinery out of runtime, and the exhaustive mapping
test enforces parity.

Accent uses Blue; success, error, and warning use Green, Red, and Yellow.
`--color-on-warning` uses Neutral as a content role. Named categories use their
matching family, while Gray uses Neutral. Component behavior stays unchanged.

## Compatibility and migration

All existing Core color-token names remain available. This record changes their
default rendered values where the reviewed stop differs; it does not add a
public palette API, require consumers to reference palette stops, or alter the
mechanism for token overrides. Existing themes and applications may retain or
override prior values through the same token surface.

## Accessibility and contrast evidence

Core contrast tests verify their enumerated pairings in both modes. Palette stops
make no standalone accessibility claim; each new component pairing remains
responsible for its contextual evidence.

No current cross-theme design record owns human contrast methodology. That
unresolved dependency remains in Open questions; draft `design:color-emphasis`
does not replace it.

## Build and artifact contract

`palette.config.json`, the complete palette, receipt, selected references, and
mapping metadata are private Core authoring data and are not exported. Their
write/check commands fail on drift; runtime defaults remain literal StyleX values
in `source_theme`.

## Verification map

| Theme contract                | Evidence                                                                      | Representative states                               | Failure signal                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Complete palette and receipt  | `scripts/generate-astryx-palette-refs.test.mjs`                               | all families, modes, stops, and request fields      | Regeneration changes committed palette bytes, stable receipt fields, or material diagnostics.             |
| Selected reference projection | `scripts/generate-astryx-palette-refs.test.mjs`                               | every referenced family, mode, and stop             | A referenced stop is missing, stale, invalid, or differs from the complete palette.                       |
| Portable role mapping         | `packages/core/palette/astryxColorMappings.test.ts`                           | every Core color token in both modes                | A token is unmapped, an unrelated token enters the mapping, or a literal differs from its selected stops. |
| Contextual contrast           | `packages/core/src/theme/contrast.test.ts` and generated-color contrast cases | text and graphical-object pairs in Light and Dark   | An enumerated required pair falls below its threshold.                                                    |
| Runtime and package boundary  | Core build and package tests                                                  | StyleX defaults, declarations, exports, and bundles | Authoring palette data becomes a public export or runtime dependency.                                     |

## Decision log

### DEC-1 — Neutral and Blue remain separate families

**Reference:** `theme:astryx/DEC-1`
**Decider:** `rubyycheung`, `2026-10-17`

Neutral carries the subtly cool surface and content foundation. Blue carries
accent and blue categorical roles. The separation preserves neutral hierarchy
without making accent identity part of the Neutral ramp.

### DEC-2 — Exact anchors preserve the reviewed default identity

**Reference:** `theme:astryx/DEC-2`
**Decider:** `rubyycheung`, `2026-10-17`

Blue, Red, Purple, and Yellow use the exact anchors recorded in Tonal palette
definitions. Intermediate stops remain generated, reviewable palette data.

### DEC-3 — Core roles map explicitly without a public palette API

**Reference:** `theme:astryx/DEC-3`
**Decider:** `rubyycheung`, `2026-10-17`

The private mapping records every role's selected stops and exhaustive tests keep
literal StyleX defaults synchronized. Consumers continue using semantic tokens
and do not need to adopt a palette API.

## Open questions

- **OQ1 — Cross-theme contrast methodology.** Which current design record owns
  the shared human visual and accessibility methodology that default and package
  theme records apply to their contextual evidence?

## Content boundary

This record owns the default Astryx color intent, private palette, mappings,
compatibility, and evidence. Architecture owns token and theme mechanics;
components and families own behavior, and consumer docs own usage.
