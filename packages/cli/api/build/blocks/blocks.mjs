// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file build's block picker: re-ranks the blocks build would name for a
 * request with checked-in word weights, and keeps build's own count.
 *
 * @input The request, build's signals for it (`kitSignals`: the blocks the kit
 *   names, search's block results with their scores and coverage), the block
 *   ids the project can scaffold, and the picker weights (`blocks.weights.json`
 *   beside this file, read by the adapter): a vocabulary of words and word
 *   pairs with their weight (x1024), the block ids it scores, a bias per block
 *   and a sparse row of weights per word (x64), and five combiner numbers.
 * @output `pickBlocks(...)`: block ids, best first, as many as build's own list.
 * @position api/build/blocks; tree.mjs's main searcher calls it between
 *   kitSignals (kit/signals.mjs) and kitAnswer (kit/answer.mjs). Pure: no file, network, or environment access.
 *
 * How it scores. The request's words and adjacent word pairs, each weighted
 * (1 + ln count) x its vocabulary weight and scaled to unit length, give every
 * block a linear score (its bias plus the weighted words' rows). The
 * candidates are search's blocks (the kit's first, at most 30), then the ten
 * blocks the words score highest. Each candidate's final score combines five
 * numbers: search's score / 100, the share of the request search matched,
 * whether the kit names it, 1 / (1 + its place in search's list), and the
 * block's log-share of the linear scores. Ties keep the candidate order. A
 * block of build's own that the weights do not know, or whose package is not
 * Core's, keeps the slot build gave it; the picker fills the rest.
 */

/**
 * @typedef {object} BlockPickerWeights
 * @property {Record<string, number>} vocab word or word pair -> weight x1024
 * @property {string[]} classes the block ids the words score
 * @property {number[]} bias one per class, x64
 * @property {Record<string, number[]>} words word -> [class index, weight x64, ...]
 * @property {number[]} theta the five combiner numbers
 *
 * @typedef {import('../kit/signals.mjs').BlockScore} BlockScore
 */

/** How many of search's blocks are candidates. */
const SEARCH_CANDIDATES = 30;
/** How many blocks the words add. */
const WORD_CANDIDATES = 10;
/** The linear score of a block the words do not score. */
const UNSCORED = -30;

/**
 * The words and adjacent word pairs of a request, with their weights, in the
 * order they first appear; only those in the vocabulary.
 * @param {string} request
 * @param {BlockPickerWeights} weights
 * @returns {Map<string, number>}
 */
function features(request, weights) {
  const tokens =
    String(request ?? '')
      .toLowerCase()
      .match(/[a-z0-9]{2,}/g) ?? [];
  const all = [...tokens];
  for (let i = 0; i + 1 < tokens.length; i++)
    all.push(`${tokens[i]} ${tokens[i + 1]}`);
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const f of all) {
    if (Object.hasOwn(weights.vocab, f))
      counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  /** @type {Map<string, number>} */
  const x = new Map();
  for (const [f, c] of counts)
    x.set(f, ((1 + Math.log(c)) * weights.vocab[f]) / 1024);
  return x;
}

/**
 * Every class's linear score for a request, and the log of the normalizer.
 * @param {string} request
 * @param {BlockPickerWeights} weights
 * @returns {{z: number[], lse: number}}
 */
function linearScores(request, weights) {
  const x = features(request, weights);
  let sq = 0;
  for (const v of x.values()) sq += v * v;
  const norm = Math.sqrt(sq);
  const z = weights.bias.slice();
  if (norm > 0) {
    for (const [f, v] of x) {
      const row = Object.hasOwn(weights.words, f) ? weights.words[f] : null;
      if (!row) continue;
      for (let k = 0; k < row.length; k += 2)
        z[row[k]] += (v / norm) * row[k + 1];
    }
  }
  for (let c = 0; c < z.length; c++) z[c] /= 64;
  let max = -Infinity;
  for (const v of z) if (v > max) max = v;
  let sum = 0;
  for (const v of z) sum += Math.exp(v - max);
  return {z, lse: max + Math.log(sum)};
}

/**
 * The blocks build names for a request, re-ranked by the picker.
 * @param {string} request
 * @param {{kitBlocks: string[], searched: BlockScore[], foreign: string[]}} signals
 *   build's signals: the kit's blocks, search's block results [id, score,
 *   matched, total] in order, and the blocks whose package is not Core's
 * @param {readonly string[]} catalog the block ids the project can scaffold
 * @param {BlockPickerWeights} weights
 * @returns {string[]} block ids, as many as `signals.kitBlocks`: a block of
 *   build's own the picker must not move keeps its slot, and the picker's
 *   blocks, best first, fill the others
 */
export function pickBlocks(request, signals, catalog, weights) {
  const count = signals.kitBlocks.length;
  if (count === 0) return [];
  // The picker names only blocks it has weights for that the project can
  // scaffold, and reads search's first 30 blocks.
  const weighed = new Set(weights.classes);
  const known = new Set(catalog.filter(b => weighed.has(b)));
  const searched = signals.searched.slice(0, SEARCH_CANDIDATES);
  const {z, lse} = linearScores(request, weights);
  const classIndex = new Map(weights.classes.map((c, i) => [c, i]));
  const kit = new Set(signals.kitBlocks.filter(b => known.has(b)));
  /** @type {Map<string, BlockScore>} */
  const found = new Map();
  for (const s of searched)
    if (known.has(s[0]) && !found.has(s[0])) found.set(s[0], s);
  /** @type {Map<string, number>} */
  const place = new Map();
  for (const b of [
    ...kit,
    ...searched.map(s => s[0]).filter(b => known.has(b)),
  ])
    if (!place.has(b)) place.set(b, place.size);
  const order = [...place.keys()];
  const top = weights.classes
    .map((_, c) => c)
    .sort((a, b) => z[b] - z[a] || a - b)
    .slice(0, WORD_CANDIDATES);
  /** @type {string[]} */
  const candidates = [];
  const seen = new Set();
  for (const b of [
    ...order.slice(0, SEARCH_CANDIDATES),
    ...top.map(c => weights.classes[c]).filter(b => known.has(b)),
  ]) {
    if (!seen.has(b)) {
      seen.add(b);
      candidates.push(b);
    }
  }
  const [t0, t1, t2, t3, t4] = weights.theta;
  const scored = candidates.map((b, pos) => {
    const s = found.get(b);
    const c = classIndex.get(b);
    const at = place.get(b);
    const f0 = s ? s[1] / 100 : 0;
    const f1 = s ? (s[2] ?? 0) / Math.max(s[3] ?? 0, 1) : 0;
    const f2 = kit.has(b) ? 1 : 0;
    const f3 = at === undefined ? 0 : 1 / (1 + at);
    const f4 = (c === undefined ? UNSCORED : z[c]) - lse;
    return {b, pos, s: t0 * f0 + t1 * f1 + t2 * f2 + t3 * f3 + t4 * f4};
  });
  scored.sort((a, b) => b.s - a.s || a.pos - b.pos);
  // A block of build's own that the weights do not know, or that an
  // integration ships (its own block or a replacement), keeps the slot build
  // gave it: the weights cannot judge it. The picker's blocks, best first,
  // fill the other slots.
  const foreign = new Set(signals.foreign);
  const own = signals.kitBlocks;
  const keeps = own.map(b => !classIndex.has(b) || foreign.has(b));
  const pinned = new Set(own.filter((_, k) => keeps[k]));
  const fill = scored.map(x => x.b).filter(b => !pinned.has(b));
  /** @type {string[]} */
  const out = [];
  let next = 0;
  own.forEach((b, k) => {
    if (keeps[k]) out.push(b);
    else if (next < fill.length) out.push(fill[next++]);
  });
  return out;
}
