// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useScrollLock.ts
 * @input Isomorphic layout effect and the shared document scroll-lock resource
 * @output Exports useScrollLock for pre-paint, reference-counted body scroll locking
 * @position Core hook; used by modal Dialog, Drawer, BottomSheet, and Lightbox
 *
 * Pinning prevents background scroll on iOS as well as desktop. Classic-scrollbar
 * pages keep their background containing block without a viewport paint gutter,
 * so native overlays cover the entire window. The last lock restores author
 * styles and scroll position; visible exits keep their lock until they finish.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/index.ts
 * - /packages/core/src/hooks/scrollLock.ts
 * - /packages/core/src/hooks/useScrollLock.doc.mjs
 * - /packages/core/src/hooks/useScrollLock.test.ts
 */

import {useIsomorphicLayoutEffect} from './useIsomorphicLayoutEffect';
import {holdScrollLock} from './scrollLock';

/**
 * Locks body scroll while active. Concurrent overlays share one lock lifetime.
 *
 * @example
 * ```
 * useScrollLock(isOpen);
 * ```
 */
export function useScrollLock(isLocked: boolean): void {
  useIsomorphicLayoutEffect(() => {
    if (!isLocked) {
      return;
    }
    return holdScrollLock(document);
  }, [isLocked]);
}
