// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How a searcher orders the lexical ranker's matches. Search answers
 * only with what the lexical ranker matched, each with its own score and
 * reason. The lexical ranker's bands hold: an entry the whole query names, a
 * phrase or title match, a match on every word, a name or keyword match, and a
 * match in prose alone each stay above the bands below them, and a doc or a
 * non-doc never passes one the lexical ranker placed above it. Inside such a
 * run the learned order places the matches, with these exceptions: matches
 * that scored the same keep their lexical order, as one block; an entry the
 * query names leads; in a query of one or two words, the matches on every
 * word keep their lexical order; and an integration's matches that scored the
 * same keep theirs.
 */

import {entryOf} from './_entries.mjs';
import {words} from './_query-words.mjs';
import {searchedComponentsOf} from './_result.mjs';

/** @typedef {import('./_entries.mjs').EntryTable} EntryTable */

/**
 * Where each lexical band starts, highest first: the whole query as a name,
 * as a keyword, as a phrase in a title, a title in the query, every word
 * matched, a strong partial match, a name or keyword match, and below that,
 * prose alone.
 */
const BANDS = [195, 188, 170, 160, 151, 100, 55];
/** The lowest score of the every-word top tier. */
const FULL_COVERAGE = 151;

/** @param {number} score */
const bandOf = score => {
  const i = BANDS.findIndex(floor => score >= floor);
  return i === -1 ? BANDS.length : i;
};

/**
 * The search response: the lexical matches, each band in the learned order.
 * Nothing is added or dropped, so the count and the scores stay the lexical
 * ranker's; only the order inside a band, and so which matches fill the
 * limit, changes.
 * @param {EntryTable} table
 * @param {number[]} order entry positions, best first, by the searcher's weights
 * @param {import('./search.type.mjs').SearchResponse} lexical every lexical match
 * @param {string} query
 * @param {number} limit
 * @returns {import('./search.type.mjs').SearchResponse}
 */
export function orderMatches(table, order, lexical, query, limit) {
  const all = lexical.data.results;
  /** @type {Map<number, number>} */
  const place = new Map(order.map((k, i) => [k, i]));
  // Runs of consecutive lexical matches in one band and of one kind (doc or
  // not) are the only places the learned order acts: a match never crosses
  // into another band, or past a doc or a non-doc the lexical ranker placed.
  let band = 0;
  let run = -1;
  /** @type {string} */
  let last = '';
  const items = all.map((res, i) => {
    band = Math.max(band, bandOf(res.score ?? 0));
    const key = `${band}:${res.domain === 'doc'}`;
    if (key !== last) {
      run++;
      last = key;
    }
    const k = entryOf(table, res);
    return {
      res,
      i,
      band: run,
      learned: k === undefined ? Infinity : (place.get(k) ?? Infinity),
    };
  });
  const named = (/** @type {Item} */ it) =>
    (it.res.score ?? 0) >= 95 &&
    /^(exact name|plural of the name|name )/.test(it.res.reason ?? '');
  // Matches the lexical ranker scored the same move as one block, in its
  // order; the learned order places the blocks of a run, and an entry the
  // query names leads its run.
  /** @type {Map<string, number>} */
  const block = new Map();
  const blockOf = (/** @type {Item} */ it) => `${it.band}:${it.res.score}`;
  for (const it of items) {
    const at = named(it) ? -1 : it.learned;
    block.set(blockOf(it), Math.min(block.get(blockOf(it)) ?? Infinity, at));
  }
  let ranked = [...items].sort(
    (x, y) =>
      x.band - y.band ||
      (block.get(blockOf(x)) ?? 0) - (block.get(blockOf(y)) ?? 0) ||
      x.i - y.i,
  );
  if (words(query).length <= 2) {
    ranked = keepLexical(ranked, it => (it.res.score ?? 0) >= FULL_COVERAGE);
  }
  ranked = integrationTies(ranked);
  const response = {
    ...lexical,
    data: {...lexical.data, results: ranked.slice(0, limit).map(it => it.res)},
  };
  const searched = searchedComponentsOf.get(lexical);
  if (searched) searchedComponentsOf.set(response, searched);
  return /** @type {import('./search.type.mjs').SearchResponse} */ (response);
}

/**
 * @typedef {{res: any, i: number, band: number, learned: number}} Item
 */

/**
 * The matches `pick` selects keep the places they hold, filled in lexical
 * order.
 * @param {Item[]} items
 * @param {(item: Item) => boolean} pick
 * @returns {Item[]}
 */
function keepLexical(items, pick) {
  /** @type {number[]} */
  const at = [];
  items.forEach((it, j) => pick(it) && at.push(j));
  if (at.length < 2) return items;
  const sorted = at.map(j => items[j]).sort((a, b) => a.i - b.i);
  const out = [...items];
  at.forEach((j, n) => (out[j] = sorted[n]));
  return out;
}

/**
 * An integration's matches that the lexical ranker scored the same keep its
 * order among themselves: they have no cards, so the learned order would only
 * guess between them.
 * @param {Item[]} items
 * @returns {Item[]}
 */
export function integrationTies(items) {
  /** @type {Map<number, number[]>} */
  const groups = new Map();
  items.forEach((it, j) => {
    const pkg = it.res.package ?? '';
    if (!pkg || pkg.startsWith('@astryxdesign/')) return;
    const key = it.res.score ?? 0;
    if (!groups.has(key)) groups.set(key, []);
    /** @type {number[]} */ (groups.get(key)).push(j);
  });
  const out = [...items];
  for (const at of groups.values()) {
    if (at.length < 2) continue;
    const sorted = at.map(j => items[j]).sort((a, b) => a.i - b.i);
    at.forEach((j, n) => (out[j] = sorted[n]));
  }
  return out;
}
