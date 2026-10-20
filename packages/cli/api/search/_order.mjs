// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The order rules a searcher's ranking keeps: an entry the query names
 * leads, and an integration's entries that the lexical ranker scored the same
 * keep their lexical order.
 */

import {entryOf} from './_entries.mjs';

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
