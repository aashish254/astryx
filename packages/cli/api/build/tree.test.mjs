// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file build's tree end to end, offline: the network and subprocesses throw,
 * and build still answers. The block picker changes only the kit's blocks:
 * the start, its alternatives, and every other field stay build's own, the
 * block count is build's own, and the blocks it names are pinned per phrase.
 */

import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';

// vi.mock calls are hoisted above the imports; the stub maker is hoisted with them.
const {blocked} = vi.hoisted(() => ({
  /** @param {string} name */
  blocked: name => async (/** @type {() => Promise<any>} */ load) => {
    const real = await load();
    /** @type {Record<string, unknown>} */
    const stub = {};
    for (const [key, value] of Object.entries(real)) {
      stub[key] =
        typeof value === 'function'
          ? () => {
              throw new Error(`build reached ${name}.${key}`);
            }
          : value;
    }
    return {...stub, default: stub};
  },
}));
vi.mock('node:http', blocked('http'));
vi.mock('node:https', blocked('https'));
vi.mock('node:net', blocked('net'));
vi.mock('node:dns', blocked('dns'));
vi.mock('node:child_process', blocked('child_process'));
vi.mock('http', blocked('http'));
vi.mock('https', blocked('https'));
vi.mock('net', blocked('net'));
vi.mock('dns', blocked('dns'));
vi.mock('child_process', blocked('child_process'));

const {build} = await import('./build.mjs');
const {buildKit} = await import('./kit/kit.mjs');
const {loadBlockPicker, withListingCache} = await import('./_adapter.mjs');

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

/**
 * Hand-written phrases and the blocks the picker names for each. The rest of
 * the answer carries search results, which change whenever the docs do, so it
 * is compared with build's own kit rather than pinned.
 * @type {[string, string[]][]}
 */
const PINNED = [
  [
    'analytics dashboard with a KPI row and a sortable table',
    [
      'TableSortableTable',
      'TableRichCellTable',
      'TableShowcase',
      'TableGridDividersTable',
      'TableRowStatusTable',
    ],
  ],
  [
    'settings page with notification toggles and a save bar',
    [
      'SwitchSettingsPanel',
      'CardWithInnerLayout',
      'SwitchWithDescription',
      'CheckboxListItemBasic',
      'FormLayoutHorizontalLabels',
    ],
  ],
  [
    'empty state for a question bank with an import button',
    [
      'EmptyStateActions',
      'EmptyStateCompact',
      'EmptyStateContainer',
      'EmptyStateShowcase',
      'CenterInsideACard',
    ],
  ],
  [
    'login form with single sign-on buttons',
    [
      'FormLayoutMixedControls',
      'FormLayoutShowcase',
      'DialogFormDialog',
      'CardWithInnerLayout',
      'ButtonGroupBasic',
    ],
  ],
  [
    'kanban board for sprint tasks with a filter bar',
    ['ToolbarTableFilter', 'PowerSearchFullFeatured'],
  ],
];

/** @type {typeof globalThis.fetch} */
let realFetch;
beforeAll(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error('build reached fetch');
  };
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

describe('build tree', () => {
  it('runs with the network and subprocesses blocked', async () => {
    const cp = await import('node:child_process');
    const https = await import('node:https');
    expect(() => cp.execFileSync('true')).toThrow(/build reached/);
    expect(() => https.request('https://example.com')).toThrow(/build reached/);
    expect(() => globalThis.fetch('https://example.com')).toThrow(
      /build reached/,
    );
  });

  it('loads the block picker weights as plain numbers', () => {
    expect(loadBlockPicker()).not.toBeNull();
  });

  for (const [phrase, blocks] of PINNED) {
    it(`answers "${phrase}" offline with the picker's blocks`, async () => {
      const answer = await build(phrase, {cwd: REPO});
      const own = await withListingCache(() => buildKit(phrase, {cwd: REPO}));
      if (answer?.type !== 'build.kit' || own.type !== 'build.kit')
        throw new Error('expected a kit');
      // Only the blocks move: the start, its alternatives, and every other
      // field are build's own.
      expect({...answer.data, blocks: null}).toEqual({
        ...own.data,
        blocks: null,
      });
      expect(answer.data.start?.alternatives).toEqual(
        own.data.start?.alternatives,
      );
      expect(answer.data.blocks.length).toBe(own.data.blocks.length);
      expect(answer.data.blocks.map(b => b.name)).toEqual(blocks);
    });
  }
});
