// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  cachedRelease,
  ensureRelease,
  isInReleaseCache,
  releasesDir,
  resolvePublishedVersion,
  tryLock,
} from './cache.mjs';
import {
  cleanupFixtures,
  installCore,
  installStandInCli,
  seedRelease,
  tempDir,
  writeJson,
} from '../../test-utils/release-fixtures.mjs';

afterEach(cleanupFixtures);

/**
 * A stand-in for npm: `install` lays down stand-in CLI and Core packages of
 * the requested version (or fails the way `outcome` says), and records each
 * call.
 * @param {{outcome?: 'ok' | 'offline' | 'missing' | 'wrong-version', engines?: string}} [options]
 */
function fakeNpm(options = {}) {
  const {outcome = 'ok', engines} = options;
  /** @type {string[][]} */
  const calls = [];
  /** @type {import('./cache.mjs').runNpm} */
  const run = (args, opts = {}) => {
    calls.push(args);
    if (outcome === 'offline') {
      return {
        status: 1,
        stdout: '',
        stderr: 'npm error code ENOTFOUND\nnpm error network request failed',
      };
    }
    if (outcome === 'missing') {
      return {
        status: 1,
        stdout: '',
        stderr:
          'npm error code ETARGET\nnpm error notarget No matching version',
      };
    }
    const spec = args.find(a => a.startsWith('@astryxdesign/cli@')) ?? '';
    const version = spec.split('@').pop() ?? '';
    const cwd = /** @type {string} */ (opts.cwd);
    const cli = installStandInCli(
      cwd,
      outcome === 'wrong-version' ? '0.0.1' : version,
    );
    if (engines) {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(cli, 'package.json'), 'utf-8'),
      );
      writeJson(path.join(cli, 'package.json'), {
        ...pkg,
        engines: {node: engines},
      });
    }
    installCore(cwd, version);
    return {status: 0, stdout: '', stderr: ''};
  };
  return {run, calls};
}

describe('ensureRelease', () => {
  it('installs, verifies, and keeps a release, then reuses it', () => {
    const cacheDir = tempDir('cache');
    const npm = fakeNpm();
    const release = ensureRelease('0.6.8', {cacheDir, run: npm.run});
    expect('bin' in release && release.version).toBe('0.6.8');
    expect(npm.calls[0]).toEqual(
      expect.arrayContaining([
        'install',
        '--ignore-scripts',
        '@astryxdesign/cli@0.6.8',
        '@astryxdesign/core@0.6.8',
      ]),
    );
    expect(cachedRelease('0.6.8', cacheDir)?.coreDir).toBe(
      path.join(
        releasesDir(cacheDir),
        '0.6.8',
        'node_modules',
        '@astryxdesign',
        'core',
      ),
    );
    ensureRelease('0.6.8', {cacheDir, run: npm.run});
    expect(npm.calls).toHaveLength(1);
    expect(
      fs.readdirSync(releasesDir(cacheDir)).filter(n => n.startsWith('.')),
    ).toEqual([]);
  });

  it('says why a release is unavailable and keeps nothing', () => {
    const cases = /** @type {const} */ ([
      ['offline', /could not be reached/],
      ['missing', /does not have it/],
      ['wrong-version', /another version/],
    ]);
    for (const [outcome, reason] of cases) {
      const cacheDir = tempDir('cache');
      const result = ensureRelease('0.6.8', {
        cacheDir,
        run: fakeNpm({outcome}).run,
      });
      expect('reason' in result && result.reason).toMatch(reason);
      expect(cachedRelease('0.6.8', cacheDir)).toBeNull();
    }
  });

  it("refuses a release this computer's Node cannot run", () => {
    const cacheDir = tempDir('cache');
    const result = ensureRelease('0.9.0', {
      cacheDir,
      run: fakeNpm({engines: '>=99.0.0'}).run,
    });
    expect('reason' in result && result.reason).toMatch(
      /needs Node >=99\.0\.0/,
    );
  });

  it('refuses a version that is not a release version', () => {
    const result = ensureRelease('../../etc', {
      cacheDir: tempDir('cache'),
      run: fakeNpm().run,
    });
    expect('reason' in result && result.reason).toMatch(
      /not a release version/,
    );
  });

  it('waits for another run installing the same release', () => {
    const cacheDir = tempDir('cache');
    fs.mkdirSync(path.join(releasesDir(cacheDir), '.lock-0.6.8'), {
      recursive: true,
    });
    const result = ensureRelease('0.6.8', {
      cacheDir,
      run: fakeNpm().run,
      waitMs: 300,
    });
    expect('reason' in result && result.reason).toMatch(/still installing/);
  });
});

describe('cachedRelease', () => {
  it('counts a release only once it is verified', () => {
    const cacheDir = tempDir('cache');
    const dir = seedRelease(cacheDir, '0.7.1');
    expect(cachedRelease('0.7.1', cacheDir)).not.toBeNull();
    fs.rmSync(path.join(dir, 'release.json'));
    expect(cachedRelease('0.7.1', cacheDir)).toBeNull();
  });

  it('knows a folder inside the cache', () => {
    const cacheDir = tempDir('cache');
    const dir = seedRelease(cacheDir, '0.7.1');
    expect(isInReleaseCache(dir, cacheDir)).toBe(true);
    expect(isInReleaseCache(tempDir(), cacheDir)).toBe(false);
  });
});

describe('resolvePublishedVersion', () => {
  it('takes the newest version npm reports for a range', () => {
    /** @type {import('./cache.mjs').runNpm} */
    const run = args => {
      expect(args).toEqual([
        'view',
        '@astryxdesign/core@^0.6.0',
        'version',
        '--json',
      ]);
      return {status: 0, stdout: '["0.6.3","0.6.8"]', stderr: ''};
    };
    expect(resolvePublishedVersion('@astryxdesign/core', '^0.6.0', {run})).toBe(
      '0.6.8',
    );
  });

  it('is null when npm fails or answers nothing usable', () => {
    expect(
      resolvePublishedVersion('@astryxdesign/cli', 'latest', {
        run: () => ({status: 1, stdout: '', stderr: ''}),
      }),
    ).toBeNull();
    expect(
      resolvePublishedVersion('@astryxdesign/cli', 'latest', {
        run: () => ({status: 0, stdout: '""', stderr: ''}),
      }),
    ).toBeNull();
  });
});

describe('tryLock', () => {
  it('takes a free lock once and reclaims a stale one', () => {
    const dir = path.join(tempDir('lock'), '.lock-x');
    expect(tryLock(dir)).toBe(true);
    expect(tryLock(dir)).toBe(false);
    const old = new Date(Date.now() - 11 * 60_000);
    fs.utimesSync(dir, old, old);
    expect(tryLock(dir)).toBe(true);
  });
});
