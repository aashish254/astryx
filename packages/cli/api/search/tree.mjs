// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How search answers: a root dispatcher sends each query to the
 * searcher that should answer it. Today every query goes to the main
 * searcher, the lexical ranker.
 * @input {query, options} and the candidates the adapter gathered
 * @output the search response
 * @position api/search; search.mjs runs it with the shared route helper
 */

import {routeKit} from '../../foundation/route/route.mjs';
import {rankLexical} from './_lexical.mjs';

/**
 * @typedef {{query: string, options: NonNullable<Parameters<typeof rankLexical>[1]>}} SearchRequest
 * @typedef {Parameters<typeof rankLexical>[2]} SearchCatalog
 * @typedef {import('./search.type.mjs').SearchResponse} SearchAnswer
 */

/** @type {import('../../foundation/route/route.mjs').RouteKit<SearchRequest, SearchCatalog, SearchAnswer>} */
const {defineSearcher, defineDispatcher, defineTree} = routeKit;

const main = defineSearcher({
  id: 'main',
  summary:
    'Ranks every component, hook, doc, template, and theme by keyword and fuzzy match.',
  run: (request, catalog) =>
    rankLexical(request.query, request.options, catalog),
});

const root = defineDispatcher({
  id: 'root',
  summary: 'Sends every query to the main searcher.',
  children: ['main'],
  floor: 0,
  fallback: 'main',
  route: () => ({ids: ['main'], confidence: 1}),
});

export const SEARCH_TREE = defineTree('root', [root, main]);
