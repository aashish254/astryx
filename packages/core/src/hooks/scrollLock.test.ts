// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollLock.test.ts
 * @input Shared body/root locks, stubbed viewport geometry, and authored styles
 * @output Lifecycle regression coverage for mixed-family and out-of-order release
 * @position Private scroll resource tests; browser evidence proves page geometry
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {holdScrollLock} from './scrollLock';

const root = document.documentElement;
const releases: (() => void)[] = [];
function stub(classic = true) {
  vi.stubGlobal('innerWidth', 1024);
  vi.stubGlobal('innerHeight', 800);
  vi.spyOn(root, 'clientWidth', 'get').mockReturnValue(classic ? 1009 : 1024);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    right: classic ? 1009 : 1024,
    width: classic ? 1009 : 1024,
    top: 0,
    bottom: 800,
    height: 800,
  } as DOMRect);
  vi.spyOn(window, 'scrollY', 'get').mockReturnValue(120);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
}
function lock(strategy: 'body' | 'root') {
  const release = holdScrollLock(document, strategy);
  releases.push(release);
  return release;
}
afterEach(() => {
  releases.splice(0).forEach(release => release());
  root.style.cssText = '';
  document.body.style.cssText = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('shared document scroll lock', () => {
  it.each(['body', 'root'] as const)(
    'retains page geometry after the first %s owner closes',
    firstStrategy => {
      stub();
      const first = lock(firstStrategy);
      const second = lock(firstStrategy === 'body' ? 'root' : 'body');
      const bodyState = document.body.style.cssText;
      const rootState = root.style.cssText;
      first();
      first();
      expect(document.body.style.cssText).toBe(bodyState);
      expect(root.style.cssText).toBe(rootState);
      expect(root.style.contain).toBe('layout');
      expect(window.scrollTo).not.toHaveBeenCalled();
      second();
      expect(document.body.style.cssText).toBe('');
      expect(root.style.cssText).toBe('');
      expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith(0, 120);
    },
  );

  it('shares root-only locks and restores the author overflow', () => {
    stub();
    root.style.overflow = 'auto';
    const first = lock('root');
    const second = lock('root');
    first();
    expect(root.style.overflow).toBe('clip');
    second();
    expect(root.style.overflow).toBe('auto');
  });

  it('leaves hidden-scrollbar root locks on their existing clip-only path', () => {
    stub(false);
    const release = lock('root');
    expect(root.style.overflow).toBe('clip');
    expect(root.style.contain).toBe('');
    expect(document.body.style.cssText).toBe('');
    release();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('leaves hidden-scrollbar body locks on their existing pin-only path', () => {
    stub(false);
    const release = lock('body');
    expect(document.body.style.position).toBe('fixed');
    expect(root.style.cssText).toBe('');
    release();
  });

  it('restores every author-owned declaration after a mixed stack', () => {
    stub();
    root.style.cssText =
      'overflow:auto; scrollbar-gutter:stable both-edges; contain:style;';
    document.body.style.cssText =
      'position:relative; top:3px; left:4px; right:5px; overflow:auto;';
    const before = {
      root: root.style.cssText,
      body: document.body.style.cssText,
    };
    const first = lock('body');
    const second = lock('root');
    second();
    first();
    expect(root.style.cssText).toBe(before.root);
    expect(document.body.style.cssText).toBe(before.body);
  });
});
