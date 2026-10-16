// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file documentScrollClip.test.ts
 * @input Independently acquired document-clipping and body-pinning holds
 * @output Regression coverage for mixed modal stacks and style restoration
 * @position Tests shared ownership; browser cases prove background geometry
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {holdDocumentScrollClip} from './documentScrollClip';
import {holdBodyScroll} from './bodyScrollLock';

const releases: (() => void)[] = [];
const originalWidth = window.innerWidth;
function acquire() {
  const release = holdDocumentScrollClip(document);
  releases.push(release);
  return release;
}
afterEach(() => {
  for (const release of releases.splice(0)) {
    release();
  }
  document.documentElement.style.cssText = '';
  document.body.style.cssText = '';
  window.innerWidth = originalWidth;
  vi.restoreAllMocks();
});

describe('document scroll clipping', () => {
  it('keeps clipping until the last navigation closes in either order', () => {
    for (const order of [
      [0, 1],
      [1, 0],
    ]) {
      const close = [acquire(), acquire()];
      close[order[0]]();
      expect(document.documentElement.style.overflow).toBe('clip');
      close[order[1]]();
      expect(document.documentElement.style.overflow).toBe('');
    }
  });

  it('restores the original overflow and releases idempotently', () => {
    document.documentElement.style.overflow = 'auto';
    const close = acquire();
    close();
    close();
    expect(document.documentElement.style.overflow).toBe('auto');
  });

  it('joins an existing body pin when clientWidth already includes the hidden scrollbar', () => {
    const root = document.documentElement;
    window.innerWidth = 1024;
    const clientWidth = vi
      .spyOn(root, 'clientWidth', 'get')
      .mockReturnValue(1009);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 1009, 0),
    );
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const body = holdBodyScroll(document);
    releases.push(body);
    clientWidth.mockReturnValue(1024);
    const nav = acquire();
    body();
    expect(document.body.style.position).toBe('fixed');
    expect(root.style.right).toBe('15px');
    nav();
    expect(document.body.style.position).toBe('');
    expect(root.style.cssText).toBe('');
  });

  it.each([true, false])(
    'shares the body pin in mixed stacks, nav closes first: %s',
    navFirst => {
      const root = document.documentElement;
      window.innerWidth = 1024;
      vi.spyOn(root, 'clientWidth', 'get').mockReturnValue(1009);
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(0, 0, 1009, 0),
      );
      vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
      const nav = acquire();
      const body = holdBodyScroll(document);
      releases.push(body);
      (navFirst ? nav : body)();
      expect(document.body.style.position).toBe('fixed');
      expect(root.style.right).toBe('15px');
      (navFirst ? body : nav)();
      expect(document.body.style.position).toBe('');
      expect(root.style.cssText).toBe('');
      expect(window.scrollTo).toHaveBeenCalledTimes(1);
    },
  );
});
