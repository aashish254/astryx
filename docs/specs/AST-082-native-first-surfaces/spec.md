---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-082
authority: current
archive_reason: null
superseded_by: null
approved_by: cixzhang
approved_at: 2026-10-20
phase: accepted
owners: [cixzhang]
affects_architecture:
  [architecture:theme-authoring-contract, architecture:theme-compilation]
affects_families: []
affects_contributing: []
affects_consumer_docs: [theme]
---

# Native-first surfaces system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

A person using an Astryx product gets a native-first experience on whatever
surface they use it: the web, a mobile app, or a desktop app. On each surface,
components behave, respond, and perform like that platform's best software, and
a product can offer experiences that exist only on that surface.

A team defines its visual identity once, in one Astryx theme that every surface
shares. Each surface realizes that identity at the highest ceiling the surface
allows, and surface-only visuals are configured in the same theme.

Astryx chooses how each surface is built by measuring candidate approaches
against the platform's own toolkit on the same scenarios, and it depends only on
runtimes it can maintain.

## Non-goals

- The package layout of native surfaces (OQ3) and the order in which surfaces
  and platforms ship (OQ2).
- Exact performance thresholds (OQ1). This record owns what is measured and how
  approaches are compared.
- The internals of any one surface's renderer, once it satisfies this contract.
- Product templates, navigation structures, and app shells built from Astryx
  components.
- Equivalent internal implementations remain valid when they satisfy this
  contract.

## Requirements

- **FR1 — Astryx has named surfaces.** The surfaces are `web` (browsers),
  `mobile` (iOS and Android apps), and `desktop` (macOS and Windows apps). A
  surface is supported only when it meets FR6 and FR7. Every component's
  documentation states the surfaces it supports.
- **FR2 — Each surface targets its own ceiling.** A surface's implementation may
  use any capability its platform offers. No surface is limited to what another
  surface can express: native surfaces are not limited to web markup and CSS,
  and the web is not limited to what native renderers can draw.
- **FR3 — A shared component has one contract.** A component offered on more
  than one surface has one public contract on all of them: its name, the
  meaning of its props and their defaults, its states, its words, and its
  accessibility semantics (name, role, state, focus behavior, and
  announcements). Its structure and the controls it draws may differ by surface.
  A capability only one surface can honor is expressed as theme configuration
  (FR5) or as a surface-only component (FR4), never as a prop of the shared
  component.
- **FR4 — Components may be surface-only.** A component may exist only on the
  surfaces where its experience belongs, such as a native tab bar or a
  browser-only data grid. Using it on a surface it does not support fails at
  type check or build with a message that names the supported surfaces. It
  never renders a silent substitute.
- **FR5 — Visuals are theme configuration shared by every surface.** One
  `defineTheme` definition serves every surface. Shared intent, such as tokens
  and supported component overrides, means the same thing on every surface
  (`architecture:theme-compilation/INV10`). Surface-only visual intent, such as
  a translucent platform material, a platform type scale, density, or touch
  target size, lives in the theme's experimental `surfaces` section, keyed by
  surface (`mobile`, `desktop`). Its first member is `material`, typed
  `'default' | 'liquidGlass'`. A surface reads shared intent and its own
  section, and ignores the sections of other surfaces. A value a surface cannot
  honor renders as if the member were absent. The section is carried through
  `defineTheme`, `extends` (member by member), and built themes, and every
  member value is plain serializable data.
- **FR6 — Native surfaces are native-first.** On `mobile` and `desktop`, a
  component uses the platform's own control or convention when one satisfies
  its contract: navigation, sheets, menus, pickers, switches, text input,
  scrolling, focus, keyboard shortcuts, haptics, and system materials. It draws
  a custom control only where the platform has none. Touch targets meet the
  platform minimum. A surface implementation is supported only when it meets
  the experience, performance, and accessibility criteria of FR7 on that
  surface.
- **FR7 — Approaches are compared on one scorecard.** Every candidate way of
  building a surface, such as native components generated from Astryx contracts
  or Astryx's web React components run through a native renderer, is measured
  the same way:
  - **Scenarios:** one shared set of scripted user flows over representative
    components and templates, each step defined once by the person's gesture
    and its expected state, and replayed unchanged on every candidate and on
    the reference.
  - **Reference:** the same scenarios built directly with the platform's own
    toolkit (for example SwiftUI or UIKit, Jetpack Compose, AppKit, or WinUI).
    The reference sets the ceiling a candidate is scored against.
  - **Devices:** real hardware, including a lower-end device per platform, in
    release builds.
  - **Experience:** conformance to platform conventions and to the shared
    contract (FR3), judged per scenario step.
  - **Performance:** time to first content, frame pacing and dropped frames
    during each scenario, input-to-response latency, memory, and the size the
    approach adds to an app.
  - **Accessibility:** parity with the shared contract for names, roles,
    states, focus order, and announcements under each platform's screen reader.
  - **Maintenance:** the work one Astryx release requires on that surface, and
    whether shared contract changes reach it automatically.
  - **Dependencies:** every required runtime dependency, classified under FR8.

  A candidate that fails FR8 or falls below the OQ1 thresholds is not
  supported, whatever its other scores.

- **FR8 — Required dependencies are platform or first-party.** A surface's
  required runtime dependencies are limited to the platform's own SDKs and
  open-source projects maintained by the organization that maintains Astryx,
  such as React, React Native, Hermes, and StyleX. A third-party library or a
  fork outside that set may be an optional integration, an example, or a
  reference. It is never required to use an Astryx surface.
- **FR9 — The web is unchanged by native intent.** The web theme compiler, the
  `Theme` provider, and the CLI's CSS output never read the `surfaces` section.
  For every theme, generated CSS, mounted rules, and rendered web markup are
  byte-identical with and without it. No web component gains a prop or a
  behavior for another surface.
- **FR10 — Surface theme configuration is experimental.** The `surfaces`
  section's types are exported only from
  `@astryxdesign/core/theme/experimental`, never from the package root or
  `@astryxdesign/core/theme`. Their declarations and the `experimental` member
  carry `@experimental`, and the theme documentation marks the section
  `stability: 'experimental'`. Adding, renaming, retyping, or removing anything
  inside the section is an `[experimental]` patch (`spec:AST-017/FR21`,
  `spec:AST-017/FR22`, `spec:AST-017/FR27`). A native surface reads the section
  from the `DefinedTheme` it receives, source or built, with no web CSS, hook,
  or prop.

### Platform support

- Supported feature/engine floor: the web floor is unchanged. Native platform
  floors are set per surface when it ships (OQ2).
- Unsupported behavior: a surface that ignores a `surfaces` member renders the
  theme's shared intent; a surface-only component used on an unsupported
  surface fails at type check or build (FR4).
- Browser evidence: none for FR9, which is proven at compiler and render output.
  Native surface claims are proven on real devices under FR7.

## Current-state impact

- `architecture:theme-authoring-contract` lists the `surfaces` section in its
  input model and precedence and owns its normalization, extension, and built
  parity (INV13). `defineTheme` does not accept it yet.
- `architecture:theme-compilation` names the section as platform-only intent the
  web compiler does not read (INV10).
- The `theme` consumer doc gains the section, marked experimental, when it
  ships.
- `@astryxdesign/core/theme/experimental` does not exist yet; it ships with the
  types.
- No native surface is supported yet. Component documentation has no surface
  declaration yet; every shipped component supports `web` only.

## Verification

| Contract | Verification                                                                                    | Representative states                                                                                   | Mutation or failure expectation                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| FR1      | Component documentation metadata check                                                          | a shared component; a web-only component; a surface-only native component                               | A component documents no surfaces, or claims a surface that has not met FR7                                        |
| FR2, FR6 | FR7 experience scores per scenario step on each native surface                                  | navigation, sheet, menu, picker, switch, text entry, scrolling, keyboard shortcut                       | A step draws a custom control where the platform provides one, or misses the platform touch-target minimum         |
| FR3      | Contract parity test over each shared component's surface implementations                       | props and defaults, states, words, accessibility semantics                                              | A surface adds, drops, renames, or changes the meaning of a prop, state, word, or accessibility semantic           |
| FR4      | Type and build tests importing a surface-only component on each surface                         | supported surface; unsupported surface                                                                  | The unsupported import type-checks, builds, or renders a substitute                                                |
| FR5      | `defineTheme` unit and type tests, source and built                                             | section omitted; each surface set; child overrides one member; child omits the section; unknown member  | The section is dropped, replaced wholesale on extension, differs between source and built, or accepts unknown keys |
| FR7      | Scenario replay on candidates and reference, on real release builds and devices                 | each scenario on each candidate, the toolkit reference, and a lower-end device per platform             | A candidate is scored without the reference, on a debug build, on emulation only, or on a different scenario set   |
| FR8      | Dependency manifest audit of each surface package                                               | platform SDK; first-party project; third-party optional integration; third-party fork                   | A third-party library or fork is required to install, build, or render the surface                                 |
| FR9      | Compiler and render output comparison                                                           | each maintained theme with and without `surfaces`; runtime-mounted and built CSS; components            | Any byte of CSS, mounted rules, or rendered web markup differs                                                     |
| FR10     | Published-surface and doc-metadata checks (`spec:AST-017/FR24`), plus a no-web-import type test | root, theme, and experimental subpath exports; declaration tags; reading the section from a built theme | The types leak through a stable path, a marker is missing, or reading the section requires CSS, a hook, or a prop  |

## Decision log

### DEC-1 — Every surface targets its own ceiling; surfaces share contracts and themes

**Reference:** `spec:AST-082/DEC-1`
**Decider:** cixzhang, 2026-10-20

A person on any surface should get a native-first experience, so no surface is
held to what another can express. What every surface shares is the component
contract and the theme, which keeps behavior, words, accessibility, and
identity consistent while each surface uses its platform fully.

Rejected: requiring every surface to run the web implementation, because it
caps native experiences at what web markup and CSS can express.

### DEC-2 — Visuals are shared theme configuration; surface-only visuals live in per-surface sections

**Reference:** `spec:AST-082/DEC-2`
**Decider:** cixzhang, 2026-10-20

An app's look already lives in its theme, so surface-only visual intent lives
there too, keyed by surface and experimental while surfaces learn what they
need. Because the web never reads native sections, they can change without risk
to any web user.

Rejected: surface-only props on shared components, because they grow every
component's stable API for one platform.

### DEC-3 — How a surface is built is decided by measurement

**Reference:** `spec:AST-082/DEC-3`
**Decider:** cixzhang, 2026-10-20

Generated native components and web components run through a native renderer
both remain candidates. The FR7 scorecard, measured against the platform's own
toolkit, decides which approach a surface uses, and a surface may change
approach when a candidate scores higher.

### DEC-4 — Astryx requires only platform and first-party runtimes

**Reference:** `spec:AST-082/DEC-4`
**Decider:** cixzhang, 2026-10-20

A surface whose required runtime Astryx cannot maintain can break or stall
outside the project's control, so required dependencies are limited to platform
SDKs and first-party projects (FR8).

## Open questions

- **OQ1 — What thresholds make a candidate supported?** (`human-design`)
  Options: parity with the toolkit reference within a fixed tolerance, or fixed
  absolute budgets per platform. Recommendation: relative to the reference on
  the same device — time to first content and memory within 10%, no more dropped
  frames than the reference across a scenario, and full accessibility parity —
  because absolute budgets drift as devices change.
- **OQ2 — Which surfaces and platforms ship first?** (`human-design`) Options:
  `mobile` (iOS and Android) first, `desktop` (macOS) first, or both together.
  Recommendation: `mobile` first, then `desktop` on macOS, then Windows.
- **OQ3 — How are native surfaces packaged?** (`human-api`) Options: one
  package per native surface family that shares contract types with
  `@astryxdesign/core`, or surface entry points inside `@astryxdesign/core`.
  Recommendation: separate native packages, so web consumers install none of a
  native surface's dependencies.
