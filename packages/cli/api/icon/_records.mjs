// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Pure icon records and ranking for the `icon` leaves (AST-084 FR6).
 * No environment access: the leaves pass in the sets the adapter read.
 *
 * Ranking tiers, highest first:
 *   100  the query is an `IconName` the icon fills
 *    90  an exact match in the reading the searched sets favor (below)
 *    80  an exact match in the other reading
 *    60  one of its words starts with the query
 *    40  a partial match: the id or a word contains the query, or every
 *        word of the query starts one of the icon's words or id parts
 *
 * An exact match is a NAME match when the query is the icon's id, or one of
 * its words that is also a part of its id (`trash` for `trash-2`); it is a
 * MEANING match when the query is one of its other words, its tags. An id
 * names the artwork; the tags say what it is for. Lucide's `delete` draws the
 * Delete key, so `delete` names it, while `trash` is tagged `delete`: the
 * query asks for the meaning. Which reading leads is decided by the searched
 * sets themselves: when at least as many icons carry the query as a tag as
 * carry it as a name, meaning matches score 90 and name-only matches 80;
 * otherwise name matches score 90 and meaning-only matches 80 (`user` names
 * many icons, so the `user` icon stays ahead of `contact`, which is only
 * tagged `user`).
 *
 * Within one score, a name match on the whole id comes before one on a part
 * of it, and a meaning match whose query sits earlier among the icon's tags
 * comes first (sets list an icon's most telling tags first). Remaining ties
 * keep the set order (the project's set first, then load order) and then id
 * order, so the same installation always answers the same way.
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
 * How one icon matches a query, before the searched sets decide which exact
 * reading leads: the tier, whether an exact match is a name or a meaning
 * match, and the keys that order matches within a tier.
 * @typedef {object} IconMatch
 * @property {'fills' | 'exact' | 'prefix' | 'partial'} tier
 * @property {boolean} name the query is the id, or a word that is an id part
 * @property {boolean} meaning the query is one of the icon's tags (never
 *   both: a tag is a word that is not the id or one of its parts)
 * @property {number} order within-tier key, lower first: for a name match 0
 *   (whole id) or 1 (an id part); for a meaning match the tag's position
 * @property {string} reason
 */

/**
 * How one icon matches a query, or null when it does not.
 * @param {string} query lower-case, trimmed
 * @param {IconSetIcon} icon
 * @returns {IconMatch | null}
 */
export function matchIcon(query, icon) {
  const joined = squash(query);
  const fill = (icon.fills ?? []).find(name => name.toLowerCase() === joined);
  if (fill) {
    return {
      tier: 'fills',
      name: false,
      meaning: false,
      order: 0,
      reason: `fills "${fill}"`,
    };
  }
  const id = query.replace(/\s+/g, '-');
  const parts = new Set(icon.id.split('-'));
  const tags = icon.words.filter(word => word !== icon.id && !parts.has(word));
  const tagAt = tags.indexOf(query);
  const wholeId = icon.id === id;
  const partWord = !wholeId && parts.has(query) && icon.words.includes(query);
  if (wholeId || partWord || tagAt >= 0) {
    return {
      tier: 'exact',
      name: wholeId || partWord,
      meaning: !wholeId && !partWord,
      order: wholeId ? 0 : partWord ? 1 : tagAt,
      reason: wholeId ? `id "${icon.id}"` : `word "${query}"`,
    };
  }
  const prefix = icon.words.find(word => word.startsWith(query));
  if (prefix) {
    return {
      tier: 'prefix',
      name: false,
      meaning: false,
      order: 0,
      reason: `word "${prefix}" starts with "${query}"`,
    };
  }
  const contains = [icon.id, ...icon.words].find(text => text.includes(query));
  if (contains) {
    return {
      tier: 'partial',
      name: false,
      meaning: false,
      order: 0,
      reason: `partial "${contains}"`,
    };
  }
  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const all = [
      ...icon.id.split('-'),
      ...icon.words.flatMap(w => w.split(/\s+/)),
    ];
    if (tokens.every(token => all.some(part => part.startsWith(token)))) {
      return {
        tier: 'partial',
        name: false,
        meaning: false,
        order: 0,
        reason: `partial "${tokens.join(' ')}"`,
      };
    }
  }
  return null;
}

/**
 * The score of one match, given which exact reading leads.
 * @param {IconMatch} match
 * @param {'name' | 'meaning'} leading
 * @returns {number}
 */
function scoreOf(match, leading) {
  switch (match.tier) {
    case 'fills':
      return 100;
    case 'exact':
      return match[leading] ? 90 : 80;
    case 'prefix':
      return 60;
    default:
      return 40;
  }
}

/**
 * Which exact reading leads for a set of matches: meaning, unless more icons
 * carry the query as a name than as a tag.
 * @param {Array<IconMatch | null>} matches
 * @returns {'name' | 'meaning'}
 */
export function leadingReading(matches) {
  let names = 0;
  let meanings = 0;
  for (const match of matches) {
    if (match?.tier !== 'exact') continue;
    if (match.name) names++;
    if (match.meaning) meanings++;
  }
  return names > meanings ? 'name' : 'meaning';
}

/**
 * How well one icon answers a query on its own, or null when it does not.
 * An exact match is scored as if `leading` were the reading the searched
 * sets favor (meaning, unless told otherwise).
 * @param {string} query lower-case, trimmed
 * @param {IconSetIcon} icon
 * @param {'name' | 'meaning'} [leading]
 * @returns {{score: number, reason: string} | null}
 */
export function scoreIcon(query, icon, leading = 'meaning') {
  const match = matchIcon(query, icon);
  return match ? {score: scoreOf(match, leading), reason: match.reason} : null;
}

/**
 * Every icon in `sets` that answers the query, ranked (FR6).
 * @param {DiscoveredIconSet[]} sets in tie order
 * @param {string} query
 * @returns {IconMatchEntry[]}
 */
export function rankIcons(sets, query) {
  const term = query.trim().toLowerCase();
  /** @type {Array<{set: DiscoveredIconSet, icon: IconSetIcon, match: IconMatch, setIndex: number}>} */
  const hits = [];
  sets.forEach((set, setIndex) => {
    for (const icon of set.data.icons) {
      const match = matchIcon(term, icon);
      if (match) hits.push({set, icon, match, setIndex});
    }
  });
  const leading = leadingReading(hits.map(hit => hit.match));
  const found = hits.map(({set, icon, match, setIndex}) => {
    const score = scoreOf(match, leading);
    return {
      entry: {...iconRecord(set, icon), reason: match.reason, score},
      // Within an exact score: a name match keeps whole id before id part,
      // a meaning match its tag position.
      order: match.tier === 'exact' ? match.order : 0,
      setIndex,
    };
  });
  found.sort(
    (a, b) =>
      b.entry.score - a.entry.score ||
      a.order - b.order ||
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
