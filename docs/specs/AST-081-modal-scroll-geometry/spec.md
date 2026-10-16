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
affects_architecture: [architecture:layer-runtime]
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

# Modal scroll-lock viewport geometry

## Intent

Opening a modal keeps the page in place while the modal occupies its intended
part of the window. A platform scrollbar must not leave an uncovered strip
beside a modal surface or its scrim.

This record owns the boundary between background scroll locking and modal
viewport coverage. Anchored-layer clearance belongs to `spec:AST-059`;
scrollable content and its scrollbar presentation belong to `spec:AST-025`.
Neither boundary owns the space released by locking the document.

## Non-goals

- New component props, theme targets, scrollbar styling, or a browser support floor.
- Changing focus, dismissal, paint order, or mobile keyboard policy.
- Extending a non-modal overlay over a visible native document scrollbar.
- Replacing the scroll behavior of an overlay's own content.
- Prescribing a particular measurement, CSS expression, or scroll-lock mechanism.

## Requirements

- **FR1 — Background geometry stays still.** Opening or closing a modal MUST
  preserve the inline position and size of in-flow page content and
  viewport-fixed page chrome. Scroll position and caller-owned styles MUST be
  restored after the last lock ends.
- **FR2 — Modals use the complete window.** A fullscreen modal host and every
  native modal backdrop MUST cover both window edges while the background
  scrollbar is hidden. A side drawer MUST meet its selected logical window
  edge. A centered modal MUST center in the window, not in the narrower held
  background viewport. A sheet keeps its own panel-width budget within its
  full-window host.
- **FR3 — Direction follows the surface.** Logical start/end placement MUST
  follow the overlay's rendered direction. The physical side on which the
  platform reserves a scrollbar MUST NOT be inferred from the overlay's text
  direction. Both-edge gutter reservations MUST preserve their two sides.
- **FR4 — Locks compose.** Closing one participating overlay MUST NOT release
  another overlay's gutter or scroll lock, including when overlays use different
  locking mechanisms or close out of opening order. Sheet handoffs retain one
  modal boundary and one background lock.
- **FR5 — No gutter means no compensation.** Platforms whose scrollbars take no
  space, and pages with no reserved scrollbar space, MUST retain their existing
  overlay geometry. A non-modal overlay MUST NOT acquire a document scroll lock.
- **FR6 — Geometry has the lock's lifetime.** Gutter compensation MUST stay
  consistent with the current viewport during resize, opening, and visible
  modal exit. Final release of background geometry and scroll-lock holds MUST
  restore their pre-existing inline values and priorities without leaving geometry
  resources active.

### Platform support

`spec:AST-013` owns browser support. Real-browser geometry and painted pixels
are required for coverage and layout-stability claims. A non-visual layout may
prove reference counting and restoration, but cannot prove a modal fills the
window. Both the native host rectangle and the pixels at the window edges are
verified: a browser can report a full-width box while clipping its paint.

## Current-state impact

- The shared scroll-lock geometry supports Dialog, fullscreen Dialog, Lab
  Drawer, standalone BottomSheet, BottomSheetSwitcher, MobileNav, and Lightbox.
  Compositions inherit their host's geometry rather than compensating again.
- `architecture:layer-runtime` remains the owner of modal hosting and the
  distinction between native promotion and DOM placement.
- `family:overlay-dismissal` continues to own topmost-only dismissal. Scroll-lock
  reference counting does not change dismissal eligibility or native paint order.
- `useScrollLock` consumer guidance describes background stability; component
  geometry remains automatic, without a caller workaround.

## Verification

| Contract | Verification                                    | Representative states                                                                                          | Failure expectation                                                      |
| -------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| FR1, FR2 | Browser rectangles and before/after screenshots | All modal hosts, centered and fullscreen Dialog, both drawer edges, desktop and narrow windows, light and dark | A blank edge strip, off-center modal, or displaced page landmark         |
| FR3      | Browser geometry plus measured-edge unit cases  | LTR, RTL, nested direction, one-sided and both-edge gutters                                                    | Compensation follows text direction rather than the physical reservation |
| FR4      | Hold-lifetime tests and browser stacks          | Same-family locks, MobileNav with body-pinning overlays, both close orders, sheet handoff                      | A remaining overlay loses its lock or the page moves                     |
| FR5      | Browser control cases                           | Hidden scrollbars, non-scrolling page, non-modal Drawer and sheets                                             | A new gap or a non-modal document lock                                   |
| FR6      | Restoration tests and browser transitions       | Existing inline styles and priorities, resize, exit, reopen, unmount                                           | Stale geometry, premature release, or unreleased resources               |

## Decision log

No approval is recorded. The requirements remain draft pending exact-head owner
review; the implementation and browser evidence do not promote this record.

## Open questions

- **OQ1 — Contract approval** (`human-design`): does the owner approve this
  cross-component geometry boundary as the durable scroll-lock contract?
