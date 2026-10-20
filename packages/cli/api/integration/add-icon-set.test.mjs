// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {integrationAdd, integrationAddIconSet} from './add-contribution.mjs';
import {discoverIconSetDirectory} from '../../foundation/discovery/icon-set-discovery.mjs';

/** @type {string} */
let tmpDir;

/**
 * @param {{manifest?: string | null, files?: string[] | null, name?: string | null, license?: string}} [opts]
 */
function setup({
  manifest = 'export default {};\n',
  files = ['dist'],
  name = '@acme/icons',
  license,
} = {}) {
  /** @type {Record<string, unknown>} */
  const pkg = {version: '1.0.0'};
  if (name != null) pkg.name = name;
  if (license != null) pkg.license = license;
  if (files != null) pkg.files = files;
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    `${JSON.stringify(pkg, null, 2)}\n`,
  );
  if (manifest != null) {
    fs.writeFileSync(path.join(tmpDir, 'astryx.integration.mjs'), manifest);
  }
}

/** @param {string} file */
const read = file => fs.readFileSync(path.join(tmpDir, file), 'utf-8');

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-add-icon-set-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('integrationAdd icon-set', () => {
  it('writes a typed descriptor and a starter data file, declares the root, and adds it to files', async () => {
    setup({license: 'MIT'});
    const result = await integrationAdd('icon-set', 'outline', {cwd: tmpDir});

    expect(result).toEqual({
      type: 'integration.add',
      data: {
        kind: 'icon-set',
        name: 'outline',
        root: {path: './icon-sets', created: true},
        manifest: 'astryx.integration.mjs',
        files: [
          'icon-sets/outline/outline.doc.mjs',
          'icon-sets/outline/outline.icons.json',
          'package.json',
          'astryx.integration.mjs',
        ],
        written: true,
        dryRun: false,
      },
    });

    const doc = read('icon-sets/outline/outline.doc.mjs');
    expect(doc).toContain(
      "/** @type {import('@astryxdesign/cli/authoring').IconSetDoc} */",
    );
    expect(doc).toContain("type: 'icon-set'");
    expect(doc).toContain("name: 'outline'");
    expect(doc).toContain("license: 'MIT'");
    expect(JSON.parse(read('icon-sets/outline/outline.icons.json'))).toEqual({
      schemaVersion: 1,
      module: '@acme/icons',
      map: {},
      icons: [],
    });
    expect(read('astryx.integration.mjs')).toMatch(
      /iconSets:\s*['"]\.\/icon-sets['"]/u,
    );
    expect(JSON.parse(read('package.json')).files).toEqual([
      'dist',
      'icon-sets',
      'astryx.integration.mjs',
    ]);

    // The written set is a valid, discoverable set.
    const {sets, errors} = discoverIconSetDirectory(
      path.join(tmpDir, 'icon-sets'),
      '@acme/icons',
    );
    expect(errors).toEqual([]);
    expect(sets.map(set => [set.name, set.displayName, set.license])).toEqual([
      ['outline', 'Outline', 'MIT'],
    ]);
  });

  it('creates the manifest on first add and never creates a files field', async () => {
    setup({manifest: null, files: null});
    const result = await integrationAddIconSet('brand-glyphs', {cwd: tmpDir});
    expect(result.data.root).toEqual({path: './icon-sets', created: true});
    expect(result.data.files).toContain('astryx.integration.mjs');
    expect(read('astryx.integration.mjs')).toContain('iconSets');
    expect(JSON.parse(read('package.json')).files).toBeUndefined();
    // No package license: the descriptor says so instead of guessing one.
    expect(read('icon-sets/brand-glyphs/brand-glyphs.doc.mjs')).toContain(
      "license: 'UNLICENSED'",
    );
  });

  it('uses an existing custom root and does not redeclare it', async () => {
    setup({manifest: "export default {iconSets: './glyphs'};\n"});
    const result = await integrationAddIconSet('outline', {cwd: tmpDir});
    expect(result.data.root).toEqual({path: './glyphs', created: false});
    expect(result.data.files).not.toContain('astryx.integration.mjs');
    expect(
      fs.existsSync(path.join(tmpDir, 'glyphs/outline/outline.icons.json')),
    ).toBe(true);
  });

  it('dry run predicts the real write without changing files', async () => {
    setup();
    const before = read('astryx.integration.mjs');
    const plan = await integrationAddIconSet('outline', {
      cwd: tmpDir,
      dryRun: true,
    });
    expect(plan.data.written).toBe(false);
    expect(plan.data.dryRun).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'icon-sets'))).toBe(false);
    expect(read('astryx.integration.mjs')).toBe(before);

    const real = await integrationAddIconSet('outline', {cwd: tmpDir});
    expect(real.data.files).toEqual(plan.data.files);
    expect(real.data.root).toEqual(plan.data.root);
  });

  it('refuses to overwrite an existing descriptor or data file', async () => {
    setup();
    await integrationAddIconSet('outline', {cwd: tmpDir});
    const doc = read('icon-sets/outline/outline.doc.mjs');
    await expect(
      integrationAddIconSet('outline', {cwd: tmpDir}),
    ).rejects.toMatchObject({code: 'ERR_FILE_EXISTS'});
    expect(read('icon-sets/outline/outline.doc.mjs')).toBe(doc);

    fs.mkdirSync(path.join(tmpDir, 'icon-sets/solid'));
    fs.writeFileSync(
      path.join(tmpDir, 'icon-sets/solid/solid.icons.json'),
      '{}',
    );
    await expect(
      integrationAddIconSet('solid', {cwd: tmpDir}),
    ).rejects.toMatchObject({code: 'ERR_FILE_EXISTS'});
    expect(
      fs.existsSync(path.join(tmpDir, 'icon-sets/solid/solid.doc.mjs')),
    ).toBe(false);
  });

  it('rolls back every write when the written set does not verify', async () => {
    // Another set under the root is invalid, but only the new set must
    // verify; an invalid neighbour does not block the write.
    setup();
    fs.mkdirSync(path.join(tmpDir, 'icon-sets/broken'), {recursive: true});
    const ok = await integrationAddIconSet('outline', {cwd: tmpDir});
    expect(ok.data.written).toBe(true);

    // A root that resolves to a file cannot hold a set: nothing is left behind.
    setup({manifest: "export default {iconSets: './taken'};\n"});
    fs.writeFileSync(path.join(tmpDir, 'taken'), 'not a directory');
    const pkgBefore = read('package.json');
    await expect(
      integrationAddIconSet('outline', {cwd: tmpDir}),
    ).rejects.toBeTruthy();
    expect(read('package.json')).toBe(pkgBefore);
    expect(read('taken')).toBe('not a directory');
  });

  it('rejects a name that is not lower-kebab, a root outside the package, and an unnamed package', async () => {
    setup();
    for (const bad of ['Outline', '../x', 'a_b', '']) {
      await expect(
        integrationAddIconSet(bad, {cwd: tmpDir}),
      ).rejects.toMatchObject({code: 'ERR_INVALID_ARGUMENT'});
    }
    setup({manifest: "export default {iconSets: '../outside'};\n"});
    await expect(
      integrationAddIconSet('outline', {cwd: tmpDir}),
    ).rejects.toMatchObject({code: 'ERR_PATH_TRAVERSAL'});
    setup({name: null});
    await expect(
      integrationAddIconSet('outline', {cwd: tmpDir}),
    ).rejects.toMatchObject({code: 'ERR_INVALID_ARGUMENT'});
  });

  it('refuses an option of another kind', async () => {
    setup();
    await expect(
      integrationAdd('icon-set', 'outline', {cwd: tmpDir, to: '1.0.0'}),
    ).rejects.toMatchObject({code: 'ERR_INVALID_ARGUMENT'});
  });
});
