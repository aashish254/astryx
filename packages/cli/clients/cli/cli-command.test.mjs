// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Every printed command starts with the project's CLI command: the door a host
 * sets, or the `cliCommand` a loaded integration declares. JSON keeps commands
 * bare.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {runCli} from '../../test-utils/run-cli.mjs';
import {runWithCliDoor} from '../../foundation/env/cli-command.mjs';

/** @type {string} */
let tmpDir;

beforeEach(() => {
  // Repo-local, so Vite permits importing the integration manifest.
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-cli-command-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * An app that installs one integration declaring `cliCommand`, with no
 * astryx.config: the integration is autolinked.
 * @param {string} cliCommand
 */
function appWithIntegration(cliCommand) {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'app', dependencies: {'@acme/x': '1.0.0'}}),
  );
  fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '<!-- ASTRYX:START -->\n');
  const pkg = path.join(tmpDir, 'node_modules', '@acme', 'x');
  fs.mkdirSync(pkg, {recursive: true});
  fs.writeFileSync(
    path.join(pkg, 'package.json'),
    JSON.stringify({name: '@acme/x', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(pkg, 'astryx.integration.mjs'),
    `export default ${JSON.stringify({cliCommand})};\n`,
  );
}

describe("an integration's cliCommand", () => {
  it('starts the hints of a command that never loads the project itself', async () => {
    appWithIntegration('acme astryx');
    const {status, stderr} = await runCli(['theme', 'remove', 'nope'], tmpDir);
    expect(status).toBe(1);
    expect(stderr).toContain('`acme astryx theme add nope`');
  });
});

describe("a host's door", () => {
  it('prefixes doc commands in text and leaves them bare in JSON', async () => {
    const text = await runWithCliDoor('acme astryx', () =>
      runCli(['docs', 'getting-started', '--full']),
    );
    expect(text.stdout).toContain('acme astryx init');

    const json = await runWithCliDoor('acme astryx', () =>
      runCli(['docs', 'getting-started', '--json']),
    );
    expect(json.stdout).toContain('astryx init');
    expect(json.stdout).not.toContain('acme astryx');
  });

  it('prefixes suggested commands in text and leaves them bare in JSON', async () => {
    const text = await runWithCliDoor('acme astryx', () =>
      runCli(['search', '']),
    );
    expect(text.stderr).toContain('acme astryx search button');

    const json = await runWithCliDoor('acme astryx', () =>
      runCli(['search', '', '--json']),
    );
    expect(JSON.parse(json.stdout).suggestions[0].name).toBe(
      'astryx search button',
    );
  });
});
