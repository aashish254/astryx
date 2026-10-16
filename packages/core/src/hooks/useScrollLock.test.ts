// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useScrollLock.test.ts
 * @input Uses vitest, @testing-library/react, useScrollLock hook, and a
 *   stubbed viewport (jsdom does no layout)
 * @output Unit tests for single and concurrent useScrollLock instances, and
 *   for the body inset and published gutter under a classic scrollbar
 * @position Testing; validates useScrollLock.ts implementation
 *
 * SYNC: When useScrollLock.ts changes, update tests to match new behavior
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {cleanup, renderHook} from '@testing-library/react';
import {SCROLL_LOCK_GUTTER_PROPERTY, useScrollLock} from './useScrollLock';
import {scrollLockGutter} from './scrollLockGutter.stylex';

describe('useScrollLock', () => {
  afterEach(() => {
    cleanup();
    document.body.style.cssText = '';
    document.documentElement.style.cssText = '';
    // @ts-expect-error -- drop the viewport stub so jsdom's own value comes back
    delete document.documentElement.clientWidth;
    vi.restoreAllMocks();
  });

  it('restores body styles and scroll position after a single lock is released', () => {
    document.body.style.overflow = 'auto';
    document.body.style.position = 'relative';

    vi.spyOn(window, 'scrollX', 'get').mockReturnValue(120);
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(480);
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    const lock = renderHook(() => useScrollLock(true));

    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.style.position).toBe('fixed');

    lock.unmount();

    expect(document.body.style.overflow).toBe('auto');
    expect(document.body.style.position).toBe('relative');
    expect(window.scrollTo).toHaveBeenCalledWith(120, 480);
  });

  it('leaves the body alone and never scrolls when it is not locked', () => {
    document.body.style.overflow = 'auto';
    document.body.style.position = 'relative';
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    const lock = renderHook(() => useScrollLock(false));

    expect(document.body.style.overflow).toBe('auto');
    expect(document.body.style.position).toBe('relative');
    expect(document.body.style.top).toBe('');
    expect(document.body.style.left).toBe('');
    expect(document.body.style.right).toBe('');

    lock.unmount();

    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('pins the body edge to edge, offset upward by the current scroll position', () => {
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(250);
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    renderHook(() => useScrollLock(true));

    expect(document.body.style.top).toBe('-250px');
    expect(document.body.style.left).toBe('0px');
    expect(document.body.style.right).toBe('0px');
  });

  it('puts back pre-existing top/left/right inline styles instead of blanking them', () => {
    document.body.style.top = '10px';
    document.body.style.left = '5px';
    document.body.style.right = '3px';
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    const lock = renderHook(({locked}) => useScrollLock(locked), {
      initialProps: {locked: true},
    });
    expect(document.body.style.position).toBe('fixed');

    lock.rerender({locked: false});

    expect(document.body.style.top).toBe('10px');
    expect(document.body.style.left).toBe('5px');
    expect(document.body.style.right).toBe('3px');
  });

  it('scrolls back to the offset captured at lock time, not the offset at release', () => {
    const scrollX = vi.spyOn(window, 'scrollX', 'get').mockReturnValue(30);
    const scrollY = vi.spyOn(window, 'scrollY', 'get').mockReturnValue(250);
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    const lock = renderHook(({locked}) => useScrollLock(locked), {
      initialProps: {locked: true},
    });

    // Pinning the body drops the document to the top in a real browser; the
    // hook must restore from the value it saved, not from the current one.
    scrollX.mockReturnValue(0);
    scrollY.mockReturnValue(0);
    lock.rerender({locked: false});

    expect(window.scrollTo).toHaveBeenCalledTimes(1);
    expect(window.scrollTo).toHaveBeenCalledWith(30, 250);
  });

  it('keeps one lock in place across rerenders with the same value', () => {
    vi.spyOn(window, 'scrollY', 'get').mockReturnValue(250);
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    const lock = renderHook(({locked}) => useScrollLock(locked), {
      initialProps: {locked: true},
    });

    lock.rerender({locked: true});
    lock.rerender({locked: true});

    // Re-running the effect would tear the lock down and back up, restoring
    // scroll each time.
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(document.body.style.position).toBe('fixed');
    expect(document.body.style.top).toBe('-250px');
  });

  it('takes a fresh scroll snapshot when locked a second time', () => {
    const scrollY = vi.spyOn(window, 'scrollY', 'get').mockReturnValue(100);
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    const lock = renderHook(({locked}) => useScrollLock(locked), {
      initialProps: {locked: true},
    });
    expect(document.body.style.top).toBe('-100px');

    lock.rerender({locked: false});
    scrollY.mockReturnValue(300);
    lock.rerender({locked: true});

    expect(document.body.style.top).toBe('-300px');

    lock.rerender({locked: false});
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 300);
  });

  it('stays locked while a second overlay is still open, even if the first closes out of order', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    const first = renderHook(() => useScrollLock(true));
    const second = renderHook(() => useScrollLock(true));

    first.unmount();

    expect(document.body.style.position).toBe('fixed');
    expect(document.body.style.overflow).toBe('hidden');

    second.unmount();
  });

  it('fully restores the body once every overlay has closed, regardless of close order', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    const first = renderHook(() => useScrollLock(true));
    const second = renderHook(() => useScrollLock(true));

    first.unmount();
    second.unmount();

    expect(document.body.style.position).toBe('');
    expect(document.body.style.overflow).toBe('');
    expect(document.body.style.top).toBe('');
    expect(document.body.style.left).toBe('');
    expect(document.body.style.right).toBe('');
  });

  describe('a classic (space-taking) scrollbar', () => {
    // jsdom does no layout, so the viewport is stubbed in two halves: the
    // `innerWidth`/`clientWidth` pair that says a space-taking scrollbar is
    // rendered, and the fixed probe the hook measures the layout viewport
    // with, which reads the scrollbar's width back once the body is pinned.
    function stubViewport({
      innerWidth,
      clientWidth,
      viewportWhilePinned,
    }: {
      innerWidth: number;
      clientWidth: number;
      viewportWhilePinned: number;
    }) {
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
            document.body.style.position === 'fixed'
              ? viewportWhilePinned
              : clientWidth;
          return {width} as DOMRect;
        },
      );
      vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    }

    const gutterProperty = () =>
      document.documentElement.style.getPropertyValue(
        SCROLL_LOCK_GUTTER_PROPERTY,
      );

    it('insets the pinned body by the width the viewport gained, and publishes it', () => {
      // A 1024px window over a 1009px layout viewport = a 15px classic
      // scrollbar. Pinning the body hides it and the viewport grows to 1024;
      // the body must keep the 1009px box it had.
      stubViewport({
        innerWidth: 1024,
        clientWidth: 1009,
        viewportWhilePinned: 1024,
      });

      const lock = renderHook(() => useScrollLock(true));

      expect(document.body.style.left).toBe('0px');
      expect(document.body.style.right).toBe('15px');
      expect(gutterProperty()).toBe('15px');

      lock.unmount();

      expect(document.body.style.right).toBe('');
      expect(gutterProperty()).toBe('');
    });

    it('measures what the viewport actually gained rather than assuming the scrollbar width', () => {
      // A page that reserves the gutter itself (`scrollbar-gutter: stable` in
      // its own stylesheet): the scrollbar is rendered, so the window is 15px
      // wider than the layout viewport, but hiding it changes nothing.
      stubViewport({
        innerWidth: 1024,
        clientWidth: 1009,
        viewportWhilePinned: 1009,
      });

      const lock = renderHook(() => useScrollLock(true));

      expect(document.body.style.right).toBe('0px');
      expect(gutterProperty()).toBe('');

      lock.unmount();
    });

    it('leaves the page alone when the scrollbar is an overlay one', () => {
      stubViewport({
        innerWidth: 1024,
        clientWidth: 1024,
        viewportWhilePinned: 1024,
      });

      const lock = renderHook(() => useScrollLock(true));

      expect(document.body.style.right).toBe('0px');
      expect(gutterProperty()).toBe('');
      // Nothing to measure, so no probe was laid out.
      expect(Element.prototype.getBoundingClientRect).not.toHaveBeenCalled();

      lock.unmount();
    });

    it('never touches scrollbar-gutter: a reserved gutter is outside the viewport the overlays are sized against', () => {
      stubViewport({
        innerWidth: 1024,
        clientWidth: 1009,
        viewportWhilePinned: 1024,
      });

      const lock = renderHook(() => useScrollLock(true));

      expect(document.documentElement.style.scrollbarGutter).toBe('');

      lock.unmount();
    });

    it('measures for the outermost overlay only, and gives the inset back once', () => {
      stubViewport({
        innerWidth: 1024,
        clientWidth: 1009,
        viewportWhilePinned: 1024,
      });

      const first = renderHook(() => useScrollLock(true));
      const second = renderHook(() => useScrollLock(true));

      expect(document.body.style.right).toBe('15px');
      expect(gutterProperty()).toBe('15px');

      first.unmount();

      expect(document.body.style.right).toBe('15px');
      expect(gutterProperty()).toBe('15px');

      second.unmount();

      expect(document.body.style.right).toBe('');
      expect(gutterProperty()).toBe('');
    });

    it('is the same property the StyleX constant reads', () => {
      expect(scrollLockGutter.width).toBe(
        `var(${SCROLL_LOCK_GUTTER_PROPERTY}, 0px)`,
      );
    });
  });
});
