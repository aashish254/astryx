// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file build's tree end to end, offline: the network and subprocesses throw,
 * and build still answers. The block picker changes only the kit's blocks:
 * the start, its alternatives, and every other field stay build's own, the
 * block count is build's own, and the output bytes are pinned per phrase.
 */

import {createHash} from 'node:crypto';
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
 * Hand-written phrases, with the blocks the picker names and the sha256 and
 * byte length of the whole JSON answer.
 * @type {[string, string[], number, string][]}
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
    7814,
    '005b383c9b54110864381e04abfe47bbf1f85f6ed1f19f00cf614c7f2eb80a5d',
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
    7329,
    '5cf8b8da02ee7c9467ce070b52a9d79fa2a76281ab2013c4e2766b5f3d4f91a2',
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
    6668,
    '6750cf2c3a6116b8e5355a9cd7125c592ca64938e067efe01c44a72b397902f4',
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
    7545,
    'd4af243624afa3e28492875dee1f35408a386671abffd0467e09de910247dde1',
  ],
  [
    'kanban board for sprint tasks with a filter bar',
    ['ToolbarTableFilter', 'PowerSearchFullFeatured'],
    5644,
    'f71d9932a70d8d82d4b13cfa1c90ef80254d95c89704e6e5dfaa57336b2c3cfc',
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

  for (const [phrase, blocks, bytes, sha] of PINNED) {
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
      const json = JSON.stringify(answer);
      expect(Buffer.byteLength(json)).toBe(bytes);
      expect(createHash('sha256').update(json).digest('hex')).toBe(sha);
    });
  }
});
