// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Doctor's `icon-sets` check (AST-084 FR15).
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {checkIconSets, runChecks} from './doctor.mjs';
import {writeIconSetProject} from '../../test-utils/icon-set-fixture.mjs';

/** @type {string} */
let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-doctor-icons-'));
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/** @param {Parameters<typeof writeIconSetProject>[1]} options */
async function iconCheckOf(options) {
  const report = await runChecks({cwd: writeIconSetProject(tmp, options)});
  return report.checks.find(check => check.id === 'icon-sets');
}

describe('icon-sets check', () => {
  it('a project with no icon sets passes', async () => {
    expect(await iconCheckOf({packages: []})).toMatchObject({status: 'pass'});
  });

  it('one installed set passes', async () => {
    const check = await iconCheckOf({});
    expect(check).toMatchObject({status: 'pass'});
    expect(check?.message).toMatch(/only installed icon set/);
  });

  it('two sets without iconSet warn', async () => {
    const check = await iconCheckOf({packages: [{}, {name: '@acme/lines'}]});
    expect(check).toMatchObject({status: 'warn'});
    expect(check?.fix).toMatch(/iconSet/);
  });

  it('iconSet naming a set that is not installed fails', async () => {
    expect(await iconCheckOf({config: {iconSet: 'nope'}})).toMatchObject({
      status: 'fail',
    });
  });

  it('an invalid data file warns with the reason', async () => {
    const check = await iconCheckOf({packages: [{data: '{nope'}]});
    expect(check).toMatchObject({status: 'warn'});
    expect(check?.message).toMatch(/not valid JSON/);
  });

  it('skips with info when the project could not be read', () => {
    const check = checkIconSets(
      /** @type {any} */ ({cwd: tmp, iconSets: null, projectError: 'boom'}),
    );
    expect(check.status).toBe('info');
  });
});
