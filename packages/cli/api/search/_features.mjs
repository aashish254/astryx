// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The plain signals search's learned searchers score with. Every one
 * is a deterministic count over the query's words and each entry's own text:
 * BM25 over the entry's name, its docs text, and its source-built card; how
 * many query words it covers; whether the query holds its name; the lexical
 * ranker's score and rank; and the router's guess of the domain the query
 * wants. A searcher's weights file holds one number per signal (and per
 * signal and domain); its score is their weighted sum.
 * @input a query, the lexical ranking, the gathered candidates, static weights
 * @output ranked entry ids, and the search response built from them
 * @position api/search; the searchers and the root router import it
 */

import {toResult} from './_result.mjs';
import {
  DOMAINS,
  ROUTES,
  words,
  fold,
  nameWords,
  queryWords,
} from './_query-words.mjs';

/** @param {string[]} list @returns {Map<string, number>} */
const counts = list => {
  const m = new Map();
  for (const w of list) m.set(w, (m.get(w) ?? 0) + 1);
  return m;
};

/**
 * @typedef {object} EntryTable
 * @property {string[]} ids every returnable `<domain>:<name>`, in code-point order
 * @property {Map<string, number>} index id -> position
 * @property {any[]} candidate one candidate per id, for its result
 * @property {number[]} domain domain index per id
 * @property {string[][]} name each id's name words
 * @property {Record<'name'|'desc'|'card', {post: Map<string, [number, number][]>, idf: Map<string, number>, len: number[], avg: number}>} fields
 */

const tables = new WeakMap();

/**
 * The entry a lexical result answers as.
 * @param {{index: Map<string, number>}} table
 * @param {{domain: string, name: string, package?: string}} res
 * @returns {number | undefined}
 */
export const entryOf = (table, res) =>
  table.index.get(`${res.domain}:${res.name}|${res.package}`) ??
  table.index.get(`${res.domain}:${res.name}`);

/** The id a candidate answers as. @param {any} c */
export const entryId = c =>
  `${c.domain}:${c.domain === 'doc' ? (c._topic ?? c.name) : (c._resultName ?? c.name)}`;

/**
 * The entries search can answer with and their text, by field. Doc sections
 * fold into their topic. Built once per gathered catalog.
 * @param {any[]} all the gathered candidates
 * @param {Record<string, {what?: string, synonyms?: string[], props?: string[]}>} cards
 * @returns {EntryTable}
 */
export function entryTable(all, cards) {
  const hit = tables.get(all);
  if (hit) return hit;
  /** @type {Map<string, any[]>} */
  const by = new Map();
  /** @type {Map<string, string>} each id's first package */
  const owner = new Map();
  for (const c of all) {
    // Two packages may each give an entry the same name (an integration's
    // Dialog beside Core's): the later package's entry keeps its own id.
    const plain = entryId(c);
    if (!owner.has(plain)) owner.set(plain, c._package ?? '');
    const id =
      (c._package ?? '') === owner.get(plain)
        ? plain
        : `${plain}|${c._package}`;
    if (!by.has(id)) by.set(id, []);
    /** @type {any[]} */ (by.get(id)).push(c);
  }
  const ids = [...by.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  /** @type {Record<'name'|'desc'|'card', Map<string, number>[]>} */
  const docs = {name: [], desc: [], card: []};
  const table = /** @type {EntryTable} */ (
    /** @type {unknown} */ ({
      ids,
      index: new Map(ids.map((id, k) => [id, k])),
      candidate: [],
      domain: [],
      name: [],
      fields: {},
    })
  );
  for (const id of ids) {
    const group = /** @type {any[]} */ (by.get(id));
    const first = group.find(c => !c._section) ?? group[0];
    const [domain, name] = [
      id.slice(0, id.indexOf(':')),
      id.slice(id.indexOf(':') + 1),
    ];
    const nw = nameWords(name).map(fold);
    table.candidate.push(first);
    table.domain.push(DOMAINS.indexOf(domain));
    table.name.push(nw);
    const text = [];
    for (const c of group) {
      text.push(
        c.description ?? '',
        ...(c.keywords ?? []),
        ...(c.aliases ?? []),
        ...(c.titles ?? []),
      );
      text.push(
        ...(c.guidance ?? []).slice(0, 10),
        ...(c.prose ?? []).slice(0, 4),
      );
    }
    const card =
      domain === 'component' || domain === 'hook' ? cards[name] : undefined;
    docs.name.push(counts([...nw, nw.join('')]));
    docs.desc.push(counts(words(text.join(' ')).map(fold)));
    docs.card.push(
      counts(
        card
          ? words(
              [
                card.what ?? '',
                ...(card.synonyms ?? []),
                ...(card.props ?? []),
              ].join(' '),
            ).map(fold)
          : [],
      ),
    );
  }
  const n = ids.length;
  for (const f of /** @type {const} */ (['name', 'desc', 'card'])) {
    /** @type {Map<string, [number, number][]>} */
    const post = new Map();
    /** @type {Map<string, number>} */
    const df = new Map();
    /** @type {number[]} */
    const len = [];
    docs[f].forEach((m, k) => {
      let l = 1;
      for (const [w, c] of m) {
        l += c;
        df.set(w, (df.get(w) ?? 0) + 1);
        const list = post.get(w) ?? [];
        list.push([k, c]);
        post.set(w, list);
      }
      len.push(l);
    });
    const idf = new Map();
    for (const [w, d] of df)
      idf.set(w, Math.log(1 + (n - d + 0.5) / (d + 0.5)));
    table.fields[f] = {post, idf, len, avg: len.reduce((a, b) => a + b, 0) / n};
  }
  tables.set(all, table);
  return table;
}

/** The signal names, in weights-file order (before the per-domain copies). */
export const SIGNALS = [
  's_score',
  's_rr',
  's_in',
  's_top20',
  'd_component',
  'd_hook',
  'd_doc',
  'd_template',
  'd_theme',
  'bm_name',
  'bm_desc',
  'bm_card',
  'cover',
  'cover_all',
  'head',
  'r_dom',
  'r_none',
  'name_in_q',
  'name_exact',
];

/** The signals that also get one copy per domain. */
export const PER_DOMAIN = [
  's_score',
  's_rr',
  'bm_name',
  'bm_desc',
  'bm_card',
  'cover',
  'r_dom',
  'name_in_q',
];

/**
 * Every entry's signals for one query, as rows of numbers.
 * @param {EntryTable} table
 * @param {string} query
 * @param {{domain: string, name: string, score?: number}[]} lexical the lexical ranking, best first
 * @param {number[] | null} route the router's class probabilities
 * @returns {Float64Array[]}
 */
export function signals(table, query, lexical, route) {
  const n = table.ids.length;
  const S = SIGNALS.length;
  const rows = table.ids.map(() => new Float64Array(S));
  const seen = new Set();
  let r = 0;
  for (const res of lexical) {
    const k = entryOf(table, res);
    if (k === undefined || seen.has(k)) continue;
    seen.add(k);
    r++;
    const x = rows[k];
    x[0] = (res.score ?? 0) / 100;
    x[1] = 1 / r;
    x[2] = 1;
    x[3] = r <= 20 ? 1 : 0;
  }
  for (let k = 0; k < n; k++) rows[k][4 + table.domain[k]] = 1;
  const qw = [...new Set(queryWords(query))];
  if (qw.length) {
    const hits = qw.map(() => new Uint8Array(n));
    /** @type {const} */ (['name', 'desc', 'card']).forEach((f, j) => {
      const {post, idf, len, avg} = table.fields[f];
      qw.forEach((w, a) => {
        for (const [k, c] of post.get(w) ?? []) {
          rows[k][9 + j] +=
            ((idf.get(w) ?? 0) * c * 2.2) /
            (c + 1.2 * (0.25 + (0.75 * len[k]) / avg));
          hits[a][k] = 1;
        }
      });
    });
    for (let k = 0; k < n; k++) {
      let cov = 0;
      for (let a = 0; a < qw.length; a++) cov += hits[a][k];
      rows[k][12] = cov / qw.length;
      rows[k][13] = cov === qw.length && qw.length > 1 ? 1 : 0;
      rows[k][14] = hits[qw.length - 1][k];
    }
  }
  if (route) {
    for (let k = 0; k < n; k++) {
      rows[k][15] = route[table.domain[k]];
      rows[k][16] = route[ROUTES.length - 1];
    }
  }
  const all = words(query).map(fold);
  const spaced = ` ${all.join(' ')} `;
  const runs = new Set();
  for (let len = 1; len <= 3; len++) {
    for (let a = 0; a + len <= all.length; a++)
      runs.add(all.slice(a, a + len).join(''));
  }
  const whole = all.join('');
  for (let k = 0; k < n; k++) {
    const nw = table.name[k];
    if (!nw.length) continue;
    const j = nw.join('');
    if (spaced.includes(` ${nw.join(' ')} `) || runs.has(j)) {
      rows[k][17] = 1;
      if (j === whole) rows[k][18] = 1;
    }
  }
  return rows;
}

/**
 * Ranks the entries by a searcher's weights: the weighted sum of each entry's
 * standardized signals and per-domain copies; ties go to the earlier id.
 * @param {EntryTable} table
 * @param {Float64Array[]} rows
 * @param {{w: number[], mu: number[], sd: number[]}} weights
 * @returns {number[]} entry positions, best first
 */
export function rank(table, rows, weights) {
  const {w, mu, sd} = weights;
  const S = SIGNALS.length;
  const per = PER_DOMAIN.map(s => SIGNALS.indexOf(s));
  const score = rows.map((x, k) => {
    let s = 0;
    for (let j = 0; j < S; j++) s += ((x[j] - mu[j]) / sd[j]) * w[j];
    const d = table.domain[k];
    per.forEach((j, p) => {
      for (let dd = 0; dd < DOMAINS.length; dd++) {
        const c = S + p * DOMAINS.length + dd;
        s += (((dd === d ? x[j] : 0) - mu[c]) / sd[c]) * w[c];
      }
    });
    return Math.round(s * 1e9) / 1e9;
  });
  return score.map((s, k) => k).sort((a, b) => score[b] - score[a] || a - b);
}

/**
 * The search response for ranked entries: each entry's lexical result when
 * the lexical ranker matched it, else a result built from its candidate.
 * Only entries some query word matched answer, and never more of them than
 * the lexical ranker returns, so the response never grows.
 * @param {EntryTable} table
 * @param {number[]} order
 * @param {Float64Array[]} rows each entry's signals
 * @param {import('./search.type.mjs').SearchResponse} lexical the full lexical response
 * @param {number} limit
 * @returns {import('./search.type.mjs').SearchResponse}
 */
export function respond(table, order, rows, lexical, limit) {
  /** @type {Map<string, any>} */
  const own = new Map();
  for (const res of lexical.data.results) {
    const k = entryOf(table, res);
    const id = k === undefined ? '' : table.ids[k];
    if (!own.has(id)) own.set(id, res);
  }
  const matched = (/** @type {number} */ k) =>
    rows[k][2] > 0 ||
    rows[k][9] > 0 ||
    rows[k][10] > 0 ||
    rows[k][11] > 0 ||
    rows[k][17] > 0;
  const cap = Math.min(limit, lexical.data.results.length);
  const results = order
    .filter(matched)
    .slice(0, cap)
    .map(k => {
      const id = table.ids[k];
      return (
        own.get(id) ?? toResult(table.candidate[k], 0, 'related words', 0, 0)
      );
    });
  return {...lexical, data: {...lexical.data, results}};
}

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
