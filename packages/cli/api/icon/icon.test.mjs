// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `icon()` (AST-084 FR6, FR7): ranking, set and limit options, one
 * icon, the set list, and errors, over the synthetic fixture.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {icon} from './icon.mjs';
import {rankIcons, scoreIcon} from './_records.mjs';
import {
  glyphsData,
  writeIconSetProject,
} from '../../test-utils/icon-set-fixture.mjs';

/** @type {string} */
let tmp;
/** @type {string} */
let cwd;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-api-'));
  cwd = writeIconSetProject(tmp);
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/** @param {string} query @param {object} [options] */
async function search(query, options = {}) {
  const result = await icon(query, {cwd, ...options});
  if (result.type !== 'icon.search') throw new Error(result.type);
  return result.data;
}

describe('icon.search ranking', () => {
  const icons = glyphsData().icons;
  const byId = (/** @type {string} */ id) =>
    /** @type {any} */ (icons.find(each => each.id === id));

  it('scores each tier: fills, id, word, prefix, partial', () => {
    expect(scoreIcon('close', byId('x'))).toEqual({
      score: 100,
      reason: 'fills "close"',
    });
    expect(scoreIcon('trash', byId('trash'))).toEqual({
      score: 90,
      reason: 'id "trash"',
    });
    expect(scoreIcon('delete', byId('trash'))).toEqual({
      score: 80,
      reason: 'word "delete"',
    });
    expect(scoreIcon('garb', byId('trash'))?.score).toBe(60);
    expect(scoreIcon('arbag', byId('trash'))?.score).toBe(40);
    expect(scoreIcon('ma', byId('search'))?.score).toBe(60);
    expect(scoreIcon('zebra', byId('trash'))).toBeNull();
  });

  it('a fill outranks a word match of the same text', async () => {
    const data = await search('search');
    expect(data.matches[0]).toMatchObject({id: 'search', score: 100});
  });

  it('ties keep id order, so the answer is stable', async () => {
    const data = await search('remove');
    expect(data.matches.map(match => match.id)).toEqual(['trash', 'x']);
  });

  it('ties keep set order: the project set first', () => {
    const set = (/** @type {string} */ name) =>
      /** @type {any} */ ({
        name,
        package: `@acme/${name}`,
        data: {module: `@acme/${name}`, icons: [byId('x')]},
      });
    expect(rankIcons([set('b'), set('a')], 'close').map(m => m.set)).toEqual([
      'b',
      'a',
    ]);
  });

  it('returns every field, with the import line', async () => {
    const data = await search('delete');
    expect(data).toMatchObject({query: 'delete', matchCount: 1});
    expect(data.matches[0]).toEqual({
      set: 'glyphs',
      id: 'trash',
      package: '@acme/glyphs',
      module: '@acme/glyphs',
      export: 'TrashIcon',
      import: "import {TrashIcon} from '@acme/glyphs';",
      words: ['delete', 'remove', 'bin', 'garbage'],
      fills: [],
      variants: [
        {appearance: 'solid', module: '@acme/glyphs', export: 'TrashSolidIcon'},
      ],
      reason: 'word "delete"',
      score: 80,
    });
  });

  it('no match is an empty list, not an error', async () => {
    expect(await search('zebra')).toEqual({
      query: 'zebra',
      matchCount: 0,
      matches: [],
    });
  });

  it('--limit caps the list; matchCount counts every match', async () => {
    const data = await search('remove', {limit: 1});
    expect(data.matches).toHaveLength(1);
    expect(data.matchCount).toBe(2);
    await expect(icon('remove', {cwd, limit: 0})).rejects.toMatchObject({
      code: 'ERR_INVALID_ARGUMENT',
    });
  });

  it('--set keeps one set, and an unknown set is ERR_NOT_FOUND', async () => {
    expect(
      (await search('close', {set: '@acme/glyphs/glyphs'})).matchCount,
    ).toBe(1);
    await expect(icon('close', {cwd, set: 'glyps'})).rejects.toMatchObject({
      code: 'ERR_NOT_FOUND',
      suggestions: expect.arrayContaining([
        expect.objectContaining({name: 'glyphs'}),
      ]),
    });
  });

  it('a project with no icon set answers an empty list', async () => {
    fs.rmSync(path.join(cwd, 'node_modules'), {recursive: true});
    expect((await search('close')).matches).toEqual([]);
  });
});

describe('icon.detail', () => {
  it('reads one icon with every variant import and the envelope package', async () => {
    const result = await icon('glyphs/trash', {cwd});
    expect(result.type).toBe('icon.detail');
    if (result.type !== 'icon.detail') return;
    expect(result.package).toBe('@acme/glyphs');
    expect(result.data.variants).toEqual([
      {
        appearance: 'solid',
        module: '@acme/glyphs',
        export: 'TrashSolidIcon',
        import: "import {TrashSolidIcon} from '@acme/glyphs';",
      },
    ]);
    expect((await icon('@acme/glyphs/glyphs/x', {cwd})).type).toBe(
      'icon.detail',
    );
  });

  it('an unknown set or icon is ERR_NOT_FOUND with suggestions', async () => {
    await expect(icon('nope/trash', {cwd})).rejects.toMatchObject({
      code: 'ERR_NOT_FOUND',
    });
    const error = await icon('glyphs/trashcan', {cwd}).catch(e => e);
    expect(error.suggestions[0].name).toBe('glyphs/trash');
    await expect(icon('glyphs/trashcan', {cwd})).rejects.toMatchObject({
      code: 'ERR_NOT_FOUND',
      suggestions: expect.arrayContaining([
        expect.objectContaining({name: 'glyphs/trash'}),
      ]),
    });
  });
});

describe('icon.list', () => {
  it('lists each set with its coverage of the shared names', async () => {
    const result = await icon(undefined, {cwd, list: true});
    if (result.type !== 'icon.list') throw new Error(result.type);
    expect(result.data).toMatchObject({
      status: 'selected',
      projectSet: '@acme/glyphs/glyphs',
      withdrawn: [],
    });
    const [set] = result.data.sets;
    expect(set).toMatchObject({
      name: 'glyphs',
      package: '@acme/glyphs',
      license: 'MIT',
      iconCount: 4,
      default: {appearance: 'outline', size: 24},
      fills: ['close', 'search'],
      project: true,
    });
    expect(set.unfilled).toContain('chevronDown');
    expect(set.unfilled).not.toContain('close');
  });

  it('refuses a query with --list and no query without it', async () => {
    await expect(icon('x', {cwd, list: true})).rejects.toMatchObject({
      code: 'ERR_INVALID_ARGUMENT',
    });
    await expect(icon('', {cwd})).rejects.toMatchObject({
      code: 'ERR_MISSING_ARGUMENT',
    });
  });
});
