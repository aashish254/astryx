// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Programmatic API for the unified `search` command.
 *
 * Returns the same typed envelope { type, data } that `astryx --json search`
 * outputs. The CLI command handler is a thin wrapper around this function.
 *
 * `search(query)` is the single "I'm looking for X" entry point across all
 * content domains: components, hooks, docs topics, templates (page and
 * block), and themes. The adapter gathers every candidate (_adapter.mjs),
 * and search's tree (tree.mjs) picks the searcher that answers.
 * `searchCore(query)` is the lexical ranker alone (_lexical.mjs); `build`
 * reads it, so build's output does not move when search's tree does.
 */

import {withListingCache} from '../../foundation/fs/listing-cache.mjs';
import {gatherCandidates} from './_adapter.mjs';
import {rankLexical} from './_lexical.mjs';
import {checkSearchArgs} from './_result.mjs';
import {runTree} from '../../foundation/route/route.mjs';
import {SEARCH_TREE} from './tree.mjs';

// The domains a search covers (the command handler lists them), and what
// build reads from search: its word vocabulary, the components a search
// read, and the keywords of Core's components.
export {SEARCH_DOMAINS, STOPWORDS} from './_query.mjs';
export {SYNONYMS} from './_synonyms.mjs';
export {stem} from './_words.mjs';
export {searchedComponents} from './_result.mjs';
export {componentKeywords} from './_adapter.mjs';

/**
 * Unified ranked search across components, hooks, docs, templates, and themes.
 *
 * @param {string} query - Free-text search term.
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @param {'component'|'hook'|'doc'|'template'|'theme'} [options.type] - Restrict to one domain.
 * @param {number} [options.limit] - Max results (default 20).
 * @returns {Promise<import('./search.type.mjs').SearchResponse>}
 */
export async function search(query, options = {}) {
  checkSearchArgs(query, options);
  return withListingCache(
    async () =>
      /** @type {import('./search.type.mjs').SearchResponse} */ (
        await runTree(
          SEARCH_TREE,
          {query, options},
          await gatherCandidates(options),
        )
      ),
  );
}

/**
 * The lexical ranker alone: keyword and fuzzy scoring of every candidate.
 * `build` ranks from it.
 *
 * @param {string} query
 * @param {{cwd?: string, type?: 'component'|'hook'|'doc'|'template'|'theme', limit?: number}} [options]
 * @returns {Promise<import('./search.type.mjs').SearchResponse>}
 */
export async function searchCore(query, options = {}) {
  checkSearchArgs(query, options);
  return withListingCache(async () =>
    rankLexical(query, options, await gatherCandidates(options)),
  );
}
