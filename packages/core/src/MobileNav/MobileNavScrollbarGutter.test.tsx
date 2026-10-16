// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MobileNavScrollbarGutter.test.tsx
 * @input Uses vitest, @testing-library/react, MobileNav, a stubbed viewport
 * @output Unit tests for the scroll lock MobileNav holds while open and
 *   through its slide-out
 * @position Testing; guards MobileNav.tsx against the open-drawer page shift
 *
 * MobileNav locks background scroll through the shared useScrollLock, which
 * hides a classic scrollbar and lets the layout viewport take its width — so
 * the drawer reaches the window edge — while insetting the pinned body by the
 * same width so the page behind does not jump sideways. The lock has to last
 * through the slide-out: the drawer exits against the geometry it opened with.
 *
 * SYNC: When MobileNav.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, beforeAll, afterEach, vi} from 'vitest';
import {render, cleanup, act} from '@testing-library/react';
import {MobileNav} from './MobileNav';
import {SCROLL_LOCK_GUTTER_PROPERTY} from '../hooks/useScrollLock';
import {stubMatchMedia} from '../__tests__/stubMatchMedia';

beforeAll(() => {
  // jsdom doesn't implement showModal/close on <dialog>
  HTMLDialogElement.prototype.showModal =
    HTMLDialogElement.prototype.showModal ||
    function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  HTMLDialogElement.prototype.close =
    HTMLDialogElement.prototype.close ||
    function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
});

/**
 * jsdom does no layout, so the viewport is stubbed in two halves: the
 * `innerWidth`/`clientWidth` pair that says a space-taking scrollbar is
 * rendered, and the fixed probe the lock measures the layout viewport with,
 * which reads the scrollbar's width back once the body is pinned.
 */
function stubViewport(innerWidth: number, clientWidth: number) {
  Object.defineProperty(window, 'innerWidth', {
    value: innerWidth,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(document.documentElement, 'clientWidth', {
    value: clientWidth,
    configurable: true,
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: Element) {
      const width =
        document.body.style.position === 'fixed' ? innerWidth : clientWidth;
      return {width} as DOMRect;
    },
  );
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
}

const gutterProperty = () =>
  document.documentElement.style.getPropertyValue(SCROLL_LOCK_GUTTER_PROPERTY);

describe('MobileNav scroll lock', () => {
  afterEach(() => {
    cleanup();
    document.body.style.cssText = '';
    document.documentElement.style.cssText = '';
    // @ts-expect-error -- drop the viewport stub so jsdom's own value comes back
    delete document.documentElement.clientWidth;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('pins the body, inset by the scrollbar width, while the drawer is open', () => {
    stubViewport(1024, 1009);

    const view = render(
      <MobileNav isOpen={true} onOpenChange={() => {}}>
        <span>Nav content</span>
      </MobileNav>,
    );

    expect(document.body.style.position).toBe('fixed');
    expect(document.body.style.right).toBe('15px');
    expect(gutterProperty()).toBe('15px');
    // The lock owns the gutter; nothing reserves it on the root.
    expect(document.documentElement.style.scrollbarGutter).toBe('');
    expect(document.documentElement.style.overflow).toBe('');

    view.unmount();

    expect(document.body.style.position).toBe('');
    expect(document.body.style.right).toBe('');
    expect(gutterProperty()).toBe('');
  });

  it('keeps the lock through the slide-out and releases it once the dialog has closed', () => {
    stubViewport(1024, 1009);
    stubMatchMedia({reduceMotion: false});
    vi.useFakeTimers();
    try {
      const view = render(
        <MobileNav isOpen={true} onOpenChange={() => {}}>
          <span>Nav content</span>
        </MobileNav>,
      );

      expect(document.body.style.position).toBe('fixed');

      act(() => {
        view.rerender(
          <MobileNav isOpen={false} onOpenChange={() => {}}>
            <span>Nav content</span>
          </MobileNav>,
        );
      });

      // Still sliding out: the scrollbar coming back now would move the
      // drawer mid-exit.
      expect(document.body.style.position).toBe('fixed');
      expect(gutterProperty()).toBe('15px');

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(document.body.style.position).toBe('');
      expect(document.body.style.right).toBe('');
      expect(gutterProperty()).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('holds nothing when the scrollbar is an overlay one', () => {
    stubViewport(1024, 1024);

    render(
      <MobileNav isOpen={true} onOpenChange={() => {}}>
        <span>Nav content</span>
      </MobileNav>,
    );

    expect(document.body.style.position).toBe('fixed');
    expect(document.body.style.right).toBe('0px');
    expect(gutterProperty()).toBe('');
    expect(document.documentElement.style.scrollbarGutter).toBe('');
  });
});
