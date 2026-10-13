// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {findCoreDir, findProjectRoot, listComponents, discoverExternalPackages, existsCaseExact, findInstalledPackage, findInstalledPackageOf, findNodeModulesPackage} from './paths.mjs';

let tmpDir;

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-paths-test-'));
}

beforeEach(() => {
  tmpDir = makeTmpDir();
});

afterEach(() => {
  delete process.versions.pnp;
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * Write a package.json naming `name` into `dir`, creating the folder.
 * @param {string} dir @param {string} name @param {string} [version]
 */
function writePackage(dir, name, version = '0.7.0') {
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name, version}));
  return dir;
}

/** @param {string} root @param {string} name @param {string} version */
function install(root, name, version) {
  return writePackage(path.join(root, 'node_modules', ...name.split('/')), name, version);
}

/**
 * Stand in for the runtime a Yarn Plug'n'Play process exposes:
 * `process.versions.pnp` plus a requirable `pnpapi`. The packages themselves
 * live outside any node_modules, the way Yarn stores them. The top-level
 * afterEach removes `process.versions.pnp` again.
 * @param {Record<string, string>} resolved name -> package directory
 * @returns {string} a project folder inside the PnP runtime
 */
function withPnp(resolved) {
  const runtime = path.join(tmpDir, 'runtime');
  const api = path.join(runtime, 'node_modules', 'pnpapi');
  fs.mkdirSync(api, {recursive: true});
  fs.writeFileSync(
    path.join(api, 'package.json'),
    JSON.stringify({name: 'pnpapi', version: '1.0.0', main: 'index.js'}),
  );
  fs.writeFileSync(
    path.join(api, 'index.js'),
    `const resolved = ${JSON.stringify(resolved)};\n` +
      'module.exports = {\n' +
      '  resolveToUnqualified(name) {\n' +
      '    if (!(name in resolved)) {\n' +
      "      const e = new Error(name); e.code = 'MODULE_NOT_FOUND'; throw e;\n" +
      '    }\n' +
      '    return resolved[name];\n' +
      '  },\n' +
      '};\n',
  );
  Object.defineProperty(process.versions, 'pnp', {
    value: '3',
    configurable: true,
  });
  return runtime;
}

describe('findCoreDir', () => {
  it('finds packages/core walking up directories', () => {
    const coreDir = writePackage(path.join(tmpDir, 'packages', 'core'), '@astryxdesign/core');

    const nested = path.join(tmpDir, 'sub', 'deep');
    fs.mkdirSync(nested, {recursive: true});

    expect(findCoreDir(nested)).toBe(coreDir);
  });

  it('finds node_modules/@astryxdesign/core fallback', () => {
    const nmCore = install(tmpDir, '@astryxdesign/core', '0.7.0');

    expect(findCoreDir(tmpDir)).toBe(nmCore);
  });

  it('returns null when nothing found', () => {
    expect(findCoreDir(tmpDir)).toBeNull();
  });

  // A route folder such as src/app/(shop)/orders/[id]/edit sits six folders
  // below the project root, where Core is installed.
  it('finds Core from any depth below the folder that installs it', () => {
    const nmCore = install(tmpDir, '@astryxdesign/core', '0.7.0');
    const route = path.join(tmpDir, 'src', 'app', '(shop)', 'orders', '[id]', 'edit');
    fs.mkdirSync(route, {recursive: true});

    expect(findCoreDir(route)).toBe(nmCore);
  });

  it('skips a packages/core folder that holds another package', () => {
    writePackage(path.join(tmpDir, 'packages', 'core'), '@acme/core', '1.0.0');
    const app = path.join(tmpDir, 'apps', 'web');
    fs.mkdirSync(app, {recursive: true});

    expect(findCoreDir(app)).toBeNull();

    const nmCore = install(tmpDir, '@astryxdesign/core', '0.7.0');
    expect(findCoreDir(app)).toBe(nmCore);
  });

  it('skips a node_modules/@astryxdesign/core folder with no package.json', () => {
    fs.mkdirSync(path.join(tmpDir, 'node_modules', '@astryxdesign', 'core'), {recursive: true});

    expect(findCoreDir(tmpDir)).toBeNull();
  });

  it("asks Yarn Plug'n'Play when no folder holds Core", () => {
    const store = writePackage(path.join(tmpDir, 'store', '@astryxdesign-core'), '@astryxdesign/core');
    const project = withPnp({'@astryxdesign/core': store});

    expect(findCoreDir(project)).toBe(store);
  });
});

describe('findInstalledPackage', () => {
  it('finds a package in the node_modules chain above startDir', () => {
    const installed = install(tmpDir, '@astryxdesign/core', '0.6.0');
    const nested = path.join(tmpDir, 'src', 'deep');
    fs.mkdirSync(nested, {recursive: true});

    expect(findInstalledPackage(nested, '@astryxdesign/core')).toBe(installed);
  });

  it('finds a package any number of folders above startDir', () => {
    const installed = install(tmpDir, '@astryxdesign/core', '0.7.0');
    const deep = path.join(tmpDir, 'apps', 'web', 'src', 'app', '(shop)', 'orders', '[id]');
    fs.mkdirSync(deep, {recursive: true});

    expect(findInstalledPackage(deep, '@astryxdesign/core')).toBe(installed);
  });

  it('reports a package the project never installed as missing', () => {
    expect(findInstalledPackage(tmpDir, '@astryxdesign/core')).toBeNull();
  });

  // The regression this lookup exists for: `require.resolve` folds NODE_PATH in
  // even when `paths` is given, so a package reachable only from the ambient
  // environment read as installed in the user's project.
  it('does not answer from a package that is only on NODE_PATH', () => {
    const ambient = path.join(tmpDir, 'ambient');
    install(ambient, '@astryxdesign/core', '0.6.0');
    const project = path.join(tmpDir, 'project');
    fs.mkdirSync(project, {recursive: true});

    const previous = process.env.NODE_PATH;
    process.env.NODE_PATH = path.join(ambient, 'node_modules');
    try {
      expect(findInstalledPackage(project, '@astryxdesign/core')).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.NODE_PATH;
      else process.env.NODE_PATH = previous;
    }
  });

  describe('under Yarn Plug\'n\'Play, which has no node_modules', () => {
    it('falls back to the PnP runtime when there is no chain to walk', () => {
      const store = path.join(tmpDir, 'store', '@astryxdesign-core');
      fs.mkdirSync(store, {recursive: true});
      fs.writeFileSync(
        path.join(store, 'package.json'),
        JSON.stringify({name: '@astryxdesign/core', version: '0.6.0'}),
      );
      const project = withPnp({'@astryxdesign/core': store});

      expect(findInstalledPackage(project, '@astryxdesign/core')).toBe(store);
    });

    it('still reports a package the PnP project never declared', () => {
      const project = withPnp({});

      expect(findInstalledPackage(project, '@astryxdesign/core')).toBeNull();
    });
  });
});

describe('findInstalledPackageOf', () => {
  const NAMES = ['@astryxdesign/core', '@xds/core'];

  it('takes the earlier name when one folder installs both', () => {
    const current = install(tmpDir, '@astryxdesign/core', '0.7.0');
    install(tmpDir, '@xds/core', '0.3.0');

    expect(findInstalledPackageOf(tmpDir, NAMES)).toEqual({name: '@astryxdesign/core', packageDir: current});
  });

  it('takes the nearest folder over an earlier name further up', () => {
    install(tmpDir, '@astryxdesign/core', '0.7.0');
    const app = path.join(tmpDir, 'apps', 'legacy');
    const legacy = install(app, '@xds/core', '0.3.0');

    expect(findInstalledPackageOf(app, NAMES)).toEqual({name: '@xds/core', packageDir: legacy});
  });

  it('returns null when none is installed', () => {
    expect(findInstalledPackageOf(tmpDir, NAMES)).toBeNull();
  });
});

describe('findNodeModulesPackage', () => {
  it('finds a package hoisted to a workspace root and names the folder that holds it', () => {
    const hoisted = install(tmpDir, '@acme/widgets', '1.0.0');
    const member = path.join(tmpDir, 'apps', 'web');
    fs.mkdirSync(member, {recursive: true});

    expect(findNodeModulesPackage(member, '@acme/widgets')).toEqual({packageDir: hoisted, hostDir: tmpDir});
  });

  it('does not ask Plug\'n\'Play', () => {
    const store = writePackage(path.join(tmpDir, 'store', 'acme-widgets'), '@acme/widgets');
    const project = withPnp({'@acme/widgets': store});

    expect(findNodeModulesPackage(project, '@acme/widgets')).toBeNull();
  });
});

describe('findProjectRoot', () => {
  it('finds root with workspaces in package.json', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: 'root', workspaces: ['packages/*']}),
    );

    const nested = path.join(tmpDir, 'packages', 'foo');
    fs.mkdirSync(nested, {recursive: true});

    expect(findProjectRoot(nested)).toBe(tmpDir);
  });

  it('returns null when no workspaces found', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({name: 'no-workspaces'}),
    );

    expect(findProjectRoot(tmpDir)).toBeNull();
  });
});

describe('discoverExternalPackages', () => {
  it('finds packages with an "astryx" field in package.json', () => {
    const nm = path.join(tmpDir, 'node_modules');
    const extDir = path.join(nm, 'astryx-charts');
    fs.mkdirSync(extDir, {recursive: true});
    fs.writeFileSync(
      path.join(extDir, 'package.json'),
      JSON.stringify({
        name: 'astryx-charts',
        astryx: {docs: './src', category: 'Data Viz'},
      }),
    );

    const result = discoverExternalPackages(tmpDir);
    expect(result).toEqual([
      {
        name: 'astryx-charts',
        category: 'Data Viz',
        docsDir: path.join(extDir, 'src'),
        blocksDir: null,
      },
    ]);
  });

  it('handles scoped packages (@org/pkg)', () => {
    const nm = path.join(tmpDir, 'node_modules');
    const scopedDir = path.join(nm, '@acme', 'astryx-widgets');
    fs.mkdirSync(scopedDir, {recursive: true});
    fs.writeFileSync(
      path.join(scopedDir, 'package.json'),
      JSON.stringify({
        name: '@acme/astryx-widgets',
        astryx: {docs: './lib', category: 'Widgets'},
      }),
    );

    const result = discoverExternalPackages(tmpDir);
    expect(result).toEqual([
      {
        name: '@acme/astryx-widgets',
        category: 'Widgets',
        docsDir: path.join(scopedDir, 'lib'),
        blocksDir: null,
      },
    ]);
  });

  it('skips @astryxdesign/core', () => {
    const nm = path.join(tmpDir, 'node_modules');
    const coreDir = path.join(nm, '@astryxdesign', 'core');
    fs.mkdirSync(coreDir, {recursive: true});
    fs.writeFileSync(
      path.join(coreDir, 'package.json'),
      JSON.stringify({
        name: '@astryxdesign/core',
        astryx: {docs: './src'},
      }),
    );

    const result = discoverExternalPackages(tmpDir);
    expect(result).toEqual([]);
  });

  it('skips packages without "astryx" field', () => {
    const nm = path.join(tmpDir, 'node_modules');
    const extDir = path.join(nm, 'some-lib');
    fs.mkdirSync(extDir, {recursive: true});
    fs.writeFileSync(
      path.join(extDir, 'package.json'),
      JSON.stringify({name: 'some-lib'}),
    );

    const result = discoverExternalPackages(tmpDir);
    expect(result).toEqual([]);
  });

  it('defaults category to package name when not specified', () => {
    const nm = path.join(tmpDir, 'node_modules');
    const extDir = path.join(nm, 'my-components');
    fs.mkdirSync(extDir, {recursive: true});
    fs.writeFileSync(
      path.join(extDir, 'package.json'),
      JSON.stringify({
        name: 'my-components',
        astryx: {docs: './docs'},
      }),
    );

    const result = discoverExternalPackages(tmpDir);
    expect(result[0].category).toBe('my-components');
  });

  it('returns empty array when no node_modules found', () => {
    const result = discoverExternalPackages(tmpDir);
    expect(result).toEqual([]);
  });

  it('walks up directories to find node_modules', () => {
    const nm = path.join(tmpDir, 'node_modules');
    const extDir = path.join(nm, 'astryx-ext');
    fs.mkdirSync(extDir, {recursive: true});
    fs.writeFileSync(
      path.join(extDir, 'package.json'),
      JSON.stringify({
        name: 'astryx-ext',
        astryx: {docs: './src'},
      }),
    );

    const nested = path.join(tmpDir, 'packages', 'app');
    fs.mkdirSync(nested, {recursive: true});

    const result = discoverExternalPackages(nested);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('astryx-ext');
  });

  it('handles invalid JSON in package.json gracefully', () => {
    const nm = path.join(tmpDir, 'node_modules');
    const extDir = path.join(nm, 'bad-json');
    fs.mkdirSync(extDir, {recursive: true});
    fs.writeFileSync(path.join(extDir, 'package.json'), '{not valid json!!!');

    const result = discoverExternalPackages(tmpDir);
    expect(result).toEqual([]);
  });
});

describe('listComponents', () => {
  it('returns sorted component directory names, skipping hooks/theme/utils', () => {
    const srcDir = path.join(tmpDir, 'src');
    for (const dir of ['Button', 'Avatar', 'hooks', 'theme', 'utils', 'Zebra']) {
      fs.mkdirSync(path.join(srcDir, dir), {recursive: true});
    }

    const result = listComponents(tmpDir);
    expect(result).toEqual(['Avatar', 'Button', 'Zebra']);
  });

  it('returns empty array when src dir is missing', () => {
    expect(listComponents(tmpDir)).toEqual([]);
  });
});

describe('existsCaseExact', () => {
  it('accepts the real spelling and rejects a case variant of the file', () => {
    fs.writeFileSync(path.join(tmpDir, 'Button.doc.mjs'), '');

    expect(existsCaseExact(path.join(tmpDir, 'Button.doc.mjs'), tmpDir)).toBe(true);
    expect(existsCaseExact(path.join(tmpDir, 'button.doc.mjs'), tmpDir)).toBe(false);
    expect(existsCaseExact(path.join(tmpDir, 'BUTTON.DOC.MJS'), tmpDir)).toBe(false);
  });

  it('checks every segment below the root, not just the basename', () => {
    const dir = path.join(tmpDir, 'src', 'Button');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'Button.doc.mjs'), '');

    expect(existsCaseExact(path.join(tmpDir, 'src', 'Button', 'Button.doc.mjs'), tmpDir)).toBe(true);
    expect(existsCaseExact(path.join(tmpDir, 'src', 'button', 'Button.doc.mjs'), tmpDir)).toBe(false);
  });

  it('returns false for a missing path, and true for the root itself', () => {
    expect(existsCaseExact(path.join(tmpDir, 'nope.mjs'), tmpDir)).toBe(false);
    expect(existsCaseExact(tmpDir, tmpDir)).toBe(true);
  });

  it('refuses a target outside the root', () => {
    expect(existsCaseExact(os.tmpdir(), tmpDir)).toBe(false);
  });
});
