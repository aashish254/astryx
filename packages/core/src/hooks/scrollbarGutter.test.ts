// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollbarGutter.test.ts
 * @input Stubbed pre-lock viewport geometry and authored root declarations
 * @output Unit coverage for background-only reservation and exact cleanup
 * @position Geometry utility tests; paint and hit testing need the browser guard
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {holdScrollbarGutter} from './scrollbarGutter';

const root = document.documentElement;
const releases: (() => void)[] = [];
function stub({left = 0, right = 1009, clientWidth = 1009} = {}) {
  vi.stubGlobal('innerWidth', 1024);
  vi.stubGlobal('innerHeight', 800);
  vi.spyOn(root, 'clientWidth', 'get').mockReturnValue(clientWidth);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left,
    right,
    width: right - left,
    top: 0,
    bottom: 800,
    height: 800,
  } as DOMRect);
}
function hold() {
  const result = holdScrollbarGutter(document.body);
  releases.push(result.release);
  return result;
}
afterEach(() => {
  releases.splice(0).forEach(release => release());
  root.style.cssText = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('background scrollbar reservation', () => {
  it('keeps the old fixed containing block without a root paint gutter', () => {
    stub();
    const result = hold();
    expect(result.requiresBodyPin).toBe(true);
    expect(root.style.cssText).toBe('');
    result.settle();
    expect(root.style.scrollbarGutter).toBe('auto');
    expect(root.style.contain).toBe('layout');
    expect(root.style.width).toBe('calc(100% - 15px)');
    expect(root.style.marginLeft).toBe('0px');
    expect(root.style.marginRight).toBe('15px');
    expect(root.style.height).toBe('calc(100dvh - 0px)');
    result.release();
    expect(root.style.cssText).toBe('');
  });

  it.each([
    {left: 0, right: 1009},
    {left: 15, right: 1024},
    {left: 15, right: 1009},
  ])(
    'reserves physical edges %j without reading the overlay direction',
    edges => {
      stub(edges);
      root.style.direction = 'rtl';
      const result = hold();
      result.settle();
      expect(root.style.marginLeft).toBe(`${edges.left}px`);
      expect(root.style.marginRight).toBe(`${1024 - edges.right}px`);
      expect(root.style.width).toBe(
        `calc(100% - ${1024 - edges.right + edges.left}px)`,
      );
    },
  );

  it('preserves the author declaration and all containment tokens on release', () => {
    stub({left: 15, right: 1009});
    root.style.cssText =
      'scrollbar-gutter: stable both-edges; contain: style; width: 95%; height: 100%; min-height: 100%; margin-left: 2px; margin-right: 3px; box-sizing: content-box;';
    const before = Object.fromEntries(
      Array.from(root.style).map(property => [
        property,
        [
          root.style.getPropertyValue(property),
          root.style.getPropertyPriority(property),
        ],
      ]),
    );
    const result = hold();
    result.settle();
    expect(root.style.contain).toBe('style layout');
    result.release();
    result.release();
    expect(
      Object.fromEntries(
        Array.from(root.style).map(property => [
          property,
          [
            root.style.getPropertyValue(property),
            root.style.getPropertyPriority(property),
          ],
        ]),
      ),
    ).toEqual(before);
  });

  it('settles once and never reacquires after release', () => {
    stub();
    const result = hold();
    result.settle();
    const once = root.style.cssText;
    result.settle();
    expect(root.style.cssText).toBe(once);
    result.release();
    result.settle();
    expect(root.style.cssText).toBe('');
  });

  it.each([0, 1024])(
    'does not touch a no-layout or hidden-scrollbar page (%s)',
    clientWidth => {
      stub({clientWidth, right: 1024});
      const result = hold();
      expect(result.requiresBodyPin).toBe(false);
      result.settle();
      expect(root.style.cssText).toBe('');
    },
  );
});
