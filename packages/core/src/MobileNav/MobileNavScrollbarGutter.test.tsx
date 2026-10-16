// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MobileNavScrollbarGutter.test.tsx
 * @input Uses vitest, @testing-library/react, MobileNav, a stubbed viewport
 * @output Unit tests for the scrollbar gutter MobileNav reserves through its visible exit
 * @position Testing; guards MobileNav.tsx against the open-drawer page shift
 *
 * MobileNav shares a document lock with other modal families. The background
 * keeps its layout budget, but not a root gutter that would clip modal paint.
 * The reservation stays held until the visible slide-out finishes.
 *
 * SYNC: When MobileNav.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, beforeAll, afterEach, vi} from 'vitest';
import {render, cleanup, act} from '@testing-library/react';
import {MobileNav} from './MobileNav';

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

/** jsdom does no layout, so both halves of the measurement are stubbed. */
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
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    right: clientWidth,
    width: clientWidth,
    top: 0,
    bottom: window.innerHeight,
    height: window.innerHeight,
  } as DOMRect);
}

const rootGutter = () => document.documentElement.style.width;

describe('MobileNav scrollbar gutter', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.documentElement.style.cssText = '';
    // @ts-expect-error -- drop the viewport stub so jsdom's own value comes back
    delete document.documentElement.clientWidth;
  });

  it('holds the gutter open while the drawer is open', () => {
    stubViewport(1024, 1009);

    const view = render(
      <MobileNav isOpen={true} onOpenChange={() => {}}>
        <span>Nav content</span>
      </MobileNav>,
    );

    expect(document.documentElement.style.overflow).toBe('clip');
    expect(rootGutter()).toBe('calc(100% - 15px)');

    view.unmount();

    expect(document.documentElement.style.overflow).toBe('');
    expect(rootGutter()).toBe('');
  });

  it('gives the gutter back only after the visible drawer closes', () => {
    vi.useFakeTimers();
    stubViewport(1024, 1009);

    const view = render(
      <MobileNav isOpen={true} onOpenChange={() => {}}>
        <span>Nav content</span>
      </MobileNav>,
    );

    expect(rootGutter()).toBe('calc(100% - 15px)');

    view.rerender(
      <MobileNav isOpen={false} onOpenChange={() => {}}>
        <span>Nav content</span>
      </MobileNav>,
    );

    expect(rootGutter()).toBe('calc(100% - 15px)');
    act(() => {
      vi.runAllTimers();
    });
    expect(rootGutter()).toBe('');
  });

  it('holds nothing when the scrollbar is an overlay one', () => {
    stubViewport(1024, 1024);

    render(
      <MobileNav isOpen={true} onOpenChange={() => {}}>
        <span>Nav content</span>
      </MobileNav>,
    );

    expect(document.documentElement.style.overflow).toBe('clip');
    expect(rootGutter()).toBe('');
    expect(document.documentElement.style.paddingRight).toBe('');
  });
});
