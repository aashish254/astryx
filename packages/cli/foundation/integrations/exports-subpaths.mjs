// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file How a package.json `exports` field declares a subpath, read without
 * touching the targets (which may be build output that does not exist yet).
 *
 * @input A package.json `exports` value and a `.`/`./…` subpath.
 * @output Whether the subpath is declared for an ES module importer, and why
 *   not when it is not.
 * @position foundation/integrations; shared by the public-import checks and
 *   the `integration add` package.json writer.
 */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Whether an export value gives an ES module importer something: a string,
 * or a condition object / fallback array with a target under a condition
 * other than `require` and `types`.
 * @param {unknown} value
 * @returns {boolean}
 */
export function importable(value) {
  if (typeof value === 'string') return true;
  if (Array.isArray(value)) return value.some(importable);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([condition, target]) =>
      condition !== 'require' && condition !== 'types' && importable(target),
  );
}

/**
 * Every string target an export value names, any condition.
 * @param {unknown} value
 * @param {string[]} [out]
 * @returns {string[]}
 */
export function allTargets(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) allTargets(v, out);
  else if (isRecord(value))
    for (const v of Object.values(value)) allTargets(v, out);
  return out;
}

/**
 * @typedef {object} SubpathDeclaration
 * @property {'declared'|'no_exports'|'root_only'|'missing'|'blocked'|'not_importable'} state
 * @property {unknown} [value] the matched export value
 * @property {string} [wildcard] what a `*` key matched
 */

/**
 * How a package's `exports` field declares one subpath, without touching the
 * targets: a missing key, a key with only a `require` condition, an `exports`
 * that is a bare string or a condition object (so only `.`), a wildcard that
 * does not match, or a `null` that blocks it.
 * @param {unknown} exportsField
 * @param {string} subpath `.` or `./…`
 * @returns {SubpathDeclaration}
 */
export function subpathDeclaration(exportsField, subpath) {
  if (exportsField === undefined) return {state: 'no_exports'};
  const keys = isRecord(exportsField) ? Object.keys(exportsField) : [];
  const isMap = keys.length > 0 && keys.every(key => key.startsWith('.'));
  if (!isMap) {
    if (subpath !== '.') return {state: 'root_only'};
    return importable(exportsField)
      ? {state: 'declared', value: exportsField}
      : {state: 'not_importable', value: exportsField};
  }
  const map = /** @type {Record<string, unknown>} */ (exportsField);
  /** @type {{value: unknown, wildcard: string} | null} */
  let hit = null;
  if (Object.hasOwn(map, subpath)) {
    hit = {value: map[subpath], wildcard: ''};
  } else {
    const patterns = keys
      .filter(key => key.split('*').length === 2)
      .sort((a, b) => b.indexOf('*') - a.indexOf('*') || b.length - a.length);
    for (const pattern of patterns) {
      const star = pattern.indexOf('*');
      const prefix = pattern.slice(0, star);
      const suffix = pattern.slice(star + 1);
      if (
        subpath.length >= prefix.length + suffix.length &&
        subpath.startsWith(prefix) &&
        subpath.endsWith(suffix)
      ) {
        hit = {
          value: map[pattern],
          wildcard: subpath.slice(
            prefix.length,
            subpath.length - suffix.length,
          ),
        };
        break;
      }
    }
  }
  if (!hit) return {state: 'missing'};
  if (hit.value == null) return {state: 'blocked'};
  if (!importable(hit.value))
    return {state: 'not_importable', value: hit.value};
  return {state: 'declared', value: hit.value, wildcard: hit.wildcard};
}

// ── Inserting entries into package.json text ────────────────────────

/** @param {string} text @param {number} i */
function skipSpace(text, i) {
  while (i < text.length && /[\s\ufeff]/u.test(text[i])) i += 1;
  return i;
}

/**
 * The end of the JSON string that starts at `i`, or -1.
 * @param {string} text @param {number} i
 */
function stringEnd(text, i) {
  if (text[i] !== '"') return -1;
  for (let at = i + 1; at < text.length; at += 1) {
    if (text[at] === '\\') at += 1;
    else if (text[at] === '"') return at + 1;
  }
  return -1;
}

/**
 * The end of the JSON value that starts at `i`, or -1.
 * @param {string} text @param {number} i
 */
function valueEnd(text, i) {
  if (text[i] === '"') return stringEnd(text, i);
  if (text[i] === '{' || text[i] === '[') {
    let depth = 0;
    for (let at = i; at < text.length; at += 1) {
      const ch = text[at];
      if (ch === '"') {
        at = stringEnd(text, at) - 1;
        if (at < 0) return -1;
      } else if (ch === '{' || ch === '[') depth += 1;
      else if (ch === '}' || ch === ']') {
        depth -= 1;
        if (depth === 0) return at + 1;
      }
    }
    return -1;
  }
  let at = i;
  while (at < text.length && !/[\s,}\]]/u.test(text[at])) at += 1;
  return at === i ? -1 : at;
}

/**
 * The members of the JSON object that starts at `i`: each key's start and
 * name, where its value starts and ends.
 * @param {string} text @param {number} i
 * @returns {Array<{keyStart: number, keyEnd: number, key: string, valueStart: number, valueEnd: number}> | null}
 */
function objectMembers(text, i) {
  if (text[i] !== '{') return null;
  /** @type {Array<{keyStart: number, keyEnd: number, key: string, valueStart: number, valueEnd: number}>} */
  const members = [];
  let at = skipSpace(text, i + 1);
  if (text[at] === '}') return members;
  for (;;) {
    const keyEnd = stringEnd(text, at);
    if (keyEnd < 0) return null;
    const key = JSON.parse(text.slice(at, keyEnd));
    const colon = skipSpace(text, keyEnd);
    if (text[colon] !== ':') return null;
    const valueStart = skipSpace(text, colon + 1);
    const end = valueEnd(text, valueStart);
    if (end < 0) return null;
    members.push({keyStart: at, keyEnd, key, valueStart, valueEnd: end});
    at = skipSpace(text, end);
    if (text[at] === '}') return members;
    if (text[at] !== ',') return null;
    at = skipSpace(text, at + 1);
  }
}

/**
 * Add subpath entries to the `exports` map of a package.json text, leaving
 * every other byte as it is: each entry goes after the map's last entry, on
 * its own line with that entry's indentation and the file's line ending (or on
 * the same line when the
 * map is written on one line), with the map's own key/value separator. Null
 * when the text has no non-empty top-level `exports` object.
 * @param {string} text
 * @param {Array<[string, string]>} entries key and target
 * @returns {string | null}
 */
export function insertExportEntries(text, entries) {
  const top = objectMembers(text, skipSpace(text, 0));
  const field = top?.find(member => member.key === 'exports');
  if (!field) return null;
  const members = objectMembers(text, field.valueStart);
  if (!members || members.length === 0) return null;
  const first = members[0];
  const last = members[members.length - 1];
  const separator = text.slice(first.keyEnd, first.valueStart);
  const multiline = text.slice(field.valueStart, field.valueEnd).includes('\n');
  const lineStart = text.lastIndexOf('\n', last.keyStart) + 1;
  const indent = text.slice(lineStart, last.keyStart);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lead =
    multiline && /^[ \t]*$/u.test(indent) ? `,${eol}${indent}` : ', ';
  const added = entries
    .map(
      ([key, value]) =>
        `${lead}${JSON.stringify(key)}${separator}${JSON.stringify(value)}`,
    )
    .join('');
  return text.slice(0, last.valueEnd) + added + text.slice(last.valueEnd);
}
