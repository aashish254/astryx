---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-081
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
phase: implementing
owners: [cixzhang, imdreamrunner]
affects_architecture:
  [architecture:layer-runtime, architecture:react-component-runtime]
affects_families: [family:overlay-dismissal]
affects_contributing: []
affects_consumer_docs:
  [
    useScrollLock,
    Dialog,
    Drawer,
    BottomSheet,
    BottomSheetSwitcher,
    MobileNav,
    Lightbox,
  ]
---

# Modal scroll-lock geometry

## Intent

Opening a modal preserves the page's horizontal alignment while allowing the
modal's surface and scrim to cover the window. A reserved page scrollbar gutter
is background layout space, not a margin around a modal task.

This boundary is distinct from `spec:AST-059`, which owns intentional clearance
for anchored layers, and `family:overlay-dismissal`, which owns close-request
routing rather than geometry. Neither record owns the relationship between
scroll locking, page alignment, and window coverage.

## Non-goals

- Changing public props, theme tokens, overlay sizing budgets, or dismissal policy.
- Covering a live, operable document scrollbar with a non-modal surface.
- Defining new anchor-placement, focus, gesture, or safe-area rules.
- Requiring an internal measurement algorithm or a particular scroll-lock mechanism.
  Equivalent implementations are valid when they preserve these outcomes.

## Requirements

- **FR1 — The background stays aligned.** Opening and closing a modal MUST
  preserve the horizontal geometry of in-flow content and viewport-fixed page
  chrome, including the global ToastViewport. An author-reserved gutter, including
  a symmetric gutter, MUST keep its background layout budget while any scroll
  lock needs it; it MUST NOT remain a paint exclusion at the modal's window edge.
- **FR2 — Modal coverage reaches the window.** A full-window modal host and its
  native backdrop MUST reach both window edges after the document scrollbar is
  hidden. A side panel MUST meet its chosen edge. Centered and explicitly
  positioned Dialogs MUST resolve their center or edge offset against the window,
  not the inner edge of the reserved background gutter.
- **FR3 — Physical gutters do not redefine logical placement.** The actual
  scrollbar location determines which physical space is recovered. A component's
  logical start/end still follows its own rendered direction, including a region
  whose direction differs from the document.
- **FR4 — Locks compose.** Closing either an upper or a lower overlay MUST NOT
  release a gutter still needed by another lock. A visible exit retains the
  geometry it needs. Final release restores the author's inline declarations,
  their priorities, and the scroll position owned by the released lock.
- **FR5 — No gutter means no compensation.** Platforms with overlay or hidden
  scrollbars MUST retain their existing surface geometry. Non-modal overlays
  MUST NOT acquire a background scroll lock. A viewport resize updates modal
  coverage without replacing the page's layout budget.

### Platform support

`spec:AST-013` owns the browser-support boundary. Background layout containment
and native top-layer coverage are separate browser behaviors. Real-browser
geometry, edge hit testing, and pixels prove their composition; DOM-emulator
layout and a full-width rectangle do not prove painted coverage. Evidence from
one engine does not establish a claim about another.

## Current-state impact

- `useScrollLock` and MobileNav share one document lock lifetime. On classic
  scrollbar pages the body is pinned and the root receives viewport-height layout
  containment at the background's original width, without a real scrollbar gutter.
  Native modal hosts escape that containing block and paint across the window.
- ToastViewport keeps the same physical background margins when promoted into
  the top layer; its author-supplied logical layer insets remain independent.
- Dialog, Lab Drawer, standalone BottomSheet, BottomSheetSwitcher, MobileNav,
  and Lightbox recover window coverage without changing their public APIs.
- AlertDialog, CommandPalette, and adaptive inputs that compose these hosts
  inherit the correction. Inline Dialog and anchored non-modal layers keep their
  existing placement rules.
- `architecture:layer-runtime` continues to own hosting and anchored placement;
  `architecture:react-component-runtime` owns complete resource cleanup.

## Verification

| Contract | Verification                                              | Representative states                                                                     | Mutation or failure expectation                                                |
| -------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| FR1, FR4 | Scroll-lock unit tests and real-browser alignment markers | body pin, document clip, overlapping locks, both close orders, author gutter and priority | Early release or lost author style shifts the page or leaks a lock.            |
| FR2, FR3 | Real-browser bounds and screenshots                       | every native modal host, light/dark, LTR/RTL, desktop/narrow, centered/side/fullscreen    | A surface or scrim ends at the gutter; a logical edge moves to the wrong side. |
| FR4      | Browser transitions and unit lifecycle tests              | close, reopen, unmount, stacked overlays, switcher handoff                                | The page or surface jumps during exit, or a surviving modal loses coverage.    |
| FR5      | Classic and hidden-scrollbar browser lanes                | non-modal controls, no-scroll pages, resize                                               | Hidden-scrollbar geometry changes or a non-modal locks the page.               |

## Decision log

### DEC-1 — Background alignment and modal coverage are separate outcomes

**Reference:** `spec:AST-081/DEC-1`
**Decider:** pending owner approval

A modal can occupy the former scrollbar area while the background retains its
layout budget. The caller does not select between a stationary page and a
full-window overlay.

Rejected: retaining a blank modal edge or allowing page chrome to shift on open;
either exposes scrollbar policy as an unrelated change to the user's task.

## Open questions

- **OQ1 — Exact-head approval.** (`human-design`) This record requires owner
  approval before its draft requirements become current authority.
- **OQ2 — Authored viewport-unit geometry.** (`evidence`) An author-stable root
  gutter changes the browser's viewport-unit basis. Replacing that gutter with
  background containment preserves percent/inset layout but not an arbitrary
  `vw`-sized background. FR1 has no approved exception for this case; its
  compatibility boundary remains unresolved.
- **OQ3 — Additional engine evidence.** (`evidence`) Native layout containment,
  top-layer paint, and scroll restoration need WebKit verification before the
  implementation has cross-engine evidence.
