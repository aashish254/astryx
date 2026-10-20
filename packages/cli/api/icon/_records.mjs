// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Pure icon records and ranking for the `icon` leaves (AST-084 FR6).
 * No environment access: the leaves pass in the sets the adapter read.
 *
 * Ranking tiers, highest first:
 *   100  the query is an `IconName` the icon fills
 *    90  the query is the icon's id
 *    80  the query is one of its words
 *    60  one of its words starts with the query
 *    40  a partial match: the id or a word contains the query, or every
 *        word of the query starts one of the icon's words or id parts
 * Ties keep the set order (the project's set first, then load order) and then
 * id order, so the same installation always answers the same way.
 *
 * @position api/icon — shared by the search, detail, and list leaves
 */

import {levenshteinDistance} from '../../foundation/text/string-utils.mjs';

/** @typedef {import('../../foundation/discovery/icon-set-discovery.mjs').DiscoveredIconSet} DiscoveredIconSet */
/** @typedef {import('../../authoring/doctypes/icon-set/type').IconSetIcon} IconSetIcon */
/** @typedef {import('./icon.type.mjs').IconRecord} IconRecord */
/** @typedef {import('./icon.type.mjs').IconMatchEntry} IconMatchEntry */

/**
 * The import line for one export.
 * @param {string} exportName
 * @param {string} module
 */
export function importLine(exportName, module) {
  return `import {${exportName}} from '${module}';`;
}

/**
 * One icon as every icon read names it.
 * @param {DiscoveredIconSet} set
 * @param {IconSetIcon} icon
 * @returns {IconRecord}
 */
export function iconRecord(set, icon) {
  const module = icon.module ?? set.data.module;
  return {
    set: set.name,
    id: icon.id,
    package: set.package,
    module,
    export: icon.export,
    import: importLine(icon.export, module),
    words: [...icon.words],
    fills: [...(icon.fills ?? [])],
    variants: (icon.variants ?? []).map(variant => ({
      ...(variant.appearance == null ? {} : {appearance: variant.appearance}),
      ...(variant.size == null ? {} : {size: variant.size}),
      ...(variant.weight == null ? {} : {weight: variant.weight}),
      module: variant.module ?? module,
      export: variant.export,
    })),
  };
}

/** @param {string} value */
const squash = value => value.toLowerCase().replace(/[\s_-]+/g, '');

/**
 * How well one icon answers a query, or null when it does not.
 * @param {string} query lower-case, trimmed
 * @param {IconSetIcon} icon
 * @returns {{score: number, reason: string} | null}
 */
export function scoreIcon(query, icon) {
  const joined = squash(query);
  const fill = (icon.fills ?? []).find(name => name.toLowerCase() === joined);
  if (fill) return {score: 100, reason: `fills "${fill}"`};
  if (icon.id === query.replace(/\s+/g, '-')) {
    return {score: 90, reason: `id "${icon.id}"`};
  }
  const exact = icon.words.find(word => word === query);
  if (exact) return {score: 80, reason: `word "${exact}"`};
  const prefix = icon.words.find(word => word.startsWith(query));
  if (prefix) {
    return {score: 60, reason: `word "${prefix}" starts with "${query}"`};
  }
  const contains = [icon.id, ...icon.words].find(text => text.includes(query));
  if (contains) return {score: 40, reason: `partial "${contains}"`};
  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const parts = [
      ...icon.id.split('-'),
      ...icon.words.flatMap(w => w.split(/\s+/)),
    ];
    if (tokens.every(token => parts.some(part => part.startsWith(token)))) {
      return {score: 40, reason: `partial "${tokens.join(' ')}"`};
    }
  }
  return null;
}

/**
 * Every icon in `sets` that answers the query, ranked (FR6).
 * @param {DiscoveredIconSet[]} sets in tie order
 * @param {string} query
 * @returns {IconMatchEntry[]}
 */
export function rankIcons(sets, query) {
  const term = query.trim().toLowerCase();
  /** @type {Array<{entry: IconMatchEntry, setIndex: number}>} */
  const found = [];
  sets.forEach((set, setIndex) => {
    for (const icon of set.data.icons) {
      const hit = scoreIcon(term, icon);
      if (!hit) continue;
      found.push({
        entry: {...iconRecord(set, icon), reason: hit.reason, score: hit.score},
        setIndex,
      });
    }
  });
  found.sort(
    (a, b) =>
      b.entry.score - a.entry.score ||
      a.setIndex - b.setIndex ||
      (a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0),
  );
  return found.map(({entry}) => entry);
}

/**
 * The installed sets a selector names: `<package>/<set>`, else a set name.
 * @param {DiscoveredIconSet[]} sets
 * @param {string} selector
 * @returns {DiscoveredIconSet[]}
 */
export function setsNamed(sets, selector) {
  const exact = sets.filter(set => `${set.package}/${set.name}` === selector);
  return exact.length > 0 ? exact : sets.filter(set => set.name === selector);
}

/**
 * Suggestions for a name that matched nothing: the closest candidates first.
 * @param {string} wanted
 * @param {string[]} candidates
 * @param {string} reason
 * @param {number} [max]
 */
export function closest(wanted, candidates, reason, max = 5) {
  return [...new Set(candidates)]
    .map(name => ({name, distance: levenshteinDistance(wanted, name)}))
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))
    .slice(0, max)
    .map(({name}) => ({name, reason}));
}
