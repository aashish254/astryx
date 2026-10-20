// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Unit tests for build's block picker on two small hand-written weight
 * files: the linear word scores, the candidates (search's blocks, then the
 * blocks the words score highest), the combiner, the tie-breaks, and build's
 * own count.
 */

import {describe, expect, it} from 'vitest';
import {pickBlocks} from './blocks.mjs';

/** @type {import('./blocks.mjs').BlockPickerWeights} */
const WORDS = {
  vocab: {chart: 1024, table: 2048, sales: 1536, 'sales chart': 3072, row: 512},
  classes: ['ChartBar', 'TableBasic', 'CardStat', 'ListPlain'],
  bias: [10, -20, 0, -64],
  words: {
    chart: [0, 90, 2, 30],
    table: [1, 120, 3, -40],
    'sales chart': [0, 60, 2, 50],
    row: [2, 80],
  },
  theta: [0.5, 0.25, 0.5, 0.4, 1.5],
};
const CATALOG = [
  'ChartBar',
  'TableBasic',
  'CardStat',
  'ListPlain',
  'DrawerOnly',
];
/** @type {[string, number, number, number][]} */
const SEARCHED = [
  ['TableBasic', 96, 1, 3],
  ['DrawerOnly', 80, 1, 3],
  ['ListPlain', 64, 1, 3],
  ['ChartBar', 50, 1, 3],
];

/** @type {import('./blocks.mjs').BlockPickerWeights} */
const TIES = {
  vocab: {alpha: 1024},
  classes: ['X', 'Y', 'Z'],
  bias: [0, 0, 0],
  words: {alpha: [1, 64, 2, 64]},
  theta: [0, 0, 0, 0, 1],
};

describe('pickBlocks', () => {
  it('re-ranks search blocks with the words and keeps build’s count', () => {
    const picks = pickBlocks(
      'Sales chart with a table row',
      {
        kitBlocks: ['TableBasic', 'DrawerOnly', 'ListPlain'],
        searched: SEARCHED,
        foreign: [],
      },
      CATALOG,
      WORDS,
    );
    expect(picks).toEqual(['TableBasic', 'DrawerOnly', 'ChartBar']);
  });

  it('adds a block search did not return when the words lead to it', () => {
    expect(
      pickBlocks(
        'sales chart',
        {kitBlocks: ['TableBasic'], searched: SEARCHED, foreign: []},
        CATALOG,
        WORDS,
      ),
    ).toEqual(['ChartBar']);
  });

  it('keeps the slot of a block of build’s own the weights do not score', () => {
    expect(
      pickBlocks(
        'sales chart',
        {
          kitBlocks: ['TableBasic', 'DrawerOnly', 'ListPlain'],
          searched: SEARCHED,
          foreign: [],
        },
        CATALOG,
        WORDS,
      ),
    ).toEqual(['ChartBar', 'DrawerOnly', 'CardStat']);
  });

  it('keeps the slot of a block of build’s own an integration ships', () => {
    const signals = {
      kitBlocks: ['TableBasic', 'DrawerOnly', 'ListPlain'],
      searched: SEARCHED,
    };
    expect(
      pickBlocks(
        'sales chart',
        {...signals, foreign: ['ListPlain']},
        CATALOG,
        WORDS,
      ),
    ).toEqual(['ChartBar', 'DrawerOnly', 'ListPlain']);
    expect(
      pickBlocks(
        'sales chart',
        {...signals, foreign: ['TableBasic', 'ListPlain']},
        CATALOG,
        WORDS,
      ),
    ).toEqual(['TableBasic', 'DrawerOnly', 'ListPlain']);
  });

  it('never adds a block the weights do not score', () => {
    const picks = pickBlocks(
      'Sales chart with a table row',
      {kitBlocks: ['TableBasic', 'ListPlain'], searched: SEARCHED, foreign: []},
      CATALOG,
      WORDS,
    );
    expect(picks).not.toContain('DrawerOnly');
  });

  it('scores a request with no known words by search alone', () => {
    expect(
      pickBlocks(
        '??',
        {
          kitBlocks: ['TableBasic', 'ListPlain'],
          searched: SEARCHED,
          foreign: [],
        },
        CATALOG,
        WORDS,
      ),
    ).toEqual(['TableBasic', 'ChartBar']);
  });

  it('names no block when build names none', () => {
    expect(
      pickBlocks(
        'chart',
        {kitBlocks: [], searched: SEARCHED, foreign: []},
        CATALOG,
        WORDS,
      ),
    ).toEqual([]);
  });

  it('breaks ties by class order for the word candidates and by candidate order at the end', () => {
    /** @type {[string, number, number, number][]} */
    const searched = [['Z', 70, 1, 1]];
    const signals = {kitBlocks: ['Z'], searched, foreign: []};
    expect(pickBlocks('alpha', signals, ['X', 'Y', 'Z'], TIES)).toEqual(['Z']);
    expect(
      pickBlocks(
        'alpha',
        {...signals, kitBlocks: ['Z', 'Y']},
        ['X', 'Y', 'Z'],
        TIES,
      ),
    ).toEqual(['Z', 'Y']);
    expect(
      pickBlocks(
        'beta',
        {
          kitBlocks: ['Z', 'Y'],
          foreign: [],
          searched: [
            ['Z', 70, 1, 1],
            ['Y', 60, 1, 1],
          ],
        },
        ['X', 'Y', 'Z'],
        TIES,
      ),
    ).toEqual(['Z', 'Y']);
  });

  it('is deterministic and leaves its inputs alone', () => {
    const signals = {
      kitBlocks: ['TableBasic', 'ListPlain'],
      searched: SEARCHED,
      foreign: [],
    };
    const before = JSON.stringify({signals, WORDS});
    const a = pickBlocks('sales chart row', signals, CATALOG, WORDS);
    const b = pickBlocks('sales chart row', signals, CATALOG, WORDS);
    expect(a).toEqual(b);
    expect(JSON.stringify({signals, WORDS})).toBe(before);
  });
});
