// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollbarGutter.test.ts
 * @input Stubbed fixed-viewport rectangles and reference-counted gutter holds
 * @output Unit coverage for background viewport preservation and exact cleanup
 * @position Tests configuration and lifetime; browser tests prove pixels/layout
 *
 * SYNC: When scrollbarGutter.ts changes, update these tests.
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {holdScrollbarGutter, type ScrollbarGutterHold} from './scrollbarGutter';

const root = document.documentElement;
const active: ScrollbarGutterHold[] = [];
const originalWidth = window.innerWidth;
function viewport(left = 0, right = 1009) {
  window.innerWidth = 1024;
  vi.spyOn(root, 'clientWidth', 'get').mockReturnValue(right - left);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(left, 0, right - left, 0),
  );
}
function acquire() {
  const hold = holdScrollbarGutter(document.body);
  active.push(hold);
  return hold;
}
afterEach(() => {
  for (const hold of active.splice(0)) {
    hold.release();
  }
  root.style.cssText = '';
  document.body.style.cssText = '';
  window.innerWidth = originalWidth;
  vi.restoreAllMocks();
});

describe('background viewport reservation', () => {
  it('applies a viewport-height background containing block only after pinning', () => {
    viewport();
    const hold = acquire();
    expect(root.style.cssText).toBe('');
    hold.settle();
    expect(root.style.scrollbarGutter).toBe('auto');
    expect(root.style.contain).toBe('layout');
    expect(root.style.right).toBe('15px');
    expect(root.style.height).toBe('100dvh');
    expect(root.style.marginLeft).toBe('0px');
    expect(root.style.marginRight).toBe('0px');
    expect(document.querySelector('[popover]')).toBeNull();
    hold.release();
    expect(root.style.cssText).toBe('');
  });

  it.each([
    [15, 1024, '15px', '0px'],
    [15, 1009, '15px', '15px'],
  ] as const)(
    'preserves physical edges %s..%s without guessing text direction',
    (left, right, start, end) => {
      viewport(left, right);
      const hold = acquire();
      hold.settle();
      expect(root.style.left).toBe(start);
      expect(root.style.right).toBe(end);
      expect(root.style.width).toBe('auto');
    },
  );

  it('keeps the reservation until the final independent owner releases', () => {
    viewport();
    const first = acquire();
    first.settle();
    const second = acquire();
    second.settle();
    first.release();
    expect(root.style.right).toBe('15px');
    first.release();
    second.release();
    expect(root.style.cssText).toBe('');
    first.settle();
    expect(root.style.cssText).toBe('');
  });

  it('restores existing root styles and leaves unrelated mutations alone', () => {
    viewport(15, 1009);
    root.style.cssText =
      'scrollbar-gutter: stable both-edges; contain: style; width: 90%; height: 80vh; min-width: 100px; max-width: 2000px; margin-left: 2px; margin-right: 3px;';
    const before = Object.fromEntries(
      Array.from(root.style).map(name => [
        name,
        root.style.getPropertyValue(name),
      ]),
    );
    const hold = acquire();
    hold.settle();
    expect(root.style.contain).toBe('style layout');
    root.style.setProperty('--unrelated', 'kept');
    hold.release();
    root.style.removeProperty('--unrelated');
    expect(
      Object.fromEntries(
        Array.from(root.style).map(name => [
          name,
          root.style.getPropertyValue(name),
        ]),
      ),
    ).toEqual(before);
    // jsdom drops !important on standard properties; the browser guard verifies
    // priorities in native CSSOM alongside the geometry they affect.
  });

  it('includes root borders outside the preserved fixed viewport', () => {
    viewport();
    root.style.border = '7px solid red';
    const hold = acquire();
    hold.settle();
    expect(root.style.left).toBe('-7px');
    expect(root.style.right).toBe('8px');
    expect(root.style.top).toBe('-7px');
    expect(root.style.height).toBe('calc(100dvh + 14px)');
    hold.release();
    expect(root.style.border).toBe('7px solid red');
    expect(root.style.position).toBe('');
  });

  it('does nothing for overlay scrollbars or a non-scrolling page', () => {
    viewport(0, 1024);
    const hold = acquire();
    hold.settle();
    expect(root.style.cssText).toBe('');
    hold.release();
    expect(root.style.cssText).toBe('');
  });

  it('does not treat an emulator with no geometry as a window-wide gutter', () => {
    vi.spyOn(root, 'clientWidth', 'get').mockReturnValue(0);
    const hold = acquire();
    hold.settle();
    hold.release();
    expect(root.style.cssText).toBe('');
  });
});
