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

A person using an Astryx product gets a native-first experience wherever they
use it: in a browser, or in a native app on iOS, Android, macOS, or Windows. On
each platform, components behave, respond, and perform like that platform's best
software on the OS version the person runs, and a product can offer experiences
that exist only on some platforms.

A team defines its visual identity once, in one Astryx theme. Native-only visual
intent is written as durable outcomes that keep their meaning as platforms
change. A feature tied to one platform or OS version is written only inside a
scope that names that platform and its version range.

Astryx chooses how each native platform is built by measuring candidate
approaches against the platform's own toolkit on the same scenarios, and it
depends only on runtimes it can maintain.

## Non-goals

- The package layout of native platforms (OQ3), the order in which platforms
  ship (OQ2), and each platform's supported OS versions (OQ4).
- Exact performance thresholds (OQ1). This record owns what is measured and how
  approaches are compared.
- The internals of any one platform's implementation, once it satisfies this
  contract.
- Product templates, navigation structures, and app shells built from Astryx
  components.
- Equivalent internal implementations remain valid when they satisfy this
  contract.

## Requirements

- **FR1 — Astryx targets the web and named native platforms.** The web surface
  is browsers. The native surface is apps on the native platforms `ios` (iPhone
  and iPad), `android`, `macos`, and `windows`. Each native platform declares the
  OS versions it supports (OQ4). A native platform is supported only when it
  meets FR6 and FR7. Every component's documentation states the web and native
  platforms it supports.
- **FR2 — Each platform targets its own ceiling.** An implementation may use any
  capability its platform offers. No platform is limited to what another can
  express: native platforms are not limited to web markup and CSS, and the web
  is not limited to what native implementations can draw.
- **FR3 — A shared component has one contract.** A component offered on more
  than one platform has one public contract on all of them: its name, the
  meaning of its props and their defaults, its states, its words, and its
  accessibility semantics (name, role, state, focus behavior, and
  announcements). Its structure and the controls it draws may differ by
  platform. A capability only some platforms can honor is expressed as theme
  configuration (FR5) or as a platform-specific component (FR4), never as a prop
  of the shared component.
- **FR4 — Components may be platform-specific.** A component may exist only on
  the platforms where its experience belongs, such as a tab bar on `ios` and
  `android` or a browser-only data grid. Using it on a platform it does not
  support fails at type check or build with a message that names the supported
  platforms. It never renders a silent substitute.
- **FR5 — Visuals are theme configuration shared by every platform.** One
  `defineTheme` definition serves the web and every native platform. Shared
  intent, such as tokens and supported component overrides, means the same thing
  everywhere (`architecture:theme-compilation/INV10`). Native-only visual intent
  lives in the theme's experimental `native` section in two layers:
  - **Durable intent.** Members name an outcome a person sees, never a platform
    feature name or an OS version. The first member is `material`, typed
    `'opaque' | 'translucent'`. Every native platform reads durable intent and
    realizes it with the closest capability of the running OS version, such as
    the system glass material on iOS versions that have one, or an earlier
    system blur. A platform with no such capability renders as if the member
    were absent.
  - **Scoped refinements.** `native.platforms.<platform>` is an ordered list of
    entries. Each entry names an OS version range, `minVersion` and an optional
    `maxVersion`, and members from that platform's own vocabulary, such as
    `material: 'liquidGlass'` for `ios`. An entry applies only on its platform
    when the running OS version is inside its range. There, its members replace
    durable members of the same name, and a later matching entry replaces an
    earlier one. Outside every entry's range, durable intent applies.

  A platform feature name or OS version is valid only inside a scoped entry. The
  section is carried through `defineTheme`, `extends`, and built themes: durable
  members merge member by member, and a child's entry list for a platform
  replaces the base's list for that platform. Every value is plain serializable
  data, and a member outside the published vocabulary is a type error.

- **FR6 — Native platforms are native-first on every supported OS version.** A
  component uses the platform's own control or convention when one satisfies its
  contract: navigation, sheets, menus, pickers, switches, text input, scrolling,
  focus, keyboard shortcuts, haptics, and system materials. It draws a custom
  control only where the platform has none. On each supported OS version it uses
  that version's controls and materials. A capability newer than the running OS
  degrades to the closest earlier platform equivalent or to durable intent, never
  to a broken or blank state. Touch targets meet the platform minimum. A native
  platform is supported only when it meets the FR7 criteria on its oldest and
  newest supported OS versions.
- **FR7 — Approaches are compared on one scorecard.** Every candidate way of
  building a native platform, such as native components generated from Astryx
  contracts or Astryx's web React components run through a native renderer, is
  measured the same way:
  - **Scenarios:** one shared set of scripted user flows over representative
    components and templates, each step defined once by the person's gesture
    and its expected state, and replayed unchanged on every candidate and on
    the reference.
  - **Reference:** the same scenarios built directly with the platform's own
    toolkit, such as SwiftUI or UIKit, Jetpack Compose, AppKit, or WinUI. The
    reference sets the ceiling a candidate is scored against.
  - **Devices:** real hardware running release builds, on the oldest and newest
    supported OS version of each platform, including a lower-end device.
  - **Experience:** conformance to platform conventions and to the shared
    contract (FR3), judged per scenario step.
  - **Performance:** time to first content, frame pacing and dropped frames
    during each scenario, input-to-response latency, memory, and the size the
    approach adds to an app.
  - **Accessibility:** parity with the shared contract for names, roles,
    states, focus order, and announcements under each platform's screen reader.
  - **Maintenance:** the work one Astryx release and one new OS version require
    on that platform, and whether shared contract changes reach it
    automatically.
  - **Dependencies:** every required runtime dependency, classified under FR8.

  A candidate that fails FR8 or falls below the OQ1 thresholds is not
  supported, whatever its other scores.

- **FR8 — Required dependencies are platform or first-party.** A native
  platform's required runtime dependencies are limited to the platform's own
  SDKs and open-source projects maintained by the organization that maintains
  Astryx, such as React, React Native, Hermes, and StyleX. A third-party library
  or a fork outside that set may be an optional integration, an example, or a
  reference. It is never required to use Astryx on any platform.
- **FR9 — The web is unchanged by native intent.** The web theme compiler, the
  `Theme` provider, and the CLI's CSS output never read the `native` section.
  For every theme, generated CSS, mounted rules, and rendered web markup are
  byte-identical with and without it. No web component gains a prop or a
  behavior for a native platform.
- **FR10 — Native theme configuration is experimental.** The `native` section's
  types are exported only from `@astryxdesign/core/theme/experimental`, never
  from the package root or `@astryxdesign/core/theme`. Their declarations and the
  `experimental` member carry `@experimental`, and the theme documentation marks
  the section `stability: 'experimental'`. Adding, renaming, retyping, or
  removing anything inside the section, including a platform vocabulary member
  for a new OS version, is an `[experimental]` patch (`spec:AST-017/FR21`,
  `spec:AST-017/FR22`, `spec:AST-017/FR27`). A native platform reads the section
  from the `DefinedTheme` it receives, source or built, with no web CSS, hook,
  or prop.

### Platform support

- Supported feature/engine floor: the web floor is unchanged. Each native
  platform declares its supported OS versions (OQ4).
- Unsupported behavior: on an OS version outside every scoped entry, durable
  intent applies; a durable member a platform cannot realize renders as absent;
  a platform-specific component used on an unsupported platform fails at type
  check or build (FR4).
- Browser evidence: none for FR9, which is proven at compiler and render output.
  Native claims are proven on real devices under FR7.

## Current-state impact

- `architecture:theme-authoring-contract` lists the `native` section in its
  input model and precedence and owns its normalization, extension, and built
  parity (INV13). `defineTheme` does not accept it yet.
- `architecture:theme-compilation` names the section as platform-only intent
  the web compiler does not read (INV10).
- The `theme` consumer doc gains the section, marked experimental, when it
  ships.
- `@astryxdesign/core/theme/experimental` does not exist yet; it ships with the
  types.
- No native platform is supported yet. Component documentation has no platform
  declaration yet; every shipped component supports the web only.

## Verification

| Contract | Verification                                                                                    | Representative states                                                                                                                                  | Mutation or failure expectation                                                                                                                |
| -------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| FR1      | Component documentation metadata check                                                          | a shared component; a web-only component; a component on some native platforms                                                                         | A component documents no platforms, or claims a native platform that has not met FR7                                                           |
| FR2, FR6 | FR7 experience scores per scenario step on each native platform, oldest and newest supported OS | navigation, sheet, menu, picker, switch, text entry, scrolling, keyboard shortcut; a capability newer than the running OS                              | A step draws a custom control where the platform provides one, misses the touch-target minimum, or breaks on the oldest supported OS           |
| FR3      | Contract parity test over each shared component's platform implementations                      | props and defaults, states, words, accessibility semantics                                                                                             | A platform adds, drops, renames, or changes the meaning of a prop, state, word, or accessibility semantic                                      |
| FR4      | Type and build tests importing a platform-specific component on each platform                   | supported platform; unsupported platform                                                                                                               | The unsupported import type-checks, builds, or renders a substitute                                                                            |
| FR5      | `defineTheme` unit and type tests, source and built, plus a resolution test per platform        | section omitted; durable `material` only; scoped entry inside and outside its range; overlapping entries; child overrides; platform term outside scope | A platform term type-checks outside a scope, an entry applies outside its range, overlap order is ignored, or extension or build drops members |
| FR7      | Scenario replay on candidates and reference, on real release builds and devices                 | each scenario on each candidate and the toolkit reference; oldest and newest supported OS; a lower-end device per platform                             | A candidate is scored without the reference, on a debug build, on emulation only, on one OS version, or on a different scenario set            |
| FR8      | Dependency manifest audit of each native platform package                                       | platform SDK; first-party project; third-party optional integration; third-party fork                                                                  | A third-party library or fork is required to install, build, or render on the platform                                                         |
| FR9      | Compiler and render output comparison                                                           | each maintained theme with and without `native`; runtime-mounted and built CSS; components                                                             | Any byte of CSS, mounted rules, or rendered web markup differs                                                                                 |
| FR10     | Published-surface and doc-metadata checks (`spec:AST-017/FR24`), plus a no-web-import type test | root, theme, and experimental subpath exports; declaration tags; reading the section from a built theme                                                | The types leak through a stable path, a marker is missing, or reading the section requires CSS, a hook, or a prop                              |

## Decision log

### DEC-1 — Every platform targets its own ceiling; platforms share contracts and themes

**Reference:** `spec:AST-082/DEC-1`
**Decider:** cixzhang, 2026-10-20

A person on any platform should get a native-first experience, so no platform
is held to what another can express. What every platform shares is the
component contract and the theme, which keeps behavior, words, accessibility,
and identity consistent while each platform uses its own capabilities fully.

Rejected: requiring every platform to run the web implementation, because it
caps native experiences at what web markup and CSS can express.

### DEC-2 — Native-only visuals are theme configuration, not component props

**Reference:** `spec:AST-082/DEC-2`
**Decider:** cixzhang, 2026-10-20

An app's look already lives in its theme, so native-only visual intent lives
there too, in an experimental section the web never reads. It can change while
native platforms learn what they need, without risk to any web user.

Rejected: platform-specific props on shared components, because they grow every
component's stable API for some platforms.

### DEC-3 — How a native platform is built is decided by measurement

**Reference:** `spec:AST-082/DEC-3`
**Decider:** cixzhang, 2026-10-20

Generated native components and web components run through a native renderer
both remain candidates. The FR7 scorecard, measured against the platform's own
toolkit, decides which approach a platform uses, and a platform may change
approach when a candidate scores higher.

### DEC-4 — Astryx requires only platform and first-party runtimes

**Reference:** `spec:AST-082/DEC-4`
**Decider:** cixzhang, 2026-10-20

A platform whose required runtime Astryx cannot maintain can break or stall
outside the project's control, so required dependencies are limited to platform
SDKs and first-party projects (FR8).

### DEC-5 — Native theme intent is durable; platform and version features are scoped

**Reference:** `spec:AST-082/DEC-5`
**Decider:** cixzhang, 2026-10-20

Platform features are introduced, renamed, and retired across OS releases, so
the shared native vocabulary names outcomes a person sees, and each platform
maps them to what its running OS offers. A feature that exists only on one
platform or OS version stays expressible inside a scope that names the platform
and version range, so it never reaches a platform or version where it means
nothing.

Rejected: platform feature names in shared native intent, because they lose
their meaning on other platforms and OS versions.

## Open questions

- **OQ1 — What thresholds make a candidate supported?** (`human-design`)
  Options: parity with the toolkit reference within a fixed tolerance, or fixed
  absolute budgets per platform. Recommendation: relative to the reference on
  the same device and OS version — time to first content and memory within 10%,
  no more dropped frames than the reference across a scenario, and full
  accessibility parity — because absolute budgets drift as devices change.
- **OQ2 — Which native platforms ship first?** (`human-design`) Options: `ios`
  and `android` first, `macos` first, or all together. Recommendation: `ios` and
  `android`, then `macos`, then `windows`.
- **OQ3 — How are native platforms packaged?** (`human-api`) Options: native
  packages that share contract types with `@astryxdesign/core`, or platform
  entry points inside `@astryxdesign/core`. Recommendation: separate native
  packages, so web consumers install none of a native platform's dependencies.
- **OQ4 — Which OS versions does each native platform support?**
  (`human-design`) Options: the latest two major versions of each OS, or a floor
  tied to a minimum share of active devices. Recommendation: the latest two
  major versions, reviewed at each major OS release, because it bounds testing
  and keeps scoped entries few.
