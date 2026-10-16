// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useScrollLock.ts
 * @input Uses the isomorphic layout effect and shared document body pin
 * @output Exports useScrollLock for pre-paint scroll locking without page shifts
 * @position Core hook; used by modal Dialog, Drawer, BottomSheet, and Lightbox
 *
 * The shared hold preserves scroll position and the background fixed containing
 * block without reserving a native gutter that clips modal paint.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts
 * - /packages/core/src/hooks/scrollbarGutter.ts
 */

import {useIsomorphicLayoutEffect} from './useIsomorphicLayoutEffect';
import {holdBodyScroll} from './bodyScrollLock';

/**
 * Pin the document body while locked; restore it after the final modal closes.
 * Pinning also prevents background scrolling on iOS Safari.
 *
 * @example
 * ```
 * useScrollLock(isOpen);
 * ```
 */
export function useScrollLock(isLocked: boolean): void {
  useIsomorphicLayoutEffect(() => {
    if (isLocked) {
      return holdBodyScroll(document);
    }
  }, [isLocked]);
}
