// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useScrollLock.ts
 * @input Uses React useEffect, live layout measurements of the layout viewport
 * @output Exports useScrollLock hook for locking body scroll, and the
 *   SCROLL_LOCK_GUTTER_PROPERTY custom property it publishes while locked
 * @position Core hook; used by Dialog, BottomSheet, Lightbox, MobileNav and
 *   Lab's Drawer to prevent background scrolling behind a modal overlay
 *
 * Locks body scroll when active by pinning the body with position:fixed.
 * This is needed because overscroll-behavior:contain doesn't work on iOS Safari.
 *
 * Pinning the body hides the document's scrollbar. Where that scrollbar is a
 * classic (space-taking) one — Windows/Linux desktop, and macOS set to
 * "Always" show scroll bars — the layout viewport widens by the scrollbar's
 * width the moment it goes. Two things want opposite outcomes from that:
 *
 * - The page behind the overlay must not reflow sideways.
 * - The overlay itself must reach the window edge. Modal `<dialog>` surfaces
 *   and their `::backdrop` live in the top layer and are sized against the
 *   layout viewport, so they can only reach the window edge if the viewport
 *   does.
 *
 * Holding the gutter closed with `scrollbar-gutter: stable` serves the first
 * and defeats the second: a reserved gutter is outside the layout viewport,
 * and nothing an author can position — not even the top layer — paints into
 * it. With an overlay open it showed as a blank strip of page background
 * beside the overlay, the width of the scrollbar.
 *
 * So the lock lets the viewport take the scrollbar's space, and holds the
 * page's layout itself: the pinned body is inset from the viewport's right
 * edge by exactly the width the viewport grew, measured rather than assumed,
 * so in-flow content keeps the box it had. The same width is published on the
 * root as a custom property (`SCROLL_LOCK_GUTTER_PROPERTY`), which fixed chrome
 * positioned against the viewport's right edge can add to its own inset to
 * stay put as well; the toast viewport does. The strip beside the body is the
 * canvas background and sits under the overlay's scrim.
 *
 * The inset goes on the physical right edge: Chromium draws the document
 * scrollbar there for every document direction, right-to-left included, and
 * the other engines do by default. Which edge a browser actually used is not
 * observable from script, so a browser configured to draw it on the left sees
 * the page shift by the scrollbar's width behind the scrim — the behavior
 * every page had before the lock held anything.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts
 * - /packages/core/src/hooks/useScrollLock.doc.mjs
 * - /packages/core/src/hooks/useScrollLock.test.ts
 * - /packages/core/src/hooks/scrollLockGutter.stylex.ts (StyleX-side reference)
 * - /packages/core/src/Toast/ToastViewport.tsx (reads the gutter property)
 */

import {useEffect} from 'react';

/**
 * Custom property set on `<html>` for the duration of a scroll lock that hid
 * a space-taking scrollbar. Its value is the width that scrollbar took, which
 * the layout viewport gained at its right edge when the scrollbar went.
 *
 * In-flow content is already held in place by the lock. Chrome positioned
 * against the viewport's right edge (`position: fixed` or the top layer) is
 * not, and adds this to its right inset to stay where it was:
 *
 * ```
 * right: calc(16px + var(--astryx-scroll-lock-gutter, 0px))
 * ```
 *
 * Unset — so the fallback applies — whenever nothing is locked, and when the
 * scrollbar is an overlay one that took no space to begin with.
 */
export const SCROLL_LOCK_GUTTER_PROPERTY = '--astryx-scroll-lock-gutter';

interface ScrollLockSnapshot {
  scrollX: number;
  scrollY: number;
  overflow: string;
  position: string;
  top: string;
  left: string;
  right: string;
}

let lockCount = 0;
let originalBodyState: ScrollLockSnapshot | null = null;

/**
 * Width of the layout viewport — the box `position: fixed` resolves against —
 * read from a fixed probe spanning it. `documentElement.clientWidth` reports
 * the window width whenever no scrollbar is rendered, even while a
 * `scrollbar-gutter` reservation keeps the viewport narrower, so it cannot
 * tell a scrollbar that gave its space to the layout from one that did not.
 */
function measureLayoutViewportWidth(): number {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;right:0;height:0;visibility:hidden;pointer-events:none';
  document.documentElement.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return width;
}

/**
 * Locks body scroll when `isLocked` is true.
 *
 * Pins the body with `position: fixed` to prevent background scrolling,
 * which is necessary for iOS Safari where `overscroll-behavior: contain`
 * does not prevent body scroll behind modals. Restores scroll position
 * on unlock.
 *
 * Pinning also hides the document's scrollbar. Where that scrollbar took
 * layout space, the viewport grows by its width and modal overlays reach the
 * window edge; the pinned body is inset by the same width so the page behind
 * does not reflow, and the width is published as
 * {@link SCROLL_LOCK_GUTTER_PROPERTY} for fixed chrome to compensate with.
 *
 * @example
 * ```
 * useScrollLock(isOpen);
 * ```
 */
export function useScrollLock(isLocked: boolean): void {
  useEffect(() => {
    if (!isLocked) {
      return;
    }

    const {body} = document;
    const root = document.documentElement;

    if (lockCount === 0) {
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;

      originalBodyState = {
        scrollX,
        scrollY,
        overflow: body.style.overflow,
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        right: body.style.right,
      };

      // Only a space-taking scrollbar can hand the viewport any width, so the
      // measurement is skipped where there is none to hide (overlay
      // scrollbars: mobile, default macOS). Taken before the pinning styles
      // below hide it.
      const hasSpaceTakingScrollbar = window.innerWidth > root.clientWidth;
      const viewportWidthBefore = hasSpaceTakingScrollbar
        ? measureLayoutViewportWidth()
        : 0;

      body.style.overflow = 'hidden';
      body.style.position = 'fixed';
      body.style.top = `-${scrollY}px`;
      body.style.left = '0';
      body.style.right = '0';

      // What hiding the scrollbar actually did to the viewport, rather than
      // what the scrollbar measured: 0 on a page that reserves the gutter
      // itself with `scrollbar-gutter: stable`, where the viewport does not
      // change and neither must the body.
      const gutter = hasSpaceTakingScrollbar
        ? measureLayoutViewportWidth() - viewportWidthBefore
        : 0;
      if (gutter > 0) {
        body.style.right = `${gutter}px`;
        root.style.setProperty(SCROLL_LOCK_GUTTER_PROPERTY, `${gutter}px`);
      }
    }

    lockCount += 1;

    return () => {
      lockCount -= 1;

      if (lockCount !== 0 || originalBodyState == null) {
        return;
      }

      const state = originalBodyState;
      originalBodyState = null;

      body.style.overflow = state.overflow;
      body.style.position = state.position;
      body.style.top = state.top;
      body.style.left = state.left;
      body.style.right = state.right;
      root.style.removeProperty(SCROLL_LOCK_GUTTER_PROPERTY);
      window.scrollTo(state.scrollX, state.scrollY);
    };
  }, [isLocked]);
}
