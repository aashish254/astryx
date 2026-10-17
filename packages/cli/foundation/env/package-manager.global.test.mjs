// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The picker's guess when the CLI installed for the computer answers:
 * `astryx` outside a project, and the pinned package inside one, where the
 * global copy never answers for itself (spec AST-081 FR5).
 */

import {describe, it, expect, vi, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {guessCliInvocation} from './package-manager.mjs';
import {
  CLI_VERSION,
  cleanupFixtures,
  installCore,
  project,
  tempDir,
} from '../../test-utils/release-fixtures.mjs';

vi.mock('../release/choose.mjs', async importOriginal => ({
  .../** @type {object} */ (await importOriginal()),
  isGlobalCopy: () => true,
}));

afterEach(cleanupFixtures);

describe('guessCliInvocation for the copy installed for the computer', () => {
  it('prints the bare `astryx` command outside a project', () => {
    const empty = tempDir('empty');
    fs.writeFileSync(path.join(empty, 'package-lock.json'), '{}');
    expect(guessCliInvocation(empty)).toBe('astryx');
  });

  it('prints the pinned package inside a project it answers as the matched release', () => {
    const root = project(tempDir(), {'@astryxdesign/core': CLI_VERSION});
    installCore(root, CLI_VERSION);
    fs.writeFileSync(path.join(root, 'package-lock.json'), '{}');
    expect(guessCliInvocation(root)).toBe(
      `npx @astryxdesign/cli@${CLI_VERSION}`,
    );
  });
});
