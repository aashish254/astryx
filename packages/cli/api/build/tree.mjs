// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How build answers: a root classifier sends each request to the
 * searcher that should answer it. Its weights (tree.weights.json) have one
 * class today, so every request goes to the main searcher, the kit ranker.
 * @input {query, options} and the data build's adapter gathered
 * @output the build.kit response
 * @position api/build; build.mjs runs it with the shared route helper
 */

import {routeKit} from '../../foundation/route/route.mjs';
import {buildKit} from './kit/kit.mjs';

/**
 * @typedef {{query: string, options: NonNullable<Parameters<typeof buildKit>[1]>}} BuildRequest
 * @typedef {{weights: import('../../foundation/route/route.mjs').ClassifierWeights}} BuildContext
 * @typedef {import('./build.type.mjs').BuildKitResponse} BuildAnswer
 */

/** @type {import('../../foundation/route/route.mjs').RouteKit<BuildRequest, BuildContext, BuildAnswer>} */
const {defineSearcher, defineClassifier, defineTree} = routeKit;

const main = defineSearcher({
  id: 'main',
  summary:
    'Ranks page templates, blocks, and components by the words of the request and starts from the best page template.',
  run: request => buildKit(request.query, request.options),
});

const root = defineClassifier({
  id: 'root',
  summary: 'Classifies the request and hands it to the searcher for its class.',
  searchers: {},
  fallback: 'main',
  floor: 1,
  features: () => ['#bias'],
  weights: ctx => ctx.weights,
});

export const BUILD_TREE = defineTree('root', [root, main]);
