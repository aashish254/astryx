// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The per-user cache of CLI releases.
 *
 * Global mode answers some runs with a release other than the copy that
 * started them (spec AST-081 FR2, FR6): the release that matches a project's
 * Core, the newest release for the global copy, or the Core a copy carries
 * outside a project. Each is installed here, once, through the package
 * manager, and reused by every later run:
 *
 *     <user cache>/astryx/releases/<version>/
 *       package.json                 (an empty private package)
 *       node_modules/@astryxdesign/cli
 *       node_modules/@astryxdesign/core
 *       release.json                 (written last: the release is verified)
 *
 * A release counts only once `release.json` exists. It is written after the
 * install finished, the CLI started and reported its own version, and the
 * release supports this computer's Node. An install builds in a temporary
 * folder beside the others and is renamed into place, so a run never sees a
 * half-installed release, and a lock keeps two runs from installing the same
 * release at once.
 *
 * The package manager is npm, started from the Node that runs the CLI, so the
 * registry, proxy, and offline settings in the user's npm configuration
 * apply. No Astryx setting changes where or how releases install.
 *
 * @input  a release version
 * @output the release's folder, or why it is unavailable
 * @position foundation/release — used by the bin's hand-off, by the carried
 *   Core lookup, and by the background refresh worker.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {satisfiesRange} from '../env/semver.mjs';
import {readJson} from './project.mjs';

/**
 * The per-user cache directory every Astryx cache lives in, never inside a
 * project. Standard platform locations only.
 * @returns {string}
 */
export function userCacheDir() {
  const home = os.homedir();
  if (process.platform === 'win32') {
    return path.join(
      process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'),
      'astryx',
      'Cache',
    );
  }
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Caches', 'astryx');
  }
  return path.join(
    process.env.XDG_CACHE_HOME || path.join(home, '.cache'),
    'astryx',
  );
}

/**
 * The folder all cached releases live in.
 * @param {string} [cacheDir]
 * @returns {string}
 */
export function releasesDir(cacheDir = userCacheDir()) {
  return path.join(cacheDir, 'releases');
}

/** A release version safe to use as a folder name and an npm spec. */
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * Is `version` a plain release version?
 * @param {unknown} version
 * @returns {version is string}
 */
export function isReleaseVersion(version) {
  return typeof version === 'string' && VERSION_RE.test(version);
}

/**
 * A cached, verified release.
 * @typedef {object} CachedRelease
 * @property {string} version
 * @property {string} dir the release folder
 * @property {string} cliDir its `@astryxdesign/cli`
 * @property {string} coreDir its `@astryxdesign/core`
 * @property {string} bin the CLI's `astryx` entry file
 */

/**
 * The entry file a CLI package's `astryx` bin points at.
 * @param {string} cliDir
 * @returns {string | null}
 */
export function cliBinOf(cliDir) {
  const pkg = readJson(path.join(cliDir, 'package.json'));
  const bin =
    typeof pkg?.bin === 'string' ? pkg.bin : pkg?.bin && pkg.bin.astryx;
  if (typeof bin !== 'string') return null;
  const file = path.join(cliDir, bin);
  return fs.existsSync(file) ? file : null;
}

/**
 * The cached release `version`, when it is installed and verified.
 * @param {string} version
 * @param {string} [cacheDir]
 * @returns {CachedRelease | null}
 */
export function cachedRelease(version, cacheDir = userCacheDir()) {
  if (!isReleaseVersion(version)) return null;
  const dir = path.join(releasesDir(cacheDir), version);
  const marker = readJson(path.join(dir, 'release.json'));
  if (!marker || marker.version !== version) return null;
  const cliDir = path.join(dir, 'node_modules', '@astryxdesign', 'cli');
  const coreDir = path.join(dir, 'node_modules', '@astryxdesign', 'core');
  const bin = cliBinOf(cliDir);
  if (!bin || !fs.existsSync(path.join(coreDir, 'package.json'))) return null;
  return {version, dir, cliDir, coreDir, bin};
}

/**
 * Is `dir` inside the release cache? A copy that lives there was started by
 * global mode, never installed by a person.
 * @param {string} dir
 * @param {string} [cacheDir]
 * @returns {boolean}
 */
export function isInReleaseCache(dir, cacheDir = userCacheDir()) {
  const root = realOrSelf(releasesDir(cacheDir));
  const rel = path.relative(root, realOrSelf(dir));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * @param {string} p
 * @returns {string}
 */
function realOrSelf(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/**
 * How to start npm: the npm that ships beside the running Node when it is
 * there, else `npm` on the PATH.
 * @returns {{command: string, prefix: string[], shell: boolean}}
 */
export function npmCommand() {
  const nodeDir = path.dirname(process.execPath);
  const candidates =
    process.platform === 'win32'
      ? [path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js')]
      : [
          path.join(
            nodeDir,
            '..',
            'lib',
            'node_modules',
            'npm',
            'bin',
            'npm-cli.js',
          ),
          path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
        ];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return {command: process.execPath, prefix: [file], shell: false};
    }
  }
  return process.platform === 'win32'
    ? {command: 'npm.cmd', prefix: [], shell: true}
    : {command: 'npm', prefix: [], shell: false};
}

/**
 * The result of running npm.
 * @typedef {object} NpmResult
 * @property {number | null} status
 * @property {string} stdout
 * @property {string} stderr
 * @property {Error} [error]
 */

/**
 * Run npm synchronously with no output on the caller's streams.
 * @param {string[]} args
 * @param {{cwd?: string, timeoutMs?: number}} [options]
 * @returns {NpmResult}
 */
export function runNpm(args, options = {}) {
  const {command, prefix, shell} = npmCommand();
  const result = spawnSync(command, [...prefix, ...args], {
    cwd: options.cwd ?? os.tmpdir(),
    encoding: 'utf-8',
    shell,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeoutMs ?? 300_000,
    windowsHide: true,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    ...(result.error ? {error: result.error} : {}),
  };
}

/**
 * The newest published version that `spec` (a dist-tag or a range) names,
 * asked of the registry through npm.
 * @param {string} name e.g. `@astryxdesign/core`
 * @param {string} spec e.g. `latest`, `^0.6.8`
 * @param {{run?: typeof runNpm}} [options]
 * @returns {string | null}
 */
export function resolvePublishedVersion(name, spec, options = {}) {
  const run = options.run ?? runNpm;
  const result = run(
    ['view', `${name}@${spec}`, 'version', '--json', ...BOUNDED_FETCH],
    {timeoutMs: 60_000},
  );
  if (result.status !== 0) return null;
  let parsed;
  try {
    parsed = JSON.parse(result.stdout || 'null');
  } catch {
    return null;
  }
  const versions = (Array.isArray(parsed) ? parsed : [parsed]).filter(
    isReleaseVersion,
  );
  return versions.length > 0 ? versions[versions.length - 1] : null;
}

/**
 * Registry requests give up after one retry and 30 seconds each, so a run with
 * no network fails in seconds with ERR_VERSIONS_UNAVAILABLE instead of waiting
 * out npm's default retries. Registry, proxy, and offline settings still come
 * from the user's npm configuration.
 */
const BOUNDED_FETCH = ['--fetch-retries=1', '--fetch-timeout=30000'];

/** Sleep the thread without spinning. @param {number} ms */
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** How long a lock may stand before a run treats its holder as gone. */
const STALE_LOCK_MS = 10 * 60_000;

/**
 * Take a lock folder, or return false when another live run holds it.
 * @param {string} lockDir
 * @returns {boolean}
 */
export function tryLock(lockDir) {
  fs.mkdirSync(path.dirname(lockDir), {recursive: true});
  try {
    fs.mkdirSync(lockDir);
    return true;
  } catch {
    try {
      const age = Date.now() - fs.statSync(lockDir).mtimeMs;
      if (age > STALE_LOCK_MS) {
        fs.rmSync(lockDir, {recursive: true, force: true});
        fs.mkdirSync(lockDir);
        return true;
      }
    } catch {
      // Another run took or freed it in between; treat it as held.
    }
    return false;
  }
}

/**
 * Why a release could not be made available.
 * @typedef {object} ReleaseUnavailable
 * @property {string} version
 * @property {string} reason one plain sentence
 */

/**
 * Install release `version` into the cache, verify it, and return it. A
 * release already cached returns at once. When another run is installing the
 * same release, this waits for it.
 *
 * @param {string} version
 * @param {{cacheDir?: string, run?: typeof runNpm, nodeVersion?: string, waitMs?: number}} [options]
 * @returns {CachedRelease | ReleaseUnavailable}
 */
export function ensureRelease(version, options = {}) {
  const {
    cacheDir = userCacheDir(),
    run = runNpm,
    nodeVersion = process.versions.node,
    waitMs = 5 * 60_000,
  } = options;
  if (!isReleaseVersion(version)) {
    return {version: String(version), reason: 'it is not a release version'};
  }
  const existing = cachedRelease(version, cacheDir);
  if (existing) return existing;

  const root = releasesDir(cacheDir);
  const lockDir = path.join(root, `.lock-${version}`);
  const deadline = Date.now() + waitMs;
  while (!tryLock(lockDir)) {
    const ready = cachedRelease(version, cacheDir);
    if (ready) return ready;
    if (Date.now() > deadline) {
      return {version, reason: 'another run is still installing it'};
    }
    sleep(200);
  }
  try {
    const again = cachedRelease(version, cacheDir);
    if (again) return again;
    return installLocked(version, {cacheDir, run, nodeVersion});
  } finally {
    fs.rmSync(lockDir, {recursive: true, force: true});
  }
}

/**
 * The install itself, under the lock.
 * @param {string} version
 * @param {{cacheDir: string, run: typeof runNpm, nodeVersion: string}} options
 * @returns {CachedRelease | ReleaseUnavailable}
 */
function installLocked(version, {cacheDir, run, nodeVersion}) {
  const root = releasesDir(cacheDir);
  const tmp = path.join(
    root,
    `.tmp-${version}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`,
  );
  fs.mkdirSync(tmp, {recursive: true});
  try {
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      `${JSON.stringify({name: 'astryx-release', private: true}, null, 2)}\n`,
    );
    const install = run(
      [
        'install',
        '--no-save',
        '--no-package-lock',
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--prefer-offline',
        ...BOUNDED_FETCH,
        '--loglevel=error',
        `@astryxdesign/cli@${version}`,
        `@astryxdesign/core@${version}`,
      ],
      {cwd: tmp},
    );
    if (install.status !== 0) {
      return {version, reason: npmFailure(install)};
    }
    const cliDir = path.join(tmp, 'node_modules', '@astryxdesign', 'cli');
    const cliPkg = readJson(path.join(cliDir, 'package.json'));
    if (cliPkg?.version !== version) {
      return {version, reason: 'the package manager installed another version'};
    }
    const engine = cliPkg?.engines?.node;
    if (typeof engine === 'string' && !satisfiesRange(nodeVersion, engine)) {
      return {
        version,
        reason: `it needs Node ${engine}, and this computer runs Node ${nodeVersion}`,
      };
    }
    const bin = cliBinOf(cliDir);
    if (!bin) return {version, reason: 'its CLI has no astryx command'};
    const started = spawnSync(process.execPath, [bin, '--version'], {
      cwd: tmp,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
      windowsHide: true,
    });
    const reported = String(started.stdout ?? '')
      .trim()
      .split(/\r?\n/)
      .pop();
    if (started.status !== 0 || reported !== version) {
      return {version, reason: 'its CLI did not start and report its version'};
    }
    fs.writeFileSync(
      path.join(tmp, 'release.json'),
      `${JSON.stringify({version, verifiedAt: new Date().toISOString()}, null, 2)}\n`,
    );
    const dest = path.join(root, version);
    try {
      fs.renameSync(tmp, dest);
    } catch {
      // A finished release already holds the name; keep that one.
    }
    return (
      cachedRelease(version, cacheDir) ?? {
        version,
        reason: 'it could not be saved in the cache',
      }
    );
  } catch (error) {
    return {
      version,
      reason: `installing it failed (${error instanceof Error ? error.message : String(error)})`,
    };
  } finally {
    fs.rmSync(tmp, {recursive: true, force: true});
  }
}

/**
 * One sentence on why npm failed.
 * @param {NpmResult} result
 * @returns {string}
 */
function npmFailure(result) {
  if (result.error && /** @type {any} */ (result.error).code === 'ENOENT') {
    return 'npm, which installs releases, was not found';
  }
  const text = `${result.stderr}\n${result.stdout}`;
  if (/E404|404 Not Found|No matching version|ETARGET/i.test(text)) {
    return 'the registry does not have it';
  }
  if (
    /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|offline|network/i.test(
      text,
    )
  ) {
    return 'the registry could not be reached';
  }
  return 'the package manager could not install it';
}
