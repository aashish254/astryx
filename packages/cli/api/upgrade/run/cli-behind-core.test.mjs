// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Core codemods ship inside the CLI, so a CLI older than the installed
 * Core has none for the releases after its own version. Every result past the
 * up-to-date exit says so in `cliBehindCore`, with the same upgrade pinned to
 * the CLI release that matches the Core; a CLI that covers the range returns
 * what it always did.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {upgrade} from '../upgrade.mjs';
import {CLI_ROOT} from '../../../foundation/fs/paths.mjs';
import {getDlxPrefix} from '../../../foundation/env/package-manager.mjs';

const SLOW = 30_000;

const CLI_VERSION = JSON.parse(
  fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8'),
).version;
const [MAJOR, MINOR] = CLI_VERSION.split('.').map(Number);
/** A Core release after this CLI: it has no codemods for it. */
const NEWER_CORE = `${MAJOR}.${MINOR + 1}.0`;

/** A source file a 0.7.0 codemod rewrites (`emptySearchResultsText`). */
const TYPEAHEAD_SOURCE =
  "import {Typeahead} from '@astryxdesign/core';\n" +
  'export const x = <Typeahead emptySearchResultsText="None" />;\n';

let dir;

/** @param {string} version @param {string} [packageName] */
function installCore(version, packageName = '@astryxdesign/core') {
  const core = path.join(dir, 'node_modules', ...packageName.split('/'));
  fs.mkdirSync(core, {recursive: true});
  fs.writeFileSync(
    path.join(core, 'package.json'),
    JSON.stringify({name: packageName, version}),
  );
}

/** @param {string} rel @param {string} body */
function write(rel, body) {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, body);
}

/** The pinned command for this project, as the CLI prints it. */
function pinned(args) {
  return `${getDlxPrefix(dir)} @astryxdesign/cli@${NEWER_CORE} upgrade ${args}`;
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'upg-cli-behind-'));
  write('package.json', JSON.stringify({name: 'consumer', version: '1.0.0'}));
  write('src/index.tsx', TYPEAHEAD_SOURCE);
});

afterEach(() => fs.rmSync(dir, {recursive: true, force: true}));

describe('a CLI older than the installed Core', {timeout: SLOW}, () => {
  // The defect: the range past this CLI has no codemods here, so the run
  // reported `no_codemods` (and "already up to date") and exited 0, while the
  // project still needed the newer releases' migrations.
  it('marks a range this CLI has no codemods for, and names the CLI that does', async () => {
    installCore(NEWER_CORE);

    const res = await upgrade({from: CLI_VERSION, apply: true}, {cwd: dir});

    expect(res.type).toBe('upgrade.status');
    expect(res.data.status).toBe('no_codemods');
    expect(res.data.cliBehindCore).toEqual({
      cliVersion: CLI_VERSION,
      command: pinned(`--from ${CLI_VERSION} --apply`),
    });
  });

  it('runs the codemods it has for a range it covers only in part, and marks the rest', async () => {
    installCore(NEWER_CORE);

    const res = await upgrade({from: '0.6.8', apply: true}, {cwd: dir});

    expect(res.type).toBe('upgrade.run');
    expect(res.data.codemods).toBeGreaterThan(0);
    expect(fs.readFileSync(path.join(dir, 'src/index.tsx'), 'utf8')).toContain(
      'emptySearchText="None"',
    );
    expect(res.data.cliBehindCore).toEqual({
      cliVersion: CLI_VERSION,
      command: pinned('--from 0.6.8 --apply'),
    });
  });

  it('repeats the invocation in the pinned command', async () => {
    installCore(NEWER_CORE);
    write('my src/index.tsx', TYPEAHEAD_SOURCE);

    const res = await upgrade(
      {
        from: CLI_VERSION,
        path: 'my src',
        codemod: 'only-this',
        skipCodemod: ['first', 'second'],
        force: true,
      },
      {cwd: dir},
    );

    expect(res.data.cliBehindCore?.command).toBe(
      pinned(
        `--from ${CLI_VERSION} --path "my src" --codemod only-this ` +
          '--skip-codemod first --skip-codemod second --force',
      ),
    );
  });
});

describe('a CLI that covers the range', {timeout: SLOW}, () => {
  it('adds nothing when the installed Core is this CLI release', async () => {
    installCore(CLI_VERSION);

    const res = await upgrade({from: '0.6.8'}, {cwd: dir});

    expect(res.type).toBe('upgrade.run');
    expect('cliBehindCore' in res.data).toBe(false);
  });

  it('adds nothing when --from is already the installed Core', async () => {
    installCore(NEWER_CORE);

    const res = await upgrade({from: NEWER_CORE}, {cwd: dir});

    expect(res.data.status).toBe('up_to_date');
    expect('cliBehindCore' in res.data).toBe(false);

    const forced = await upgrade({from: NEWER_CORE, force: true}, {cwd: dir});

    expect(forced.data.status).toBe('no_codemods');
    expect('cliBehindCore' in forced.data).toBe(false);
  });

  it('adds nothing for legacy @xds/core, which shares no version with a CLI release', async () => {
    installCore(NEWER_CORE, '@xds/core');

    const res = await upgrade({from: CLI_VERSION}, {cwd: dir});

    expect(res.data.status).toBe('no_codemods');
    expect('cliBehindCore' in res.data).toBe(false);
  });
});
