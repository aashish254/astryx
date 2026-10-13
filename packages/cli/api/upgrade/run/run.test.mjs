// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated tests for the upgrade.run leaf — the --path scan dir must be
 * confined to cwd (upgrade rewrites source in place with --apply, so an escaping
 * or out-of-tree path must be rejected), the receipt must say whether that
 * dir existed at all, a run from any folder in a project upgrades that
 * project, and the target Core is the project's own.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {upgrade} from '../upgrade.mjs';
import {generateCompressedIndex} from '../../../foundation/agent-docs/agent-docs.mjs';

const SLOW = 30_000;

function seedProject(dir) {
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name: 'x', version: '1.0.0', dependencies: {'@astryxdesign/core': '0.1.8'}}),
  );
  const core = path.join(dir, 'node_modules', '@astryxdesign', 'core');
  fs.mkdirSync(core, {recursive: true});
  fs.writeFileSync(path.join(core, 'package.json'), JSON.stringify({name: '@astryxdesign/core', version: '0.1.8'}));
  fs.mkdirSync(path.join(dir, 'src'), {recursive: true});
  fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'const x = 1;\n');
}

describe('upgrade.run — --path confinement', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upg-path-'));
    seedProject(dir);
  });
  afterEach(() => fs.rmSync(dir, {recursive: true, force: true}));

  it('accepts a normal in-tree --path (dry run)', async () => {
    const res = await upgrade({from: '0.0.1', path: 'src'}, {cwd: dir});
    expect(res.type).toBe('upgrade.run');
  }, SLOW);

  it('rejects a ../-escaping --path with ERR_PATH_TRAVERSAL', async () => {
    await expect(
      upgrade({from: '0.0.1', path: '../../../../etc'}, {cwd: dir}),
    ).rejects.toMatchObject({code: 'ERR_PATH_TRAVERSAL'});
  }, SLOW);

  it('rejects an absolute --path outside cwd with ERR_PATH_TRAVERSAL', async () => {
    await expect(
      upgrade({from: '0.0.1', path: os.tmpdir()}, {cwd: dir}),
    ).rejects.toMatchObject({code: 'ERR_PATH_TRAVERSAL'});
  }, SLOW);
});

describe('upgrade.run — sourcePathFound', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upg-srcpath-'));
    seedProject(dir);
  });
  afterEach(() => fs.rmSync(dir, {recursive: true, force: true}));

  // The receipt for a project whose source lives somewhere other than ./src was
  // byte-identical to a fully migrated one: exit 0, filesChanged 0, errors [].
  // The only signal was a human log line --json suppresses by design.
  it('reports false when the resolved source directory is missing, and still counts nothing', async () => {
    fs.rmSync(path.join(dir, 'src'), {recursive: true, force: true});
    fs.mkdirSync(path.join(dir, 'app'), {recursive: true});
    fs.writeFileSync(path.join(dir, 'app', 'index.ts'), 'const x = 1;\n');

    const res = await upgrade({from: '0.0.1', apply: true}, {cwd: dir});

    expect(res.type).toBe('upgrade.run');
    expect(res.data.sourcePathFound).toBe(false);
    expect(res.data.filesChanged).toBe(0);
    expect(res.data.errors).toEqual([]);
  }, SLOW);

  it('reports true for a source directory that exists', async () => {
    const res = await upgrade({from: '0.0.1', apply: true}, {cwd: dir});

    expect(res.type).toBe('upgrade.run');
    expect(res.data.sourcePathFound).toBe(true);
  }, SLOW);

  it('follows --path, so the right directory under another name reports true', async () => {
    fs.rmSync(path.join(dir, 'src'), {recursive: true, force: true});
    fs.mkdirSync(path.join(dir, 'app'), {recursive: true});
    fs.writeFileSync(path.join(dir, 'app', 'index.ts'), 'const x = 1;\n');

    const res = await upgrade({from: '0.0.1', path: 'app'}, {cwd: dir});

    expect(res.type).toBe('upgrade.run');
    expect(res.data.sourcePathFound).toBe(true);
  }, SLOW);
});

describe('upgrade.run — the installed Core is found from any folder in the project', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upg-core-'));
    seedProject(dir);
  });
  afterEach(() => fs.rmSync(dir, {recursive: true, force: true}));

  it('targets the project Core when run from a subfolder', async () => {
    const res = await upgrade({from: '0.0.1', path: '.'}, {cwd: path.join(dir, 'src')});

    expect(res.type).toBe('upgrade.run');
    expect(res.data.to).toBe('0.1.8');
  }, SLOW);

  it('targets the Core a workspace hoisted to its root when run in a member', async () => {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({name: 'root', private: true, workspaces: ['apps/*']}),
    );
    const member = path.join(dir, 'apps', 'web');
    fs.mkdirSync(path.join(member, 'src'), {recursive: true});
    fs.writeFileSync(
      path.join(member, 'package.json'),
      JSON.stringify({name: 'web', dependencies: {'@astryxdesign/core': '0.1.8'}}),
    );
    fs.writeFileSync(path.join(member, 'src', 'index.ts'), 'const x = 1;\n');

    const res = await upgrade({from: '0.0.1'}, {cwd: member});

    expect(res.type).toBe('upgrade.run');
    expect(res.data.to).toBe('0.1.8');
    expect(res.data.sourcePathFound).toBe(true);
  }, SLOW);
});

/** Core 0.7.0 renamed this prop; its codemod renames it on Typeahead. */
const OLD_PROP_SOURCE =
  "import {Typeahead} from '@astryxdesign/core';\n" +
  'export const App = () => <Typeahead label="Fruit" emptySearchResultsText="None" />;\n';

/**
 * A project with Core 0.7.0 installed and src/App.tsx using a prop that 0.7.0
 * renamed.
 * @param {string} dir
 */
function seedOldPropProject(dir) {
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name: 'app', dependencies: {'@astryxdesign/core': '0.7.0'}}),
  );
  const core = path.join(dir, 'node_modules', '@astryxdesign', 'core');
  fs.mkdirSync(core, {recursive: true});
  fs.writeFileSync(path.join(core, 'package.json'), JSON.stringify({name: '@astryxdesign/core', version: '0.7.0'}));
  fs.mkdirSync(path.join(dir, 'src', 'l1', 'l2'), {recursive: true});
  fs.writeFileSync(path.join(dir, 'src', 'App.tsx'), OLD_PROP_SOURCE);
}

describe('upgrade.run — a run from a subfolder upgrades the project', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upg-scope-'));
    seedOldPropProject(dir);
  });
  afterEach(() => fs.rmSync(dir, {recursive: true, force: true}));

  const appSource = () => fs.readFileSync(path.join(dir, 'src', 'App.tsx'), 'utf-8');

  it.each([['src'], ['src/l1/l2']])(
    'scans the project src by default when run from %s',
    async folder => {
      const res = await upgrade({from: '0.6.8', apply: true}, {cwd: path.join(dir, folder)});

      expect(res.type).toBe('upgrade.run');
      expect(res.data.sourcePathFound).toBe(true);
      expect(res.data.filesChanged).toBe(1);
      expect(res.data.modifiedFiles).toEqual(['src/App.tsx']);
      expect(appSource()).toContain('emptySearchText="None"');
    },
    SLOW,
  );

  it('reads a path you name relative to the folder you ran in', async () => {
    const res = await upgrade({from: '0.6.8', path: '../..', apply: true}, {cwd: path.join(dir, 'src', 'l1', 'l2')});

    expect(res.type).toBe('upgrade.run');
    expect(res.data.filesChanged).toBe(1);
    expect(appSource()).toContain('emptySearchText="None"');
  }, SLOW);

  it('still rejects a path outside the project', async () => {
    await expect(
      upgrade({from: '0.6.8', path: '../../..'}, {cwd: path.join(dir, 'src', 'l1')}),
    ).rejects.toMatchObject({code: 'ERR_PATH_TRAVERSAL'});
    expect(appSource()).toBe(OLD_PROP_SOURCE);
  }, SLOW);

  it("refreshes the agent docs at the project root, not the folder it ran in", async () => {
    fs.writeFileSync(
      path.join(dir, 'AGENTS.md'),
      `# Agents\n\n${generateCompressedIndex('0.6.8')}\n`,
    );

    const res = await upgrade({from: '0.6.8', apply: true}, {cwd: path.join(dir, 'src', 'l1')});

    expect(res.type).toBe('upgrade.run');
    expect(res.data.agentDocs.action).toBe('refreshed');
    expect(res.data.agentDocs.files).toEqual(['AGENTS.md']);
    expect(fs.existsSync(path.join(dir, 'src', 'l1', 'AGENTS.md'))).toBe(false);
  }, SLOW);
});

describe("upgrade.run — the target Core is the project's own", () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upg-own-core-'));
    seedOldPropProject(dir);
  });
  afterEach(() => fs.rmSync(dir, {recursive: true, force: true}));

  /**
   * A project nested in `dir`, with src/App.tsx using the renamed prop.
   * @param {Record<string, string>} dependencies
   */
  function nestedProject(dependencies) {
    const nested = path.join(dir, 'apps', 'web');
    fs.mkdirSync(path.join(nested, 'src'), {recursive: true});
    fs.writeFileSync(path.join(nested, 'package.json'), JSON.stringify({name: 'web', dependencies}));
    fs.writeFileSync(path.join(nested, 'src', 'App.tsx'), OLD_PROP_SOURCE);
    return nested;
  }

  it.each([
    ['declares no Astryx package', {}],
    ['declares a Core it has not installed', {'@astryxdesign/core': '0.6.8'}],
  ])(
    'does not upgrade a project that %s to the Core of a folder above it, such as a home folder',
    async (_label, dependencies) => {
      const nested = nestedProject(dependencies);

      await expect(
        upgrade({from: '0.6.8', apply: true}, {cwd: nested}),
      ).rejects.toMatchObject({code: 'ERR_VERSION_DETECT'});
      expect(fs.readFileSync(path.join(nested, 'src', 'App.tsx'), 'utf-8')).toBe(OLD_PROP_SOURCE);
    },
    SLOW,
  );

  it('does not upgrade a workspace member to a hoisted Core it declares another version of', async () => {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({name: 'root', private: true, workspaces: ['apps/*']}),
    );
    const member = nestedProject({'@astryxdesign/core': '0.9.0'});

    await expect(
      upgrade({from: '0.6.8', apply: true}, {cwd: member}),
    ).rejects.toMatchObject({code: 'ERR_VERSION_DETECT'});
    expect(fs.readFileSync(path.join(member, 'src', 'App.tsx'), 'utf-8')).toBe(OLD_PROP_SOURCE);
  }, SLOW);
});
