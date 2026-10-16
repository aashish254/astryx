// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollbarGutter.ts
 * @input The element a scroll lock pins, plus live layout measurements
 * @output Exports holdScrollbarGutter, the ScrollbarGutterHold it returns, and
 *   SCROLLBAR_GUTTER_PROPERTY, the custom property it publishes
 * @position Internal hook utility; used by useScrollLock and MobileNav so that
 *   locking background scroll does not reflow the page sideways.
 *
 * Locking scroll hides the document's scrollbar. Where that scrollbar is a
 * classic (space-taking) one — Windows/Linux desktop, and macOS set to
 * "Always" show scroll bars — hiding it widens the layout viewport by the
 * scrollbar's width, and everything laid out against that width moves.
 *
 * The hold lets the viewport grow and compensates in two places:
 *
 * 1. In-flow content: the locked element is padded on the right by exactly
 *    the width it grew, so its content box — and the page inside it — keeps
 *    the width it had. Growth is measured, not assumed: a page that reserves
 *    the gutter itself (`scrollbar-gutter: stable`) never grows and is never
 *    padded.
 * 2. `position: fixed` chrome (toast viewports, floating docks) resolves
 *    against the viewport, which padding cannot hold. The measured width is
 *    published on `<html>` as `--astryx-scrollbar-gutter` for the duration of
 *    the lock; chrome anchored to the window's right edge adds it to its
 *    offset and stays put. Astryx's own ToastViewport and ChatLayout dock do.
 *
 * Reserving the gutter on the viewport instead (`scrollbar-gutter: stable` on
 * `<html>`) holds fixed chrome without any opt-in, but it keeps the viewport
 * at its pre-lock width, and the browser clips the top layer — every modal
 * `<dialog>` and its `::backdrop` included — at the gutter's inner edge. The
 * strip where the scrollbar was then shows bare page background beside the
 * open overlay: a drawer or fullscreen dialog stops a scrollbar's width short
 * of the window, and a centered dialog is off-center. Viewport units shrink
 * with it, so no overlay can reach across. Letting the viewport grow is the
 * only way an overlay reaches the window edge on a page with a classic
 * scrollbar.
 *
 * The compensation is applied to the physical right side, where every engine
 * draws the document scrollbar for an LTR page and where Chromium and WebKit
 * also keep it for an RTL page. Firefox draws an RTL page's scrollbar on the
 * left; there the page grows leftwards, and right-side padding moves in-flow
 * content instead of holding it. No DOM measurement tells the two sides
 * apart (client coordinates are relative to the layout viewport either way).
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/useScrollLock.ts
 * - /packages/core/src/hooks/useScrollLock.doc.mjs (documented behavior)
 * - /packages/core/src/MobileNav/MobileNav.tsx
 * - /packages/core/src/Toast/ToastViewport.tsx (reads the property)
 * - /packages/core/src/Chat/ChatLayout.tsx (reads the property)
 */

/**
 * Custom property on `<html>` holding the width of the document scrollbar a
 * scroll lock has hidden, as a `px` length. Set only while a lock hides a
 * space-taking scrollbar; absent otherwise, so readers fall back to `0px`.
 *
 * `position: fixed` chrome anchored to the window's right edge adds it to its
 * offset to stay still while an overlay is open:
 * `right: calc(16px + var(--astryx-scrollbar-gutter, 0px))`.
 */
export const SCROLLBAR_GUTTER_PROPERTY = '--astryx-scrollbar-gutter';

const NOOP: ScrollbarGutterHold = {
  settle() {},
  release() {},
};

export interface ScrollbarGutterHold {
  /**
   * Call once the lock's own styles are applied: measures how much the
   * element grew and pads that width away, publishing it for fixed chrome.
   */
  settle(): void;
  /** Call on unlock: restores everything this hold changed. */
  release(): void;
}

/**
 * Keeps `element`'s content box the width it is right now, across a scroll
 * lock that is about to hide the document's scrollbar.
 *
 * Call it *before* applying the lock's styles, then {@link
 * ScrollbarGutterHold.settle} immediately after, and {@link
 * ScrollbarGutterHold.release} on unlock:
 *
 * ```
 * const hold = holdScrollbarGutter(document.body);
 * body.style.position = 'fixed';
 * hold.settle();
 * ```
 *
 * Overlay scrollbars (mobile, default macOS) take no layout space, so there is
 * nothing to hold and nothing is touched.
 */
export function holdScrollbarGutter(element: HTMLElement): ScrollbarGutterHold {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return NOOP;
  }

  const root = document.documentElement;
  const viewportWidth = root.clientWidth;

  // 0 means "no layout to measure" (jsdom, and any non-visual environment),
  // not "the scrollbar is as wide as the window".
  if (viewportWidth === 0) {
    return NOOP;
  }

  // Only when a space-taking scrollbar is actually there. An overlay
  // scrollbar, a page too short to scroll, and a second lock taken while the
  // first already hid the scrollbar all measure 0 and leave nothing to do.
  if (window.innerWidth <= viewportWidth) {
    return NOOP;
  }

  const previousPadding = element.style.paddingRight;
  const previousProperty = root.style.getPropertyValue(
    SCROLLBAR_GUTTER_PROPERTY,
  );
  const widthBefore = element.getBoundingClientRect().width;

  let padded = false;
  let published = false;
  let settled = false;

  return {
    settle() {
      if (settled) {
        return;
      }
      settled = true;

      // What the lock actually did to this element, rather than what we
      // assumed it would do. 0 on a page that already sets
      // `scrollbar-gutter: stable` itself, where the scrollbar was never
      // taking the space back and nothing has moved.
      const grew = element.getBoundingClientRect().width - widthBefore;
      if (grew <= 0) {
        return;
      }

      const existing =
        Number.parseFloat(window.getComputedStyle(element).paddingRight) || 0;
      element.style.paddingRight = `${existing + grew}px`;
      padded = true;

      root.style.setProperty(SCROLLBAR_GUTTER_PROPERTY, `${grew}px`);
      published = true;
    },

    release() {
      if (padded) {
        element.style.paddingRight = previousPadding;
        padded = false;
      }
      if (published) {
        if (previousProperty) {
          root.style.setProperty(SCROLLBAR_GUTTER_PROPERTY, previousProperty);
        } else {
          root.style.removeProperty(SCROLLBAR_GUTTER_PROPERTY);
        }
        published = false;
      }
    },
  };
}
