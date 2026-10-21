// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the order rules a searcher's ranking keeps (_order.mjs).
 */

import {describe, it, expect} from 'vitest';
import {fullCoverageOrder} from './_order.mjs';

/** A signal row: lexical score over 100, lexical 1/rank, and whether lexical matched. */
const row = (/** @type {number} */ score, /** @type {number} */ rr) =>
  Float64Array.from([score, rr, 1]);

describe('fullCoverageOrder', () => {
  const rows = [
    row(1.53, 1 / 3),
    row(1.55, 1 / 2),
    row(1.56, 1),
    row(1.07, 1 / 4),
  ];

  it('keeps the lexical order among top-tier entries of a two-word query, in their places', () => {
    expect(fullCoverageOrder([0, 3, 1, 2], rows, 'two words')).toEqual([
      2, 3, 1, 0,
    ]);
  });

  it('leaves a longer query in the learned order', () => {
    expect(fullCoverageOrder([0, 3, 1, 2], rows, 'three words here')).toEqual([
      0, 3, 1, 2,
    ]);
  });
});
