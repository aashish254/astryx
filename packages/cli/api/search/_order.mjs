// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The order rules a searcher's ranking keeps: an entry the query names
 * leads; in a two-word query, the entries that match both words keep their
 * lexical order; and an integration's entries that the lexical ranker scored
 * the same keep their lexical order.
 */

import {entryOf} from './_entries.mjs';
import {words} from './_query-words.mjs';

/** The lexical ranker's score where its every-word top tier starts, over 100. */
const FULL_COVERAGE = 1.51;

/** @typedef {import('./_entries.mjs').EntryTable} EntryTable */

/**
 * Puts first the entries the query names outright: those the lexical ranker
 * matched by their whole name or another name of theirs (an alias, a file
 * name, a replaced Core name), in its order. The rest keep their learned
 * order. A query that is an entry's name always gets that entry first.
 * @param {EntryTable} table
 * @param {number[]} order
 * @param {{domain: string, name: string, score?: number, reason?: string}[]} lexical
 * @returns {number[]}
 */
export function namedFirst(table, order, lexical) {
  /** @type {number[]} */
  const first = [];
  for (const res of lexical) {
    if ((res.score ?? 0) < 95) continue;
    if (!/^(exact name|plural of the name|name )/.test(res.reason ?? ''))
      continue;
    const k = entryOf(table, res);
    if (k !== undefined && !first.includes(k)) first.push(k);
  }
  const lead = new Set(first);
  return [...first, ...order.filter(k => !lead.has(k))];
}

/**
 * Keeps the lexical order among an integration's entries that the lexical
 * ranker scored the same: they have no cards, so the learned order would only
 * be guessing between them. Each such group keeps the places it holds in
 * `order`, filled in lexical order. Core's entries are untouched.
 * @param {EntryTable} table
 * @param {number[]} order
 * @param {Float64Array[]} rows
 * @returns {number[]}
 */
export function lexicalTies(table, order, rows) {
  /** @type {Map<number, number[]>} lexical score -> positions in order */
  const groups = new Map();
  order.forEach((k, at) => {
    const pkg = table.candidate[k]?._package ?? '';
    if (!pkg || pkg.startsWith('@astryxdesign/') || rows[k][2] === 0) return;
    const key = rows[k][0];
    if (!groups.has(key)) groups.set(key, []);
    /** @type {number[]} */ (groups.get(key)).push(at);
  });
  const out = [...order];
  for (const at of groups.values()) {
    if (at.length < 2) continue;
    const ks = at.map(i => order[i]).sort((a, b) => rows[b][1] - rows[a][1]);
    at.forEach((i, j) => (out[i] = ks[j]));
  }
  return out;
}

/**
 * In a query of one or two words, keeps the lexical order among the entries
 * the lexical ranker put in its top tier (every query word matched, at least
 * one by name or title). They keep the places the learned order gave them,
 * filled in lexical order. Longer queries keep the learned order.
 * @param {number[]} order
 * @param {Float64Array[]} rows
 * @param {string} query
 * @returns {number[]}
 */
export function fullCoverageOrder(order, rows, query) {
  if (words(query).length > 2) return order;
  /** @type {number[]} */
  const at = [];
  order.forEach((k, i) => {
    if (rows[k][2] > 0 && rows[k][0] >= FULL_COVERAGE) at.push(i);
  });
  if (at.length < 2) return order;
  const ks = at.map(i => order[i]).sort((a, b) => rows[b][1] - rows[a][1]);
  const out = [...order];
  at.forEach((i, j) => (out[i] = ks[j]));
  return out;
}
