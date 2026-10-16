// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MobileNavScrollbarGutter.test.tsx
 * @input Uses vitest, @testing-library/react, MobileNav, a stubbed viewport
 * @output Unit tests for MobileNav's shared background viewport through its exit
 * @position Testing; guards MobileNav.tsx against the open-drawer page shift
 *
 * MobileNav clips the document to lock background scroll, which hides a
 * classic scrollbar and widens the layout viewport by its width — the page
 * behind the drawer jumps sideways. The clip has to be paired with holding
 * that space, without a native gutter clipping modal paint.
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
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, clientWidth, 0),
  );
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  Object.defineProperty(window, 'innerWidth', {
    value: innerWidth,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(document.documentElement, 'clientWidth', {
    value: clientWidth,
    configurable: true,
  });
}

const rootGutter = () => document.documentElement.style.right;

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
    expect(rootGutter()).toBe('15px');

    view.unmount();

    expect(document.documentElement.style.overflow).toBe('');
    expect(rootGutter()).toBe('');
  });

  it('gives the gutter back after the visible drawer exit', () => {
    vi.useFakeTimers();
    stubViewport(1024, 1009);

    const view = render(
      <MobileNav isOpen={true} onOpenChange={() => {}}>
        <span>Nav content</span>
      </MobileNav>,
    );

    expect(rootGutter()).toBe('15px');

    view.rerender(
      <MobileNav isOpen={false} onOpenChange={() => {}}>
        <span>Nav content</span>
      </MobileNav>,
    );

    expect(rootGutter()).toBe('15px');
    act(() => {
      vi.runAllTimers();
    });
    expect(rootGutter()).toBe('');
    vi.useRealTimers();
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
