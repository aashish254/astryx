// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Core codemods ship inside the CLI, so a CLI older than the installed
 * Core has none for the releases after its own version. Every result past the
 * up-to-date exit says so in `cliBehindCore`, with the same upgrade pinned to
 * the CLI release that matches the Core; a CLI that covers the range returns
 * what it always did. The pinned command names the directory the run scanned
 * as an absolute path, and the shell reads every argument back unchanged.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {upgrade} from '../upgrade.mjs';
import {CLI_ROOT} from '../../../foundation/fs/paths.mjs';
import {
  getDlxPrefix,
  quoteCommandArgument,
} from '../../../foundation/env/package-manager.mjs';

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

/**
 * The pinned command for this project, as the CLI prints it.
 * @param {...string} args the arguments after `upgrade`
 */
function pinned(...args) {
  return [
    getDlxPrefix(dir),
    `@astryxdesign/cli@${NEWER_CORE}`,
    'upgrade',
    ...args.map(arg => quoteCommandArgument(arg)),
  ].join(' ');
}

/** A stand-in for each package runner: prints the arguments the shell passed. */
const RUNNERS = ['npx', 'pnpm', 'yarn', 'bunx']
  .map(
    name =>
      `${name}() { "$0" -e 'process.stdout.write(JSON.stringify(process.argv.slice(1)))' -- "$@"; }`,
  )
  .join('; ');

/**
 * The arguments a POSIX shell passes when it runs `command`, from the pinned
 * CLI package on.
 * @param {string} command
 * @param {string} cwd the folder the shell runs in
 * @returns {string[]}
 */
function shellArguments(command, cwd) {
  const argv = JSON.parse(
    execFileSync(
      '/bin/sh',
      ['-c', `${RUNNERS}; ${command}`, process.execPath],
      {
        cwd,
        encoding: 'utf8',
      },
    ),
  );
  return argv.slice(argv.indexOf(`@astryxdesign/cli@${NEWER_CORE}`));
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
      command: pinned(
        '--from',
        CLI_VERSION,
        '--path',
        path.join(dir, 'src'),
        '--apply',
      ),
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
      command: pinned(
        '--from',
        '0.6.8',
        '--path',
        path.join(dir, 'src'),
        '--apply',
      ),
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
        '--from',
        CLI_VERSION,
        '--path',
        path.join(dir, 'my src'),
        '--codemod',
        'only-this',
        '--skip-codemod',
        'first',
        '--skip-codemod',
        'second',
        '--force',
      ),
    );
  });

  // A package runner can run the CLI somewhere other than where the command
  // was typed: Yarn 1 runs `yarn astryx` at the project root. A relative path
  // copied into the command then named another directory when the command ran
  // from the folder it was typed in.
  it('names the directory the run scanned as an absolute path', async () => {
    installCore(NEWER_CORE);
    write('app/index.tsx', TYPEAHEAD_SOURCE);

    for (const [given, scanned] of [
      [undefined, path.join(dir, 'src')],
      ['.', dir],
      ['app', path.join(dir, 'app')],
      ['./app/', path.join(dir, 'app')],
    ]) {
      const res = await upgrade(
        {from: CLI_VERSION, ...(given ? {path: given} : {})},
        {cwd: dir},
      );
      const command = /** @type {string} */ (res.data.cliBehindCore?.command);

      expect(command).toBe(pinned('--from', CLI_VERSION, '--path', scanned));
      if (process.platform !== 'win32') {
        const fromApp = shellArguments(command, path.join(dir, 'app'));
        expect(fromApp[fromApp.indexOf('--path') + 1]).toBe(scanned);
      }
    }
  });

  it.skipIf(process.platform === 'win32')(
    'quotes the command so a POSIX shell passes every argument unchanged',
    async () => {
      fs.rmSync(dir, {recursive: true, force: true});
      dir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'upg cost $5 `date` \'one\' "two" !x -'),
      );
      write(
        'package.json',
        JSON.stringify({name: 'consumer', version: '1.0.0'}),
      );
      write('src/index.tsx', TYPEAHEAD_SOURCE);
      installCore(NEWER_CORE);

      const res = await upgrade(
        {
          from: CLI_VERSION,
          skipCodemod: ["it's", 'a$b c'],
          apply: true,
        },
        {cwd: dir},
      );

      expect(
        shellArguments(
          /** @type {string} */ (res.data.cliBehindCore?.command),
          dir,
        ),
      ).toEqual([
        `@astryxdesign/cli@${NEWER_CORE}`,
        'upgrade',
        '--from',
        CLI_VERSION,
        '--path',
        path.join(dir, 'src'),
        '--skip-codemod',
        "it's",
        '--skip-codemod',
        'a$b c',
        '--apply',
      ]);
    },
  );
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
