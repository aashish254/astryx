// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollLock.ts
 * @input A document and the requesting overlay's body-pin or root-clip strategy
 * @output An idempotent release for one shared scroll-lock resource
 * @position Private lifecycle owner used by useScrollLock and MobileNav
 *
 * The first lock snapshots page geometry. Classic-scrollbar reservations need
 * both a body pin and root clipping; hidden-scrollbar callers keep their existing
 * strategy. A later lock may add a strategy but never restores one while any
 * overlay remains. This also makes mixed-family, out-of-order closes safe.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/useScrollLock.ts
 * - /packages/core/src/MobileNav/MobileNav.tsx
 * - /packages/core/src/hooks/scrollLock.test.ts
 */

import {holdScrollbarGutter} from './scrollbarGutter';

type Restore = () => void;
function saveStyles(
  element: HTMLElement,
  properties: ReadonlyArray<string>,
): Restore {
  const saved = properties.map(property => ({
    property,
    value: element.style.getPropertyValue(property),
    priority: element.style.getPropertyPriority(property),
  }));
  return () => {
    for (const {property, value, priority} of saved) {
      if (value) {
        element.style.setProperty(property, value, priority);
      } else {
        element.style.removeProperty(property);
      }
    }
  };
}
interface ScrollLock {
  count: number;
  pinBody(): void;
  clipRoot(): void;
  restore(): void;
}
const locks = new WeakMap<Document, ScrollLock>();

export function holdScrollLock(
  document: Document,
  strategy: 'body' | 'root' = 'body',
): Restore {
  const window = document.defaultView;
  if (!window) {
    return () => {};
  }
  let lock = locks.get(document);
  if (!lock) {
    const {body, documentElement: root} = document;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const gutter = holdScrollbarGutter(body);
    let restoreBody: Restore | undefined;
    let restoreRoot: Restore | undefined;
    lock = {
      count: 0,
      pinBody() {
        if (restoreBody) {
          return;
        }
        restoreBody = saveStyles(body, [
          'overflow',
          'position',
          'top',
          'left',
          'right',
        ]);
        for (const [property, value] of Object.entries({
          overflow: 'hidden',
          position: 'fixed',
          top: `-${scrollY}px`,
          left: '0',
          right: '0',
        })) {
          body.style.setProperty(property, value, 'important');
        }
      },
      clipRoot() {
        if (restoreRoot) {
          return;
        }
        restoreRoot = saveStyles(root, ['overflow']);
        root.style.setProperty('overflow', 'clip', 'important');
      },
      restore() {
        gutter.release();
        restoreBody?.();
        restoreRoot?.();
        if (restoreBody) {
          window.scrollTo(scrollX, scrollY);
        }
      },
    };
    locks.set(document, lock);
    if (strategy === 'body' || gutter.requiresBodyPin) {
      lock.pinBody();
    }
    if (strategy === 'root' || gutter.requiresBodyPin) {
      lock.clipRoot();
    }
    gutter.settle();
  } else if (strategy === 'body') {
    lock.pinBody();
  } else {
    lock.clipRoot();
  }
  lock.count += 1;
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    lock.count -= 1;
    if (lock.count === 0) {
      lock.restore();
      locks.delete(document);
    }
  };
}
