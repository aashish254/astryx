// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for how the discover adapter reads the official list and calls
 * discover sources: order, failure isolation, timeouts, and the saved copy,
 * plus what the official list adds to the installed list and the add command.
 * Sources are plain functions on a stand-in project, and the saved copies go
 * to a temp directory.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  addCommand,
  callSources,
  OFFICIAL_LIST_FILE,
  officialList,
  withDeclaredOfficial,
} from './_adapter.mjs';
import {parseDiscoverCatalog} from '../../authoring/discover/parse.mjs';

/** No official packages, so a test sees only its own sources after it. */
const NO_OFFICIAL = {packages: []};

/** How the official list reports itself among the sources. */
const OFFICIAL_STATE = ['Astryx', '@astryxdesign/cli', 'fresh'];

/**
 * @param {string} name
 * @param {object[]} packages
 */
function catalog(name, packages) {
  return {
    schemaVersion: 1,
    source: {name, generatedAt: '2026-09-30T00:00:00.000Z', complete: true},
    packages,
  };
}

/**
 * @param {string} name
 * @param {object} [extra]
 */
function pkg(name, extra = {}) {
  return {
    package: name,
    integration: name,
    aliases: [],
    latest: '1.0.0',
    versions: [
      {version: '1.0.0', publishedAt: null, prerelease: false, status: 'ok'},
    ],
    contributions: [],
    ...extra,
  };
}

/**
 * @param {{config?: object, integrations?: object[], cwd?: string}} parts
 * @returns {any}
 */
function project({config = {}, integrations = [], cwd = '/virtual/project'}) {
  return {config, loadedIntegrations: integrations, cwd};
}

/**
 * An official package as officialList() returns it.
 * @param {string} name
 * @param {object} [extra]
 */
function official(name, extra = {}) {
  return {
    ...pkg(name, {latest: '0.7.1'}),
    versions: [
      {version: '0.7.1', publishedAt: null, prerelease: false, status: 'ok'},
    ],
    contributions: [{kind: 'theme', name: name.split('-').pop()}],
    releasedWithCore: true,
    ...extra,
  };
}

let cacheDir;

beforeEach(() => {
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discover-cache-'));
});

afterEach(() => {
  fs.rmSync(cacheDir, {recursive: true, force: true});
});

describe('callSources', () => {
  it('asks the project source first, then each integration in load order, once per function', async () => {
    /** @type {string[]} */
    const calls = [];
    const shared = vi.fn(async () => {
      calls.push('shared');
      return catalog('Shared', [pkg('@a/one')]);
    });
    const own = vi.fn(async () => {
      calls.push('own');
      return catalog('Own', [pkg('@a/one', {latest: '9.9.9'}), pkg('@a/two')]);
    });

    const result = await callSources(
      project({
        config: {discover: own},
        integrations: [
          {name: '@x/first', __discover: shared},
          {name: '@x/second', __discover: shared},
        ],
      }),
      {},
      {cacheDir, official: NO_OFFICIAL},
    );

    expect(calls).toEqual(['own', 'shared']);
    expect(result.sources.map(s => [s.name, s.from, s.status])).toEqual([
      ['Own', 'astryx.config', 'fresh'],
      ['Shared', '@x/first', 'fresh'],
      OFFICIAL_STATE,
    ]);
    expect(result.packages.map(p => [p.package, p.latest, p.source])).toEqual([
      ['@a/one', '9.9.9', 'Own'],
      ['@a/two', '1.0.0', 'Own'],
    ]);
  });

  it('passes the package and version it wants, with an abort signal', async () => {
    const source = vi.fn(async () => catalog('S', []));

    await callSources(
      project({integrations: [{name: '@x/src', __discover: source}]}),
      {package: '@a/one', version: '1.0.0'},
      {cacheDir, official: NO_OFFICIAL},
    );

    expect(source).toHaveBeenCalledWith({
      signal: expect.any(globalThis.AbortSignal),
      package: '@a/one',
      version: '1.0.0',
    });
  });

  it('keeps every other source when one throws, returns bad data, or is not a function', async () => {
    const result = await callSources(
      project({
        integrations: [
          {
            name: '@x/throws',
            __discover: async () => {
              throw new Error('offline');
            },
          },
          {name: '@x/bad', __discover: async () => ({schemaVersion: 2})},
          {
            name: '@x/broken',
            __discoverError: 'named export "discover" must be a function',
          },
          {
            name: '@x/good',
            __discover: async () => catalog('Good', [pkg('@a/one')]),
          },
        ],
      }),
      {},
      {cacheDir, official: NO_OFFICIAL},
    );

    expect(result.sources.map(s => [s.from, s.status])).toEqual([
      ['@x/throws', 'failed'],
      ['@x/bad', 'failed'],
      ['@x/broken', 'failed'],
      ['@x/good', 'fresh'],
      ['@astryxdesign/cli', 'fresh'],
    ]);
    expect(result.sources[0].error).toContain('offline');
    expect(result.sources[1].error).toContain('schemaVersion 2');
    expect(result.sources[2].error).toContain('must be a function');
    expect(result.packages.map(p => p.package)).toEqual(['@a/one']);
  });

  it('gives up on a source after the timeout and aborts its signal', async () => {
    /** @type {AbortSignal | undefined} */
    let seen;
    const slow = ({signal}) => {
      seen = signal;
      return new Promise(() => {});
    };

    const result = await callSources(
      project({integrations: [{name: '@x/slow', __discover: slow}]}),
      {},
      {cacheDir, timeoutMs: 20, official: NO_OFFICIAL},
    );

    expect(result.sources[0]).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('did not answer'),
    });
    expect(seen?.aborted).toBe(true);
  });

  it('uses the copy saved for the same request when a source fails, and says when it was saved', async () => {
    let online = true;
    const source = async () => {
      if (!online) throw new Error('offline');
      return catalog('S', [pkg('@a/one')]);
    };
    const p = project({integrations: [{name: '@x/src', __discover: source}]});
    const options = {cacheDir, official: NO_OFFICIAL};

    await callSources(p, {}, options);
    online = false;
    const offline = await callSources(p, {}, options);

    expect(offline.sources[0]).toMatchObject({
      name: 'S',
      status: 'saved',
      error: 'offline',
      savedAt: expect.any(String),
    });
    expect(offline.packages.map(x => x.package)).toEqual(['@a/one']);

    const otherRequest = await callSources(p, {package: '@a/one'}, options);
    expect(otherRequest.sources[0].status).toBe('failed');
  });

  it('keeps the saved copy in the cache directory, not in the project', async () => {
    await callSources(
      project({
        integrations: [
          {name: '@x/src', __discover: async () => catalog('S', [])},
        ],
      }),
      {},
      {cacheDir, official: NO_OFFICIAL},
    );

    expect(fs.readdirSync(path.join(cacheDir, 'discover'))).toHaveLength(1);
    expect(fs.existsSync('/virtual/project')).toBe(false);
  });

  it('returns only the official list when there is no project', async () => {
    const result = await callSources(
      undefined,
      {},
      {official: {packages: [official('@astryxdesign/theme-gothic')]}},
    );
    expect(result.sources.map(s => [s.name, s.from, s.status])).toEqual([
      OFFICIAL_STATE,
    ]);
    expect(result.packages.map(p => [p.package, p.source])).toEqual([
      ['@astryxdesign/theme-gothic', 'Astryx'],
    ]);
  });

  it('reads the official list last, so another source keeps its entry, and puts official packages first', async () => {
    const own = async () =>
      catalog('Own', [
        pkg('@a/two'),
        pkg('@astryxdesign/theme-matcha', {latest: '0.6.8'}),
      ]);
    const result = await callSources(
      project({config: {discover: own}}),
      {},
      {
        cacheDir,
        official: {
          packages: [
            official('@astryxdesign/theme-gothic'),
            official('@astryxdesign/theme-matcha'),
          ],
        },
      },
    );

    expect(result.sources.map(s => [s.name, s.from, s.status])).toEqual([
      ['Own', 'astryx.config', 'fresh'],
      OFFICIAL_STATE,
    ]);
    expect(
      result.packages.map(p => [p.package, p.latest, p.source, !!p.official]),
    ).toEqual([
      ['@astryxdesign/theme-gothic', '0.7.1', 'Astryx', true],
      ['@astryxdesign/theme-matcha', '0.6.8', 'Own', false],
      ['@a/two', '1.0.0', 'Own', false],
    ]);
    expect(result.packages[0]).not.toHaveProperty('releasedWithCore');
  });

  it('answers a package request with only that official package', async () => {
    const result = await callSources(
      project({}),
      {package: '@astryxdesign/theme-matcha'},
      {
        cacheDir,
        official: {
          packages: [
            official('@astryxdesign/theme-gothic'),
            official('@astryxdesign/theme-matcha'),
          ],
        },
      },
    );
    expect(result.packages.map(p => p.package)).toEqual([
      '@astryxdesign/theme-matcha',
    ]);
  });

  it('reports an official list it could not read like a failed source', async () => {
    const result = await callSources(
      project({}),
      {},
      {cacheDir, official: {packages: [], error: 'the list is missing'}},
    );
    expect(result.sources.slice(-1)).toEqual([
      {
        name: 'Astryx',
        from: '@astryxdesign/cli',
        status: 'failed',
        error: 'the list is missing',
      },
    ]);
    expect(result.packages).toEqual([]);
  });
});

describe('officialList', () => {
  const kinds = (/** @type {{contributions: {kind: string}[]}[]} */ list) => [
    ...new Set(list.flatMap(p => p.contributions.map(c => c.kind))),
  ];

  it('gives every official package the CLI release version as its latest release', () => {
    const {packages, error} = officialList({version: '0.7.1'});
    expect(error).toBeUndefined();
    expect(packages.length).toBeGreaterThan(0);
    for (const entry of packages) {
      expect(entry.package.startsWith('@astryxdesign/')).toBe(true);
      expect(entry.latest).toBe('0.7.1');
      expect(entry.versions).toEqual([
        {version: '0.7.1', publishedAt: null, prerelease: false, status: 'ok'},
      ]);
      expect(entry.contributions.length).toBeGreaterThan(0);
    }
    expect(packages.map(p => p.package)).toContain(
      '@astryxdesign/theme-neutral',
    );
  });

  it('lists the canary-only packages only on a canary CLI, as prereleases', () => {
    const stable = officialList({version: '0.7.1'}).packages;
    const canary = officialList({version: '0.7.2-canary.abc1234'}).packages;
    const raw = JSON.parse(fs.readFileSync(OFFICIAL_LIST_FILE, 'utf8'));
    const canaryOnly = raw.packages
      .filter((/** @type {{canaryOnly?: boolean}} */ p) => p.canaryOnly)
      .map((/** @type {{package: string}} */ p) => p.package);

    expect(canaryOnly.length).toBeGreaterThan(0);
    for (const name of canaryOnly) {
      expect(stable.map(p => p.package)).not.toContain(name);
      expect(canary.map(p => p.package)).toContain(name);
    }
    for (const entry of canary) {
      expect(entry.latest).toBeNull();
      expect(entry.versions).toEqual([
        {
          version: '0.7.2-canary.abc1234',
          publishedAt: null,
          prerelease: true,
          status: 'ok',
        },
      ]);
    }
    expect(kinds(canary)).toContain('component');
  });

  it('reads back as a valid discover catalog on a release and a canary CLI', () => {
    for (const version of ['0.7.1', '0.7.2-canary.abc1234']) {
      const packages = officialList({version}).packages.map(
        ({releasedWithCore: _pin, ...entry}) => entry,
      );
      const parsed = parseDiscoverCatalog(
        catalog('Astryx', packages),
        'the official list',
      );
      expect(parsed.packages).toEqual(packages);
    }
  });

  it('reports a list it cannot read instead of throwing', () => {
    const result = officialList({
      file: path.join(cacheDir, 'missing.json'),
      version: '0.7.1',
    });
    expect(result.packages).toEqual([]);
    expect(result.error).toContain('the official list could not be read');
  });
});

describe('withDeclaredOfficial', () => {
  /** @param {string} dir @param {string} name @param {string} version */
  function install(dir, name, version) {
    const at = path.join(dir, 'node_modules', ...name.split('/'));
    fs.mkdirSync(at, {recursive: true});
    fs.writeFileSync(
      path.join(at, 'package.json'),
      JSON.stringify({name, version}),
    );
  }

  /** @param {object[]} packages */
  const result = packages => ({sources: [], packages});
  const gothic = {
    ...official('@astryxdesign/theme-gothic', {description: 'Dark.'}),
    source: 'Astryx',
    official: true,
  };

  it('counts a declared official package as installed, first, with its installed version', () => {
    install(cacheDir, '@astryxdesign/theme-gothic', '0.7.0');
    const installed = withDeclaredOfficial(
      project({cwd: cacheDir}),
      [{name: '@acme/ui', category: '@acme/ui', components: []}],
      result([gothic]),
      new Set(['@astryxdesign/theme-gothic', '@acme/ui']),
      [gothic],
    );
    expect(installed).toEqual([
      {
        name: '@astryxdesign/theme-gothic',
        category: '@astryxdesign/theme-gothic',
        version: '0.7.0',
        description: 'Dark.',
        components: [],
        themes: ['gothic'],
        declaredOfficial: true,
      },
      {name: '@acme/ui', category: '@acme/ui', components: []},
    ]);
  });

  it('leaves a declared official package alone when another source supplied its entry', () => {
    const fromOwn = {...gothic, source: 'Own', official: undefined};
    expect(
      withDeclaredOfficial(
        project({cwd: cacheDir}),
        [],
        result([fromOwn]),
        new Set(['@astryxdesign/theme-gothic']),
        [gothic],
      ),
    ).toEqual([]);
  });

  it('leaves out an official integration that failed to load, even when declared', () => {
    expect(
      withDeclaredOfficial(
        project({
          cwd: cacheDir,
          integrations: [
            {name: '@astryxdesign/theme-gothic', __loadError: 'x'},
          ],
        }),
        [],
        result([gothic]),
        new Set(['@astryxdesign/theme-gothic']),
        [gothic],
      ),
    ).toEqual([]);
  });
});

describe('addCommand with the official list', () => {
  /** What the command adds, whichever package manager runs the tests. */
  const target = (/** @type {string} */ command) => command.split(' ').pop();
  const list = [
    official('@astryxdesign/theme-gothic'),
    official('@astryxdesign/charts', {
      releasedWithCore: false,
      latest: null,
      versions: [
        {
          version: '0.7.2-canary.abc1234',
          publishedAt: null,
          prerelease: true,
          status: 'ok',
        },
      ],
    }),
  ];

  it('pins the project’s Core version for a package released with Core', () => {
    const at = path.join(cacheDir, 'node_modules', '@astryxdesign', 'core');
    fs.mkdirSync(at, {recursive: true});
    fs.writeFileSync(
      path.join(at, 'package.json'),
      JSON.stringify({name: '@astryxdesign/core', version: '0.6.8'}),
    );
    const add = addCommand(project({cwd: cacheDir}), {official: list});
    expect(target(add('@astryxdesign/theme-gothic'))).toBe(
      '@astryxdesign/theme-gothic@0.6.8',
    );
    expect(target(add('@astryxdesign/charts'))).toBe(
      '@astryxdesign/charts@0.7.2-canary.abc1234',
    );
  });

  it('pins the version shown when the project has no Core, and leaves other packages alone', () => {
    const add = addCommand(project({cwd: cacheDir}), {official: list});
    expect(target(add('@astryxdesign/theme-gothic'))).toBe(
      '@astryxdesign/theme-gothic@0.7.1',
    );
    expect(target(add('@acme/ui'))).toBe('@acme/ui');
    expect(target(add('@astryxdesign/theme-gothic', '0.7.0'))).toBe(
      '@astryxdesign/theme-gothic@0.7.0',
    );
  });
});
