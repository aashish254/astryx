// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MobileNavScrollbarGutter.test.tsx
 * @input Uses vitest, @testing-library/react, MobileNav, a stubbed viewport
 * @output Unit tests for the scrollbar gutter MobileNav reserves while open
 * @position Testing; guards MobileNav.tsx against the open-drawer page shift
 *
 * MobileNav clips the document to lock background scroll, which hides a
 * classic scrollbar and widens the layout viewport by its width — the page
 * behind the drawer jumps sideways. The clip has to be paired with padding
 * the root by that width, and publishing it for position: fixed chrome.
 *
 * SYNC: When MobileNav.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, beforeAll, afterEach} from 'vitest';
import {render, cleanup} from '@testing-library/react';
import {MobileNav} from './MobileNav';
import {SCROLLBAR_GUTTER_PROPERTY} from '../hooks/scrollbarGutter';

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
 * jsdom does no layout, so both halves of the measurement are stubbed: the
 * viewport (`innerWidth` vs `documentElement.clientWidth`) and the root's
 * own box, which widens by the scrollbar's width once the clip hides it.
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
  document.documentElement.getBoundingClientRect = () =>
    ({
      width:
        document.documentElement.style.overflow === 'clip'
          ? innerWidth
          : clientWidth,
    }) as DOMRect;
}

const rootPadding = () => document.documentElement.style.paddingRight;
const published = () =>
  document.documentElement.style.getPropertyValue(SCROLLBAR_GUTTER_PROPERTY);

describe('MobileNav scrollbar gutter', () => {
  afterEach(() => {
    cleanup();
    document.documentElement.style.cssText = '';
    // @ts-expect-error -- drop the viewport stub so jsdom's own value comes back
    delete document.documentElement.clientWidth;
    // @ts-expect-error -- restore the prototype's implementation
    delete document.documentElement.getBoundingClientRect;
  });

  it('pads the root by the hidden scrollbar while the drawer is open', () => {
    stubViewport(1024, 1009);

    const view = render(
      <MobileNav isOpen={true} onOpenChange={() => {}}>
        <span>Nav content</span>
      </MobileNav>,
    );

    expect(document.documentElement.style.overflow).toBe('clip');
    expect(rootPadding()).toBe('15px');
    expect(published()).toBe('15px');
    // The viewport itself is never held at its pre-lock width: that would
    // clip the drawer's scrim a scrollbar's width short of the window.
    expect(document.documentElement.style.scrollbarGutter).toBe('');

    view.unmount();

    expect(document.documentElement.style.overflow).toBe('');
    expect(rootPadding()).toBe('');
    expect(published()).toBe('');
  });

  it('gives the compensation back when the drawer closes', () => {
    stubViewport(1024, 1009);

    const view = render(
      <MobileNav isOpen={true} onOpenChange={() => {}}>
        <span>Nav content</span>
      </MobileNav>,
    );

    expect(rootPadding()).toBe('15px');

    view.rerender(
      <MobileNav isOpen={false} onOpenChange={() => {}}>
        <span>Nav content</span>
      </MobileNav>,
    );

    expect(rootPadding()).toBe('');
    expect(published()).toBe('');
  });

  it('holds nothing when the scrollbar is an overlay one', () => {
    stubViewport(1024, 1024);

    render(
      <MobileNav isOpen={true} onOpenChange={() => {}}>
        <span>Nav content</span>
      </MobileNav>,
    );

    expect(document.documentElement.style.overflow).toBe('clip');
    expect(rootPadding()).toBe('');
    expect(published()).toBe('');
  });
});
