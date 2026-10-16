// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file documentScrollClip.ts
 * @input A document, its scrollbar reservation, and the shared body scroll lock
 * @output An idempotent release function for reference-counted document clipping
 * @position MobileNav scroll locking; keeps the existing root clip and adds the
 *   shared body pin only when a classic gutter needs a stable background viewport
 */

import {holdBodyScroll, isBodyScrollHeld} from './bodyScrollLock';

interface ClipHold {
  count: number;
  overflow: string;
  priority: string;
  releaseBody?: () => void;
}
const holds = new WeakMap<Document, ClipHold>();

export function holdDocumentScrollClip(doc: Document): () => void {
  const view = doc.defaultView;
  if (!view) {
    return () => {};
  }
  const root = doc.documentElement;
  let hold = holds.get(doc);
  if (hold) {
    hold.count += 1;
  } else {
    const hasReservation =
      root.clientWidth > 0 &&
      (view.innerWidth > root.clientWidth ||
        view
          .getComputedStyle(root)
          .getPropertyValue('scrollbar-gutter')
          .includes('stable'));
    hold = {
      count: 1,
      overflow: root.style.getPropertyValue('overflow'),
      priority: root.style.getPropertyPriority('overflow'),
      releaseBody:
        hasReservation || isBodyScrollHeld(doc)
          ? holdBodyScroll(doc)
          : undefined,
    };
    holds.set(doc, hold);
    root.style.setProperty('overflow', 'clip', hold.priority);
  }
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    hold.count -= 1;
    if (hold.count > 0) {
      return;
    }
    if (hold.overflow) {
      root.style.setProperty('overflow', hold.overflow, hold.priority);
    } else {
      root.style.removeProperty('overflow');
    }
    hold.releaseBody?.();
    holds.delete(doc);
  };
}
