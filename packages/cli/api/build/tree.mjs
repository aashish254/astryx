// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How build answers: a dispatcher that sends each request to the
 * searcher that should answer it. Today every request goes to the main
 * searcher, the kit ranker; topic searchers join as children of the root.
 * @input {request: {query, options}} from build()
 * @output the build.kit response
 * @position api/build; build.mjs runs it with the shared route helper
 */

import {
  defineDispatcher,
  defineSearcher,
  defineTree,
} from '../../foundation/route/route.mjs';
import {buildKit} from './kit/kit.mjs';

/**
 * @typedef {{query: string, options: NonNullable<Parameters<typeof buildKit>[1]>}} BuildRequest
 * @typedef {import('./build.type.mjs').BuildKitResponse} BuildAnswer
 */

const main = defineSearcher(
  /** @type {Omit<import('../../foundation/route/route.mjs').Searcher<BuildRequest, null, BuildAnswer>, 'kind'>} */ ({
    id: 'main',
    summary:
      'Ranks page templates, blocks, and components by the words of the request and starts from the best page template.',
    run: request => buildKit(request.query, request.options),
  }),
);

const root = defineDispatcher(
  /** @type {Omit<import('../../foundation/route/route.mjs').Dispatcher<BuildRequest, null>, 'kind'>} */ ({
    id: 'root',
    summary: 'Sends every request to the main searcher.',
    children: ['main'],
    floor: 0,
    fallback: 'main',
    route: () => ({ids: ['main'], confidence: 1}),
  }),
);

/** @type {import('../../foundation/route/route.mjs').Tree<BuildRequest, null, BuildAnswer>} */
export const BUILD_TREE = defineTree('root', [root, main]);
