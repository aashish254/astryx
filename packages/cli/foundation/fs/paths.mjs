// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Path resolution utilities for Astryx CLI
 *
 * Finds the project root and its workspace root, the project's
 * @astryxdesign/core and the other packages it installed, and the CLI package
 * root.
 */

import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {satisfiesRange} from '../env/semver.mjs';
import {listDir, pathExists} from './listing-cache.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Root of the @astryxdesign/cli package */
export const CLI_ROOT = path.resolve(__dirname, '..', '..');

/** The package every Core lookup answers for. */
const CORE_PACKAGE = '@astryxdesign/core';

/**
 * How many folders, counting the start, each lookup of the project's packages
 * always searches: the reach each one had before it learned the workspace
 * root, so nothing it found before goes missing. Past this reach a lookup
 * stops at the workspace root.
 */
const CORE_REACH = 5;
const INSTALLED_REACH = 6;

/**
 * `startDir` and every folder above it, nearest first, up to the filesystem
 * root: the folders Node's resolver searches for `node_modules`.
 *
 * @param {string} startDir
 * @returns {Generator<string>}
 */
function* foldersUpFrom(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    yield dir;
    const parent = path.dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

/**
 * `dir/node_modules/<name>` when the package is installed there. Its
 * package.json decides, so a stale empty folder is not an install.
 *
 * @param {string} dir
 * @param {string} name
 * @returns {string|null}
 */
function installedIn(dir, name) {
  const candidate = path.join(dir, 'node_modules', ...name.split('/'));
  return fs.existsSync(path.join(candidate, 'package.json')) ? candidate : null;
}

/**
 * The package.json in `dir`, or null when it is missing or not a JSON object.
 *
 * @param {string} dir
 * @returns {Record<string, any>|null}
 */
function readPackageJson(dir) {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'),
    );
    return pkg && typeof pkg === 'object' ? pkg : null;
  } catch {
    return null;
  }
}

/**
 * Whether `dir` is @astryxdesign/core's own source, by the name in its
 * package.json. The folder name says nothing: many monorepos keep an unrelated
 * package in `packages/core`.
 *
 * @param {string} dir
 * @returns {boolean}
 */
function isCoreSource(dir) {
  return readPackageJson(dir)?.name === CORE_PACKAGE;
}

/**
 * The project root: the directory of the nearest package.json at or above
 * `startDir`, or null when there is none.
 *
 * @param {string} startDir
 * @returns {string|null}
 */
export function findPackageRoot(startDir) {
  for (const dir of foldersUpFrom(startDir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
  }
  return null;
}

/**
 * The workspace root (`spec:AST-048` FR15): the nearest directory at or above
 * `startDir` that declares a workspace, by a `pnpm-workspace.yaml` or a
 * package.json `workspaces` field; outside a workspace, the directory of the
 * nearest package.json; with no package.json, `startDir` itself.
 *
 * @param {string} startDir
 * @returns {string}
 */
export function findWorkspaceRoot(startDir) {
  /** @type {string|null} */
  let nearestPackage = null;
  for (const dir of foldersUpFrom(startDir)) {
    if (
      fs.existsSync(path.join(dir, 'pnpm-workspace.yaml')) ||
      readPackageJson(dir)?.workspaces != null
    ) {
      return dir;
    }
    if (
      nearestPackage == null &&
      fs.existsSync(path.join(dir, 'package.json'))
    ) {
      nearestPackage = dir;
    }
  }
  return nearestPackage ?? path.resolve(startDir);
}

/**
 * The folders that hold the project's own packages, nearest first: `startDir`
 * and each folder above it up to its workspace root, where a workspace keeps
 * the packages its members share, and never fewer than `reach` folders. Each
 * folder says whether it lies above the project root, where a package belongs
 * to the workspace rather than to the project itself.
 *
 * @param {string} startDir
 * @param {number} reach
 * @returns {Generator<{dir: string, aboveProject: boolean}>}
 */
function* projectFolders(startDir, reach) {
  const projectRoot = findPackageRoot(startDir);
  const workspaceRoot = findWorkspaceRoot(startDir);
  let searched = 0;
  let aboveProject = false;
  let pastWorkspace = false;
  for (const dir of foldersUpFrom(startDir)) {
    if (pastWorkspace && searched >= reach) return;
    yield {dir, aboveProject};
    searched++;
    if (dir === projectRoot) aboveProject = true;
    if (dir === workspaceRoot) pastWorkspace = true;
  }
}

/** package.json fields in which a project declares the version it needs. */
const DECLARING_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];

/**
 * Whether a package found above the project root is the one the project
 * declares: its version satisfies every range the nearest package.json
 * declares for `name`. A project that declares no range for it accepts it, and
 * so does a declaration that is not a version range, such as `workspace:*`.
 * A project that declares a version its workspace does not hold has not
 * installed that version, so the workspace's copy is not its package.
 *
 * @param {string} startDir
 * @param {string} name
 * @param {string} packageDir
 * @returns {boolean}
 */
function isDeclaredVersion(startDir, name, packageDir) {
  const projectRoot = findPackageRoot(startDir);
  const declared = projectRoot ? readPackageJson(projectRoot) : null;
  const version = readPackageJson(packageDir)?.version;
  if (declared == null || typeof version !== 'string') return true;
  return DECLARING_FIELDS.every(field => {
    const ranges = declared[field];
    const range =
      ranges && typeof ranges === 'object' ? ranges[name] : undefined;
    return typeof range !== 'string' || satisfiesRange(version, range);
  });
}

/**
 * Find the project's @astryxdesign/core.
 *
 * Searches the folders that hold the project's packages, nearest first:
 * `startDir` up to its workspace root, and never fewer than five folders. In
 * each folder a `packages/core` whose package.json names @astryxdesign/core
 * (the Astryx repository's own source) comes first, then an installed
 * `node_modules/@astryxdesign/core`. A Core found above the project root
 * counts only when the project declares that version. When no folder holds
 * one, it asks Yarn Plug'n'Play, which keeps no node_modules.
 *
 * @param {string} [startDir]
 * @returns {string|null} the Core package directory, or null when there is none
 */
export function findCoreDir(startDir = process.cwd()) {
  for (const {dir, aboveProject} of projectFolders(startDir, CORE_REACH)) {
    const source = path.join(dir, 'packages', 'core');
    const found = isCoreSource(source)
      ? source
      : installedIn(dir, CORE_PACKAGE);
    if (found == null) continue;
    if (aboveProject && !isDeclaredVersion(startDir, CORE_PACKAGE, found)) {
      break;
    }
    return found;
  }

  return findPnpPackage(startDir, CORE_PACKAGE);
}

/**
 * Where Yarn's Plug'n'Play runtime says a package lives.
 *
 * A PnP project has no node_modules for the walks in this file to find. PnP
 * answers from the project's own dependency graph and ignores NODE_PATH, so
 * asking it keeps the lookup project-local. Outside a PnP process there is
 * nothing to ask.
 *
 * @param {string} startDir
 * @param {string} name
 * @returns {string|null}
 */
function findPnpPackage(startDir, name) {
  if (!process.versions.pnp) return null;
  try {
    const from = path.resolve(startDir);
    const api = createRequire(path.join(from, 'noop.js'))('pnpapi');
    const dir = api.resolveToUnqualified(name, path.join(from, '/'));
    return dir && fs.existsSync(path.join(dir, 'package.json')) ? dir : null;
  } catch {
    // The project does not declare it, or this is not a PnP process after all.
    return null;
  }
}

/**
 * The nearest `node_modules/<name>` at or above `startDir`, found the way
 * Node's resolver finds a package, and the folder whose node_modules holds it.
 * It searches every folder up to the filesystem root and does not ask
 * Plug'n'Play.
 *
 * @param {string} startDir
 * @param {string} name bare package name; callers reject path segments first
 * @returns {{packageDir: string, hostDir: string}|null}
 */
export function findNodeModulesPackage(startDir, name) {
  for (const dir of foldersUpFrom(startDir)) {
    const packageDir = installedIn(dir, name);
    if (packageDir) return {packageDir, hostDir: dir};
  }
  return null;
}

/**
 * Locate a package the project at `startDir` actually installed.
 *
 * Deliberately not `require.resolve`: Node folds NODE_PATH and the global
 * folders into resolution even when `paths` is given, so a package merely
 * reachable from the ambient environment reads as installed here. pnpm's
 * isolated layout puts every package in `node_modules/.pnpm/node_modules`,
 * and Vitest puts that directory on NODE_PATH, so the gap is not theoretical.
 * Reading package.json off disk also sidesteps packages that don't export it,
 * so the version is always available to range-check.
 *
 * Searches the node_modules of `startDir` and the folders above it up to its
 * workspace root, and never fewer than six folders, then asks PnP, which
 * covers the Yarn default layout where that chain does not exist.
 *
 * @param {string} startDir
 * @param {string} name
 * @returns {string|null} the package directory, or null when not installed
 */
export function findInstalledPackage(startDir, name) {
  for (const {dir} of projectFolders(startDir, INSTALLED_REACH)) {
    const packageDir = installedIn(dir, name);
    if (packageDir) return packageDir;
  }
  return findPnpPackage(startDir, name);
}

/**
 * The first of `names` the project at `startDir` installed. It searches the
 * node_modules of `startDir` and each folder above it up to its workspace
 * root, nearest first; an earlier name wins within one folder. A package found
 * above the project root counts only when the project declares that version,
 * and otherwise the search stops. Then it asks Plug'n'Play, in name order.
 *
 * @param {string} startDir
 * @param {readonly string[]} names in order of preference
 * @returns {{name: string, packageDir: string}|null}
 */
export function findProjectPackageOf(startDir, names) {
  search: for (const {dir, aboveProject} of projectFolders(startDir, 1)) {
    for (const name of names) {
      const packageDir = installedIn(dir, name);
      if (packageDir == null) continue;
      if (aboveProject && !isDeclaredVersion(startDir, name, packageDir)) {
        break search;
      }
      return {name, packageDir};
    }
  }
  for (const name of names) {
    const packageDir = findPnpPackage(startDir, name);
    if (packageDir) return {name, packageDir};
  }
  return null;
}

/**
 * Find the monorepo root by looking for the root package.json
 * that has workspaces defined.
 */
export function findProjectRoot(startDir = process.cwd()) {
  let dir = startDir;

  for (let i = 0; i < 5; i++) {
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.workspaces) {
          return dir;
        }
      } catch {
        // skip invalid JSON
      }
    }

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

/**
 * Discover external Astryx-compatible packages from node_modules.
 * Scans for packages with an "astryx" field in their package.json:
 *
 *   { "astryx": { "docs": "./src", "category": "Common", "blocks": "./blocks/components" } }
 *
 * Returns array of { name, category, docsDir, blocksDir }.
 */
export function discoverExternalPackages(startDir = process.cwd()) {
  /** @type {Array<{name: string, category: string, docsDir: string, blocksDir: string | null}>} */
  const externals = [];
  let dir = startDir;

  // Walk up to find node_modules
  let nodeModulesDir = null;
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, 'node_modules');
    if (fs.existsSync(candidate)) {
      nodeModulesDir = candidate;
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  if (!nodeModulesDir) return externals;

  /** @param {string} searchDir */
  const scanDir = (searchDir) => {
    if (!fs.existsSync(searchDir)) return;
    const entries = fs.readdirSync(searchDir, {withFileTypes: true});

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name === '.bin') continue;

      const fullPath = path.join(searchDir, entry.name);

      // Recurse into scoped packages (@org/*)
      if (entry.name.startsWith('@')) {
        scanDir(fullPath);
        continue;
      }

      const pkgJsonPath = path.join(fullPath, 'package.json');
      if (!fs.existsSync(pkgJsonPath)) continue;

      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        if (pkg.name === '@astryxdesign/core') continue;
        if (pkg.astryx && pkg.astryx.docs) {
          externals.push({
            name: pkg.name,
            category: pkg.astryx.category || pkg.name,
            docsDir: path.resolve(fullPath, pkg.astryx.docs),
            blocksDir: pkg.astryx.blocks
              ? path.resolve(fullPath, pkg.astryx.blocks)
              : null,
          });
        }
      } catch {
        // skip invalid JSON
      }
    }
  };

  scanDir(nodeModulesDir);
  return externals;
}

/**
 * List available component directories in packages/core/src.
 * Returns directory names that contain Astryx*.tsx files.
 * @param {string} coreDir
 */
export function listComponents(coreDir) {
  const srcDir = path.join(coreDir, 'src');
  if (!fs.existsSync(srcDir)) return [];

  const entries = fs.readdirSync(srcDir, {withFileTypes: true});
  return entries
    .filter(e => {
      if (!e.isDirectory()) return false;
      // Skip non-component dirs
      if (['hooks', 'theme', 'utils'].includes(e.name)) return false;
      return true;
    })
    .map(e => e.name)
    .sort();
}

/**
 * Does `targetPath` exist with EXACTLY this spelling?
 *
 * `fs.existsSync` answers through the filesystem's own case folding, so on
 * macOS and Windows a probe for `src/button/Button.doc.mjs` succeeds against
 * the real `src/Button/Button.doc.mjs`. Name resolvers built on that probe
 * then resolve a component or hook the caller never named, and hand back a
 * path spelled the way the caller typed it — a path that does not exist on
 * Linux, where the same lookup correctly misses. Every segment below
 * `rootDir` is checked against its parent's real directory listing.
 *
 * @param {string} targetPath - Path to probe; must be inside `rootDir`.
 * @param {string} rootDir - Already-real path; it and its parents are not checked.
 * @returns {boolean}
 */
export function existsCaseExact(targetPath, rootDir) {
  if (!pathExists(targetPath)) return false;

  const rel = path.relative(rootDir, targetPath);
  if (rel === '') return true;
  if (path.isAbsolute(rel) || rel === '..' || rel.startsWith(`..${path.sep}`)) return false;

  let dir = rootDir;
  for (const segment of rel.split(path.sep)) {
    let entries;
    try {
      entries = listDir(dir);
    } catch {
      return false;
    }
    if (!entries.includes(segment)) return false;
    dir = path.join(dir, segment);
  }
  return true;
}
