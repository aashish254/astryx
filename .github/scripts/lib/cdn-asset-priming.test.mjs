// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it, vi} from 'vitest';
import {pageAssetUrls, primeCdnAssets} from './cdn-asset-priming.mjs';

const PAGE = `
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@astryxdesign/core@0.7.2/src/reset.css" />
  <link rel="stylesheet" href="/local.css" />
  <script src="https://esm.sh/@astryxdesign/core@0.7.2" type="module"></script>
  <script type="importmap">
    {"imports": {
      "react": "https://esm.sh/react@19.2.0",
      "core": "https://esm.sh/@astryxdesign/core@0.7.2?external=react,react-dom",
      "local": "./local.js"
    }}
  </script>
  <p>Docs: https://astryx.dev/docs/button</p>
`;

describe('pageAssetUrls', () => {
  it('collects what the page fetches, in document order', () => {
    expect(pageAssetUrls(PAGE)).toEqual([
      'https://cdn.jsdelivr.net/npm/@astryxdesign/core@0.7.2/src/reset.css',
      'https://esm.sh/@astryxdesign/core@0.7.2',
      'https://esm.sh/react@19.2.0',
      'https://esm.sh/@astryxdesign/core@0.7.2?external=react,react-dom',
    ]);
  });

  it('leaves out preconnect hints, relative paths and links in prose', () => {
    const urls = pageAssetUrls(PAGE);
    expect(urls).not.toContain('https://fonts.googleapis.com');
    expect(urls).not.toContain('https://fonts.gstatic.com');
    expect(urls).not.toContain('https://astryx.dev/docs/button');
    expect(urls).not.toContain('./local.js');
  });

  it('names a URL once when the page asks for it twice', () => {
    const resetCss = 'https://cdn.jsdelivr.net/npm/@astryxdesign/core@0.7.2/src/reset.css';
    const twice = `${PAGE}\n<link rel="stylesheet" href="${resetCss}" />`;
    expect(pageAssetUrls(twice).filter(u => u === resetCss)).toHaveLength(1);
    expect(pageAssetUrls(twice)).toHaveLength(pageAssetUrls(PAGE).length);
  });

  it('survives an import map that is not JSON', () => {
    const broken = PAGE.replace(/"imports": \{[\s\S]*?\}\}/, 'not json');
    expect(() => pageAssetUrls(broken)).not.toThrow();
    expect(pageAssetUrls(broken)).toContain(
      'https://cdn.jsdelivr.net/npm/@astryxdesign/core@0.7.2/src/reset.css',
    );
  });
});

/**
 * A fetch that answers from a script, one entry per call, and keeps answering
 * with its last entry afterwards. `calls` records which URL each answer went to.
 */
function scriptedFetch(results) {
  const calls = [];
  return {
    calls,
    fetchImpl: async url => {
      calls.push(url);
      const result = results[Math.min(calls.length - 1, results.length - 1)];
      if (result instanceof Error) throw result;
      return {status: result};
    },
  };
}

describe('primeCdnAssets', () => {
  it('returns every asset as ready when the CDN already serves it', async () => {
    const {calls, fetchImpl} = scriptedFetch([200]);
    const sleep = vi.fn();
    const res = await primeCdnAssets(['a.css', 'b.css'], {
      fetchImpl,
      sleep,
      now: () => 0,
      deadlineMs: 1_000,
    });
    expect(res).toEqual({ready: ['a.css', 'b.css'], cold: []});
    expect(calls).toEqual(['a.css', 'b.css']);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries only what did not serve, and reports it once it does', async () => {
    const {calls, fetchImpl} = scriptedFetch([404, 200, 200]);
    const sleep = vi.fn();
    const res = await primeCdnAssets(['building.css', 'served.css'], {
      fetchImpl,
      sleep,
      now: () => 0,
      deadlineMs: 1_000,
    });
    expect(calls).toEqual(['building.css', 'served.css', 'building.css']);
    expect(res.cold).toEqual([]);
    expect(res.ready.sort()).toEqual(['building.css', 'served.css']);
    expect(sleep).toHaveBeenCalledOnce();
  });

  it('reports an asset the CDN never serves, with the answer it gave', async () => {
    const {calls, fetchImpl} = scriptedFetch([404]);
    const res = await primeCdnAssets(['still-building.css'], {
      fetchImpl,
      sleep: async () => {},
      now: () => 0,
      deadlineMs: 0,
    });
    expect(calls).toEqual(['still-building.css']);
    expect(res.ready).toEqual([]);
    expect(res.cold).toEqual([
      {url: 'still-building.css', reason: 'HTTP 404'},
    ]);
  });

  it('names a request that fails outright rather than answering', async () => {
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    const {fetchImpl} = scriptedFetch([timeout]);
    const res = await primeCdnAssets(['hanging.css'], {
      fetchImpl,
      sleep: async () => {},
      now: () => 0,
      deadlineMs: 0,
    });
    expect(res.cold).toEqual([{url: 'hanging.css', reason: 'TimeoutError'}]);
  });

  it('treats a redirect as served and a server error as not', async () => {
    const {fetchImpl} = scriptedFetch([302, 500]);
    const res = await primeCdnAssets(['redirected.js', 'broken.js'], {
      fetchImpl,
      sleep: async () => {},
      now: () => 0,
      deadlineMs: 0,
    });
    expect(res.ready).toEqual(['redirected.js']);
    expect(res.cold).toEqual([{url: 'broken.js', reason: 'HTTP 500'}]);
  });

  it('stops retrying once the deadline is spent', async () => {
    const {calls, fetchImpl} = scriptedFetch([404]);
    let elapsed = 0;
    const res = await primeCdnAssets(['a.css', 'b.css'], {
      fetchImpl,
      sleep: async () => {
        elapsed += 5_000;
      },
      now: () => elapsed,
      deadlineMs: 5_000,
    });
    expect(calls).toEqual(['a.css', 'b.css', 'a.css', 'b.css']);
    expect(res.cold.map(entry => entry.url)).toEqual(['a.css', 'b.css']);
  });

  it('deduplicates a URL the page names twice', async () => {
    const {calls, fetchImpl} = scriptedFetch([200]);
    const res = await primeCdnAssets(['same.css', 'same.css'], {
      fetchImpl,
      sleep: async () => {},
      now: () => 0,
      deadlineMs: 1_000,
    });
    expect(calls).toEqual(['same.css']);
    expect(res.ready).toEqual(['same.css']);
  });
});
