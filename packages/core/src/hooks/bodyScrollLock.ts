// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file bodyScrollLock.ts
 * @input A document and its current scroll position and inline body styles
 * @output An idempotent release function for a reference-counted body pin
 * @position Shared by useScrollLock and classic-scrollbar MobileNav clipping;
 *   one owner captures/restores the scroll position across mixed modal stacks
 */

import {holdScrollbarGutter} from './scrollbarGutter';

interface BodyHold {
  count: number;
  restore(): void;
}
const holds = new WeakMap<Document, BodyHold>();
const properties = ['overflow', 'position', 'top', 'left', 'right'] as const;

export function isBodyScrollHeld(doc: Document): boolean {
  return holds.has(doc);
}

export function holdBodyScroll(doc: Document): () => void {
  const view = doc.defaultView;
  if (!view) {
    return () => {};
  }
  let hold = holds.get(doc);
  if (hold) {
    hold.count += 1;
  } else {
    const body = doc.body;
    const {scrollX, scrollY} = view;
    const saved = properties.map(name => ({
      name,
      value: body.style.getPropertyValue(name),
      priority: body.style.getPropertyPriority(name),
    }));
    const gutter = holdScrollbarGutter(body);
    const before = gutter.hasReservation ? body.getBoundingClientRect() : null;
    for (const [name, value] of Object.entries({
      overflow: 'hidden',
      position: 'fixed',
      top: `-${scrollY}px`,
      left: '0',
      right: '0',
    })) {
      body.style.setProperty(
        name,
        value,
        saved.find(entry => entry.name === name)?.priority,
      );
    }
    gutter.settle();
    if (before) {
      // Root margins/padding can make the body start somewhere other than the
      // viewport origin. Preserve that existing border box, not an assumed one.
      const after = body.getBoundingClientRect();
      for (const [name, value] of Object.entries({
        left: `${before.left - after.left}px`,
        right: `${after.right - before.right}px`,
        top: `${-scrollY + before.top - after.top}px`,
      })) {
        body.style.setProperty(
          name,
          value,
          saved.find(entry => entry.name === name)?.priority,
        );
      }
    }
    hold = {
      count: 1,
      restore() {
        for (const {name, value, priority} of saved) {
          if (value) {
            body.style.setProperty(name, value, priority);
          } else {
            body.style.removeProperty(name);
          }
        }
        gutter.release();
        view.scrollTo(scrollX, scrollY);
      },
    };
    holds.set(doc, hold);
  }
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    hold.count -= 1;
    if (hold.count === 0) {
      hold.restore();
      holds.delete(doc);
    }
  };
}
