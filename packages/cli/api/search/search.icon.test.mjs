// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx search` finds icons (AST-084 FR8): an icon-only word, an icon
 * against an equal component, and `--type icon`.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {search} from './search.mjs';
import {
  glyphsData,
  writeIconSetProject,
} from '../../test-utils/icon-set-fixture.mjs';

const CORE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../core',
);

/** @type {string} */
let tmp;
/** @type {string} */
let cwd;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-search-icons-'));
  // A "table" icon, so the word matches a Core component and an icon alike.
  const data = /** @type {any} */ ({...glyphsData(), module: '@acme/glyphs'});
  data.icons.push({id: 'table', export: 'HomeIcon', words: ['table', 'grid']});
  // An icon whose own words are only its name, mapped to `archive`.
  data.icons.push({id: 'basket', export: 'HomeIcon', words: ['basket']});
  data.map = {...data.map, archive: 'basket'};
  cwd = writeIconSetProject(tmp, {packages: [{data}]});
  fs.mkdirSync(path.join(cwd, 'node_modules', '@astryxdesign'), {
    recursive: true,
  });
  fs.symlinkSync(
    CORE,
    path.join(cwd, 'node_modules', '@astryxdesign', 'core'),
    'dir',
  );
});
afterAll(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

describe('search: icon domain', () => {
  it('an icon-only word finds the icon, with its import and command', async () => {
    const {data} = await search('garbage', {cwd});
    const hit = data.results.find(result => result.domain === 'icon');
    expect(hit).toMatchObject({
      domain: 'icon',
      name: 'glyphs/trash',
      package: '@acme/glyphs',
      import: "import {TrashIcon} from '@acme/glyphs';",
      command: 'astryx icon glyphs/trash',
    });
  });

  it('a word naming a component and an icon finds the component first', async () => {
    const {data} = await search('table', {cwd});
    const component = data.results.findIndex(
      result => result.domain === 'component' && result.name === 'Table',
    );
    const iconAt = data.results.findIndex(result => result.domain === 'icon');
    expect(component).toBeGreaterThanOrEqual(0);
    expect(iconAt).toBeGreaterThan(component);
  });

  it('an icon answers to the words of the definition it is mapped to', async () => {
    // `store` is a word of the archive definition, not of the icon.
    const {data} = await search('store', {cwd, type: 'icon'});
    expect(data.results.map(result => result.name)).toContain('glyphs/basket');
  });

  it('--type icon keeps only icons', async () => {
    const {data} = await search('remove', {cwd, type: 'icon'});
    expect(data.results.length).toBeGreaterThan(0);
    expect(data.results.every(result => result.domain === 'icon')).toBe(true);
  });
}, 60_000);
