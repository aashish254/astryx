// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx discover` and the official list the CLI carries
 * (spec:AST-051 FR10), in projects with no discover source of their own.
 *
 * A fresh app sees the official Astryx packages it could add, and a declared
 * official theme counts as installed. In a project that loads no integration
 * and has no source of its own, every query still answers with the list (FR1);
 * a project that loads an integration gets package pages and search, where an
 * official theme is added at a pinned version and then with `theme add`.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {fileURLToPath} from 'node:url';
import {runCli} from '../../../test-utils/run-cli.mjs';

const CLI_VERSION = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../package.json',
    ),
    'utf8',
  ),
).version;

let tmpDir;
let project;

/** @param {object} [fields] */
function writeProject(fields = {}) {
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({name: 'my-app', version: '1.0.0', ...fields}),
  );
}

/** @param {string} name @param {string} version */
function install(name, version) {
  const dir = path.join(project, 'node_modules', ...name.split('/'));
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name, version}),
  );
}

/** A configured integration, so discover answers queries. */
function addIntegration() {
  const pkg = path.join(project, 'node_modules', '@acme', 'ui');
  fs.mkdirSync(path.join(pkg, 'components'), {recursive: true});
  fs.writeFileSync(
    path.join(pkg, 'package.json'),
    '{"name":"@acme/ui","version":"1.0.0","type":"module"}',
  );
  fs.writeFileSync(
    path.join(pkg, 'astryx.integration.mjs'),
    "export default {components: './components'};\n",
  );
  fs.writeFileSync(
    path.join(pkg, 'components', 'Widget.doc.mjs'),
    'export const doc = {type: "component", name: "Widget", description: "A widget"};\n',
  );
  fs.writeFileSync(
    path.join(pkg, 'components', 'Widget.tsx'),
    'export function Widget() { return null; }\n',
  );
  writeProject({type: 'module'});
  fs.writeFileSync(
    path.join(project, 'astryx.config.mjs'),
    "export default {integrations: ['@acme/ui']};\n",
  );
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-discover-nosource-'));
  project = path.join(tmpDir, 'project');
  fs.mkdirSync(project, {recursive: true});
  writeProject();
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('astryx discover in a project with nothing of its own', () => {
  it('lists the official packages it could add, named as from Astryx', async () => {
    const {status, stdout} = await runCli(['discover', '--available'], {
      cwd: project,
    });

    expect(status).toBe(0);
    expect(stdout).toMatch(/^Available$/m);
    expect(stdout).toMatch(/^from Astryx$/m);
    expect(stdout).toMatch(/^name:\s+@astryxdesign\/theme-neutral$/m);
    expect(stdout).toMatch(/^source:\s+Astryx$/m);
  });

  it('keeps the list with meta.configured=false, and reports the official list in meta.sources', async () => {
    const {status, stdout} = await runCli(['discover', '--json'], {
      cwd: project,
    });

    expect(status).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.type).toBe('discover.list');
    expect(result.data).toEqual([]);
    expect(result.meta.configured).toBe(false);
    expect(result.meta.sources).toEqual([
      {
        name: 'Astryx',
        from: '@astryxdesign/cli',
        status: 'fresh',
        complete: true,
      },
    ]);
    expect(result.meta.available.length).toBeGreaterThan(0);
    for (const entry of result.meta.available) {
      expect(entry.source).toBe('Astryx');
      expect(entry.name.startsWith('@astryxdesign/')).toBe(true);
    }
    expect(result.meta.available).toContainEqual(
      expect.objectContaining({
        name: '@astryxdesign/theme-neutral',
        version: CLI_VERSION,
        themes: ['neutral'],
      }),
    );
  });

  it('answers every query with the list, and says why in text', async () => {
    for (const query of ['gothic', '@astryxdesign/theme-gothic', '   ']) {
      const asJson = await runCli(['discover', query, '--json'], {
        cwd: project,
      });
      expect(asJson.status, query).toBe(0);
      expect(JSON.parse(asJson.stdout).type, query).toBe('discover.list');
    }

    const {stdout} = await runCli(['discover', 'gothic'], {cwd: project});
    expect(stdout).toContain(
      'This project loads no integration and has no discover source of its own, so discover lists everything instead of answering "gothic".',
    );
    expect(stdout).not.toContain('Usage:');
  });

  it('counts a declared official theme as installed, keeps meta.configured, and does not offer it again', async () => {
    writeProject({dependencies: {'@astryxdesign/theme-butter': CLI_VERSION}});
    install('@astryxdesign/theme-butter', '0.7.0');

    const {status, stdout} = await runCli(['discover', '--json'], {
      cwd: project,
    });

    expect(status).toBe(0);
    const {data, meta} = JSON.parse(stdout);
    expect(data).toEqual([
      expect.objectContaining({
        name: '@astryxdesign/theme-butter',
        version: '0.7.0',
        themes: ['butter'],
        latest: CLI_VERSION,
      }),
    ]);
    expect(meta.configured).toBe(false);
    expect(meta.available.map(entry => entry.name)).not.toContain(
      '@astryxdesign/theme-butter',
    );
  });
});

describe('astryx discover in a project that loads an integration', () => {
  beforeEach(addIntegration);

  it('lists official packages first among what it could add', async () => {
    const {status, stdout} = await runCli(['discover', '--json'], {
      cwd: project,
    });
    expect(status).toBe(0);
    const {data, meta} = JSON.parse(stdout);
    expect(data.map(entry => entry.name)).toEqual(['@acme/ui']);
    expect(meta.available[0].source).toBe('Astryx');
  });

  it('adds a theme package at the version shown, then points to theme add', async () => {
    const {status, stdout} = await runCli(
      ['discover', '@astryxdesign/theme-gothic'],
      {cwd: project},
    );

    expect(status).toBe(0);
    expect(stdout).toMatch(/^installed:\s+false$/m);
    expect(stdout).toContain(`@astryxdesign/theme-gothic@${CLI_VERSION}`);
    expect(stdout).toContain('Then use its theme:');
    expect(stdout).toMatch(/theme add gothic$/m);
    expect(stdout).not.toContain('Astryx loads an integration');
  });

  it("pins the project's Core version for a theme released with Core", async () => {
    install('@astryxdesign/core', '0.6.8');

    const {status, stdout} = await runCli(
      ['discover', '@astryxdesign/theme-gothic', '--json'],
      {cwd: project},
    );

    expect(status).toBe(0);
    expect(JSON.parse(stdout).data.install).toMatch(
      / @astryxdesign\/theme-gothic@0\.6\.8$/,
    );
  });

  it('shows a declared official theme as installed on its page', async () => {
    writeProject({
      type: 'module',
      dependencies: {'@astryxdesign/theme-butter': CLI_VERSION},
    });
    install('@astryxdesign/theme-butter', '0.7.0');

    const page = await runCli(
      ['discover', '@astryxdesign/theme-butter', '--json'],
      {cwd: project},
    );
    expect(page.status).toBe(0);
    const {data} = JSON.parse(page.stdout);
    expect(data).toMatchObject({installed: true, version: '0.7.0'});
    expect(data).not.toHaveProperty('install');
  });

  it('finds an official theme by name', async () => {
    const {status, stdout} = await runCli(['discover', 'gothic', '--json'], {
      cwd: project,
    });

    expect(status).toBe(0);
    expect(JSON.parse(stdout).data.matches).toContainEqual(
      expect.objectContaining({
        package: '@astryxdesign/theme-gothic',
        component: 'gothic',
        kind: 'theme',
        installed: false,
      }),
    );
  });
});
