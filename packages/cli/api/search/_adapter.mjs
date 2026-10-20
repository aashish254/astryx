// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Search's adapter: the only place search reads the environment. It
 * gathers every candidate from the domains a query asks for (one file per
 * domain, _gather-*.mjs) and loads the tree's static data before it runs.
 */

import {readFileSync} from 'node:fs';
import {findCoreDir} from '../../foundation/fs/paths.mjs';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {CORELESS_DOMAINS} from './_query.mjs';
import {gatherComponents} from './_gather-components.mjs';
import {gatherHooks} from './_gather-hooks.mjs';
import {gatherDocs} from './_gather-docs.mjs';
import {gatherTemplates, gatherThemes} from './_gather-templates.mjs';

export {componentKeywords} from './_gather-components.mjs';

/** @typedef {import('./_lexical.mjs').Candidate} Candidate */

/**
 * Gathers every candidate the query's domains hold.
 *
 * @param {{cwd?: string, type?: string}} options
 * @returns {Promise<{all: Candidate[], components: Candidate[], searchedComponents: boolean}>}
 */
export async function gatherCandidates(options) {
  const {cwd = process.cwd(), type} = options;
  // `astryx docs` reads docs without @astryxdesign/core, and `astryx theme
  // list` reads themes without it (bundled themes need no project), so a
  // search of either must too. Every other domain reads core: asked for by
  // name, it is an error without core; an open search then covers the docs
  // and themes alone.
  const needsCore = !type || !CORELESS_DOMAINS.includes(type);
  const coreDir = needsCore ? findCoreDir(cwd) : null;
  if (type && needsCore && !coreDir) {
    throw new AstryxError(
      'Could not find @astryxdesign/core package',
      undefined,
      ERROR_CODES.ERR_CORE_NOT_FOUND,
    );
  }

  // Gather candidates from each requested domain in parallel.
  /** @param {string} d */
  const wants = d =>
    (!type && (coreDir != null || CORELESS_DOMAINS.includes(d))) || type === d;
  const [components, hooks, docTopics, templates, themes] = await Promise.all([
    wants('component')
      ? gatherComponents(/** @type {string} */ (coreDir), cwd)
      : [],
    wants('hook') ? gatherHooks(/** @type {string} */ (coreDir)) : [],
    wants('doc') ? gatherDocs(cwd) : [],
    wants('template') ? gatherTemplates(cwd) : [],
    wants('theme') ? gatherThemes(cwd) : [],
  ]);

  const all = [...components, ...hooks, ...docTopics, ...templates, ...themes];
  return {all, components, searchedComponents: wants('component')};
}

/**
 * @typedef {{w: number[], mu: number[], sd: number[]}} SearcherWeights
 * @typedef {object} SearchData
 * @property {Record<string, {what?: string, synonyms?: string[], props?: string[]}>} cards
 *   Each Core component's and hook's source-built card: what it is, the words
 *   people type for it, its main props.
 * @property {import('../../foundation/route/route.mjs').ClassifierWeights} router The root classifier's weights.
 * @property {SearcherWeights} main The main searcher's weights.
 * @property {SearcherWeights} doc The doc searcher's weights.
 * @property {SearcherWeights} template The template searcher's weights.
 * @typedef {Awaited<ReturnType<typeof gatherCandidates>> & {data: SearchData}} SearchCatalog
 */

/** @type {SearchData | null} */
let searchData = null;

/**
 * The search tree's static data, read once: the entry cards and each node's
 * weights file.
 * @returns {SearchData}
 */
export function loadSearchData() {
  if (!searchData) {
    /** @param {string} file */
    const read = file =>
      JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
    searchData = {
      cards: read('./_cards.json'),
      router: read('./tree.weights.json'),
      main: read('./_main-searcher.weights.json'),
      doc: read('./_doc-searcher.weights.json'),
      template: read('./_template-searcher.weights.json'),
    };
  }
  return searchData;
}
