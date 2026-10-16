// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollbarGutter.test.ts
 * @input Uses vitest and a stubbed viewport + element box (jsdom does no layout)
 * @output Unit tests for holdScrollbarGutter
 * @position Testing; validates scrollbarGutter.ts implementation
 *
 * SYNC: When scrollbarGutter.ts changes, update tests to match new behavior
 */

import {afterEach, describe, expect, it} from 'vitest';
import {
  holdScrollbarGutter,
  SCROLLBAR_GUTTER_PROPERTY,
} from './scrollbarGutter';

/**
 * jsdom does no layout, so both halves of the measurement are stubbed: the
 * viewport (`innerWidth` vs `documentElement.clientWidth`) and the element's
 * own box, which `widths` reads from and a test flips to simulate the lock
 * widening it.
 */
function stub({
  innerWidth,
  clientWidth,
  widths,
}: {
  innerWidth: number;
  clientWidth: number;
  widths?: () => number;
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
  if (widths) {
    document.body.getBoundingClientRect = () => ({width: widths()}) as DOMRect;
  }
}

const rootGutter = () => document.documentElement.style.scrollbarGutter;
const published = () =>
  document.documentElement.style.getPropertyValue(SCROLLBAR_GUTTER_PROPERTY);

describe('holdScrollbarGutter', () => {
  afterEach(() => {
    document.body.style.cssText = '';
    document.documentElement.style.cssText = '';
    // @ts-expect-error -- drop the stubs so jsdom's own values come back
    delete document.documentElement.clientWidth;
    // @ts-expect-error -- restore the prototype's implementation
    delete document.body.getBoundingClientRect;
  });

  it('pads the width the element grew by and publishes it while held', () => {
    // A 1024px window over a 1009px layout viewport = a 15px classic
    // scrollbar. The lock hides it, the viewport grows, and the element
    // (spanning the viewport) widens by the same 15px.
    let width = 1009;
    stub({innerWidth: 1024, clientWidth: 1009, widths: () => width});

    const hold = holdScrollbarGutter(document.body);
    width = 1024;
    hold.settle();

    expect(document.body.style.paddingRight).toBe('15px');
    expect(published()).toBe('15px');

    hold.release();

    expect(document.body.style.paddingRight).toBe('');
    expect(published()).toBe('');
  });

  it('never reserves the gutter on the viewport', () => {
    // A reserved viewport gutter keeps the viewport at its pre-lock width and
    // the browser clips the top layer at the gutter's inner edge, so overlays
    // stop a scrollbar's width short of the window. The viewport must grow.
    let width = 1009;
    stub({innerWidth: 1024, clientWidth: 1009, widths: () => width});

    const hold = holdScrollbarGutter(document.body);
    width = 1024;
    hold.settle();

    expect(rootGutter()).toBe('');

    hold.release();

    expect(rootGutter()).toBe('');
  });

  it('leaves an overlay scrollbar alone — there is no width to compensate', () => {
    stub({innerWidth: 1024, clientWidth: 1024});

    const hold = holdScrollbarGutter(document.body);
    hold.settle();

    expect(document.body.style.paddingRight).toBe('');
    expect(published()).toBe('');

    hold.release();
  });

  it('does nothing when the lock left the element the same width', () => {
    // A page that reserves the gutter itself (`scrollbar-gutter: stable`)
    // never grows when its scrollbar hides, so there is nothing to pad and
    // nothing has moved for fixed chrome to compensate.
    stub({innerWidth: 1024, clientWidth: 1009, widths: () => 1009});

    const hold = holdScrollbarGutter(document.body);
    hold.settle();

    expect(document.body.style.paddingRight).toBe('');
    expect(published()).toBe('');

    hold.release();
  });

  it("adds to the page's own padding instead of replacing it", () => {
    let width = 1009;
    stub({innerWidth: 1024, clientWidth: 1009, widths: () => width});
    document.body.style.paddingRight = '24px';

    const hold = holdScrollbarGutter(document.body);
    width = 1024;
    hold.settle();

    expect(document.body.style.paddingRight).toBe('39px');
    // The property carries the growth alone, not the page's own padding.
    expect(published()).toBe('15px');

    hold.release();

    expect(document.body.style.paddingRight).toBe('24px');
  });

  it('settles once, however many times it is called', () => {
    let width = 1009;
    stub({innerWidth: 1024, clientWidth: 1009, widths: () => width});

    const hold = holdScrollbarGutter(document.body);
    width = 1024;
    hold.settle();
    hold.settle();
    hold.settle();

    expect(document.body.style.paddingRight).toBe('15px');
    expect(published()).toBe('15px');

    hold.release();
  });

  it('releases once, however many times it is called', () => {
    let width = 1009;
    stub({innerWidth: 1024, clientWidth: 1009, widths: () => width});

    const hold = holdScrollbarGutter(document.body);
    width = 1024;
    hold.settle();
    hold.release();

    // A second release must not clobber a value someone else set since.
    document.body.style.paddingRight = '8px';
    hold.release();

    expect(document.body.style.paddingRight).toBe('8px');
  });

  it('does nothing where there is no layout to measure', () => {
    stub({innerWidth: 1024, clientWidth: 0});

    const hold = holdScrollbarGutter(document.body);
    hold.settle();

    expect(rootGutter()).toBe('');
    expect(document.body.style.paddingRight).toBe('');
    expect(published()).toBe('');

    hold.release();
  });
});
