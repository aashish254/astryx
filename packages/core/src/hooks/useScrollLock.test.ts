// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useScrollLock.test.ts
 * @input Uses vitest, @testing-library/react, useScrollLock hook
 * @output Unit tests for single and concurrent useScrollLock instances
 * @position Testing; validates useScrollLock.ts implementation
 *
 * SYNC: When useScrollLock.ts changes, update tests to match new behavior
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {cleanup, renderHook} from '@testing-library/react';
import {useScrollLock} from './useScrollLock';
import {SCROLLBAR_GUTTER_PROPERTY} from './scrollbarGutter';

describe('useScrollLock', () => {
  afterEach(() => {
    cleanup();
    document.body.style.cssText = '';
    document.documentElement.style.cssText = '';
    // @ts-expect-error -- drop the viewport stub so jsdom's own value comes back
    delete document.documentElement.clientWidth;
    // @ts-expect-error -- restore the prototype's implementation
    delete document.body.getBoundingClientRect;
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

  /**
   * jsdom does no layout, so both halves of the measurement are stubbed: the
   * viewport (a 1024px window over a 1009px layout viewport = a 15px classic
   * scrollbar) and the body's own box, which grows by those 15px once the
   * pinned body spans the viewport the hidden scrollbar gave back.
   */
  function stubClassicScrollbar() {
    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(document.documentElement, 'clientWidth', {
      value: 1009,
      configurable: true,
    });
    document.body.getBoundingClientRect = () =>
      ({
        width: document.body.style.position === 'fixed' ? 1024 : 1009,
      }) as DOMRect;
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  }

  const published = () =>
    document.documentElement.style.getPropertyValue(SCROLLBAR_GUTTER_PROPERTY);

  it('holds the page still across the scrollbar it hides', () => {
    stubClassicScrollbar();

    const lock = renderHook(() => useScrollLock(true));

    // The body is padded by the width it grew, and the width is published
    // for position: fixed chrome, which padding cannot hold.
    expect(document.body.style.paddingRight).toBe('15px');
    expect(published()).toBe('15px');

    lock.unmount();

    expect(document.body.style.paddingRight).toBe('');
    expect(published()).toBe('');
  });

  it('lets the viewport keep the full window width, so overlays reach its edge', () => {
    stubClassicScrollbar();

    const lock = renderHook(() => useScrollLock(true));

    // Reserving the gutter on the viewport would clip the modal surface and
    // its ::backdrop a scrollbar's width short of the window.
    expect(document.documentElement.style.scrollbarGutter).toBe('');

    lock.unmount();
  });

  it('leaves the page alone when the scrollbar is an overlay one', () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(document.documentElement, 'clientWidth', {
      value: 1024,
      configurable: true,
    });
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    const lock = renderHook(() => useScrollLock(true));

    expect(document.documentElement.style.scrollbarGutter).toBe('');
    expect(document.body.style.paddingRight).toBe('');
    expect(published()).toBe('');

    lock.unmount();
  });

  it('compensates for the outermost overlay only, and gives it back once', () => {
    stubClassicScrollbar();

    const first = renderHook(() => useScrollLock(true));
    const second = renderHook(() => useScrollLock(true));

    expect(document.body.style.paddingRight).toBe('15px');
    expect(published()).toBe('15px');

    first.unmount();

    expect(document.body.style.paddingRight).toBe('15px');
    expect(published()).toBe('15px');

    second.unmount();

    expect(document.body.style.paddingRight).toBe('');
    expect(published()).toBe('');
  });
});
