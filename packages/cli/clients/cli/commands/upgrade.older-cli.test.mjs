// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx upgrade` with a CLI older than the installed Core: the human
 * output never says the code is up to date, warns once with the same upgrade
 * pinned to the CLI release that matches the Core, and keeps the exit status;
 * `--json` carries the same facts in `cliBehindCore`.
 */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {CLI_ROOT} from '../../../foundation/fs/paths.mjs';
import {
  getDlxPrefix,
  quoteCommandArgument,
} from '../../../foundation/env/package-manager.mjs';

const CLI_VERSION = JSON.parse(
  fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf8'),
).version;
const [MAJOR, MINOR] = CLI_VERSION.split('.').map(Number);
const NEWER_CORE = `${MAJOR}.${MINOR + 1}.0`;
const NON_ASCII = /[\u0080-\uFFFF]/;

let tmpDir;

/** @param {string} rel @param {string} body */
function write(rel, body) {
  const file = path.join(tmpDir, rel);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, body);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-upgrade-older-cli-'));
  write('package.json', JSON.stringify({name: 'consumer', private: true}));
  write(
    'node_modules/@astryxdesign/core/package.json',
    JSON.stringify({name: '@astryxdesign/core', version: NEWER_CORE}),
  );
  write('src/index.ts', 'export const x = 1;\n');
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * The pinned command the CLI prints for this project. It names the source
 * directory as the CLI resolved it, from the folder it ran in.
 * @param {...string} rest the arguments after `--path <dir>`
 */
function pinned(...rest) {
  const src = path.join(fs.realpathSync(tmpDir), 'src');
  return [
    getDlxPrefix(tmpDir),
    `@astryxdesign/cli@${NEWER_CORE}`,
    'upgrade',
    '--from',
    CLI_VERSION,
    '--path',
    quoteCommandArgument(src),
    ...rest,
  ].join(' ');
}

describe('astryx upgrade with a CLI older than the installed Core', () => {
  it('says it cannot finish and prints the upgrade pinned to the matching CLI', async () => {
    const r = await runCli(['upgrade', '--from', CLI_VERSION, '--apply'], {
      cwd: tmpDir,
    });
    const output = `${r.stdout}\n${r.stderr}`;

    expect(r.status).toBe(0);
    expect(output).not.toMatch(/up to date/i);
    expect(output).not.toContain('No codemods available');
    expect(r.stderr).toContain(
      `This CLI (${CLI_VERSION}) is older than the installed @astryxdesign/core (${NEWER_CORE})`,
    );
    // The command has a line of its own, so it copies exactly.
    expect(r.stderr).toContain(
      `the CLI that matches your Core:\n  ${pinned('--apply')}\n`,
    );
    expect(r.stdout.trim().split('\n').at(-1)).toBe('Upgrade incomplete');
    expect(output.split('\n').filter(line => NON_ASCII.test(line))).toEqual([]);
  });

  it('carries cliBehindCore in --json with the same exit status', async () => {
    const r = await runCli(['--json', 'upgrade', '--from', CLI_VERSION], {
      cwd: tmpDir,
    });
    const parsed = JSON.parse(r.stdout);

    expect(r.status).toBe(0);
    expect(parsed.type).toBe('upgrade.status');
    expect(parsed.data.status).toBe('no_codemods');
    expect(parsed.data.cliBehindCore).toEqual({
      cliVersion: CLI_VERSION,
      command: pinned(),
    });
  });
});
