// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The main searcher: ranks every entry by a weighted sum of plain
 * signals (see _features.mjs): the lexical ranker's score and rank, BM25 over
 * each entry's name, docs text and source-built card, query-word coverage,
 * whether the query holds the entry's name, and the router's guess of the
 * domain the query wants. Its weights are static numbers in
 * _main-searcher.weights.json.
 * @input {query, options} and the gathered catalog with its static data
 * @output the search response, the lexical response's shape and size
 * @position api/search; a child of the root dispatcher in tree.mjs
 */

import {routeKit} from '../../foundation/route/route.mjs';
import {entryTable, rank, respond, signals, namedFirst} from './_features.mjs';
import {routeProbs} from './_query-words.mjs';
import {rankLexical} from './_lexical.mjs';

/** @typedef {{w: number[], mu: number[], sd: number[]}} SearcherWeights */

/**
 * A tuning override for a searcher, or null for its shipped weights.
 * @param {unknown} weights
 * @returns {SearcherWeights | null}
 */
export const asWeights = weights =>
  /** @type {SearcherWeights | null} */ (weights);

/**
 * Ranks with one searcher's weights. Shared by the main searcher and every
 * topic searcher, which differ only in their weights.
 * @param {import('./tree.mjs').SearchRequest} request
 * @param {import('./tree.mjs').SearchCatalog} catalog
 * @param {SearcherWeights} weights
 * @returns {import('./search.type.mjs').SearchResponse}
 */
export function rankWith(request, catalog, weights) {
  const {query, options} = request;
  const table = entryTable(catalog.all, catalog.data.cards);
  const lexical = rankLexical(
    query,
    {...options, limit: Number.MAX_SAFE_INTEGER},
    catalog,
  );
  const route = routeProbs(catalog.data.router, query);
  const rows = signals(table, query, lexical.data.results, route);
  return respond(
    table,
    namedFirst(table, rank(table, rows, weights), lexical.data.results),
    rows,
    lexical,
    options.limit ?? 20,
  );
}

/** @type {import('./tree.mjs').SearchKit} */
const {defineSearcher} = routeKit;

export const main = defineSearcher({
  id: 'main',
  summary:
    'Ranks every component, hook, doc, template, and theme by a weighted sum of plain word-match signals.',
  run: (request, catalog, weights) =>
    rankWith(request, catalog, asWeights(weights) ?? catalog.data.main),
});
