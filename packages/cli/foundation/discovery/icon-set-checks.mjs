// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The icon-set checks of `astryx integration check` and
 * `astryx doctor integration validate` (AST-084 FR13, FR14).
 *
 * For each set under a package's `iconSets` root it proves, without executing
 * anything, that the data file matches the package:
 *   errors   an invalid descriptor or data file (which covers a duplicate id,
 *            an icon with no words, a `fills` value that is not an IconName or
 *            a name filled twice, and a variant or default outside `axes`);
 *            an `export` its module does not export at runtime (read
 *            statically, re-exports followed); a theme map whose keys or
 *            values disagree with `fills`;
 *   warnings a data file generated from an upstream version other than the
 *            one the package depends on; a set with an upstream and no license
 *            notice file in its directory or package.
 * A theme-map value the reader cannot follow (anything but a binding or
 * `<Name />`) is left unchecked rather than reported
 * (`architecture:cli-surface` DEC-7).
 *
 * @input A package directory and its loaded integration roots
 * @output Issues in the integration issue format
 * @position packages/cli/foundation/discovery — read by validate-integration
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {findInstalledPackage} from '../fs/paths.mjs';
import {satisfiesRange} from '../env/semver.mjs';
import {
  NOTICE_FILE_RE,
  discoverIconSetDirectory,
  resolveIconModule,
} from './icon-set-discovery.mjs';
import {moduleExportOrigin, staticExportBindings} from './module-exports.mjs';
import {
  issueError,
  issueWarning,
} from '../integrations/validate-contributions.mjs';

/** @typedef {import('../integrations/issue').AstryxIntegrationIssue} Issue */
/** @typedef {import('./icon-set-discovery.mjs').DiscoveredIconSet} DiscoveredIconSet */

/** An invalid descriptor or data file. */
export const INVALID_ICON_SET = 'invalid_icon_set';
/** An `export` (or module) the package does not provide at runtime. */
export const ICON_EXPORT_MISSING = 'icon_export_missing';
/** A theme map whose keys or values disagree with `fills`. */
export const ICON_THEME_MAP_MISMATCH = 'icon_theme_map_mismatch';
/** Data generated from another upstream version than the package uses. */
export const ICON_SOURCE_VERSION_DRIFT = 'icon_source_version_drift';
/** A set with an upstream and no license notice. */
export const ICON_LICENSE_NOTICE_MISSING = 'icon_license_notice_missing';

/**
 * @param {string} file
 * @returns {Record<string, any> | null}
 */
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Every icon-set issue of one integration package.
 * @param {string} packageDir
 * @param {{name: string, iconSets?: string}} loaded
 * @returns {Issue[]}
 */
export function iconSetIssues(packageDir, loaded) {
  if (!loaded.iconSets) return [];
  /** @type {Issue[]} */
  const issues = [];
  const found = discoverIconSetDirectory(loaded.iconSets, loaded.name);
  for (const each of found.errors) {
    issues.push(issueError(INVALID_ICON_SET, each.message));
  }
  const pkg = readJson(path.join(packageDir, 'package.json')) ?? {};
  for (const set of found.sets) {
    issues.push(...checkExports(set, packageDir, loaded.name));
    issues.push(...checkUpstream(set, packageDir, pkg));
  }
  return issues;
}

/**
 * The export and theme-map checks of one set.
 * @param {DiscoveredIconSet} set
 * @param {string} packageDir
 * @param {string} packageName
 * @returns {Issue[]}
 */
function checkExports(set, packageDir, packageName) {
  /** @type {Issue[]} */
  const issues = [];
  const label = `Icon set "${set.name}"`;
  /** @type {Map<string, string | null>} */
  const files = new Map();
  /** @param {string} specifier */
  const fileOf = specifier => {
    if (!files.has(specifier)) {
      files.set(
        specifier,
        resolveIconModule(specifier, packageDir, {
          name: packageName,
          dir: packageDir,
        }),
      );
    }
    return /** @type {string | null} */ (files.get(specifier));
  };
  /** @type {Map<string, {file: string, name: string} | null>} */
  const origins = new Map();
  /**
   * The origin of one export, or an issue when its module lacks it.
   * @param {string} specifier
   * @param {string} name
   * @param {string} what
   */
  const originOf = (specifier, name, what) => {
    const key = `${specifier}\0${name}`;
    if (origins.has(key)) return origins.get(key) ?? null;
    const file = fileOf(specifier);
    const origin = file ? moduleExportOrigin(file, name) : null;
    origins.set(key, origin);
    if (!file) {
      issues.push(
        issueError(
          ICON_EXPORT_MISSING,
          `${label}: ${what} is read from "${specifier}", which does not resolve from the package. Fix "module" in ${set.name}.icons.json, or add the subpath to package.json "exports".`,
        ),
      );
    } else if (!origin) {
      issues.push(
        issueError(
          ICON_EXPORT_MISSING,
          `${label}: ${what} names export "${name}", which "${specifier}" does not export at runtime. Export it, or fix the name in ${set.name}.icons.json.`,
        ),
      );
    }
    return origin;
  };

  /** @type {Map<string, {id: string, origin: {file: string, name: string} | null}>} */
  const fillers = new Map();
  for (const icon of set.data.icons) {
    const module = icon.module ?? set.data.module;
    const origin = originOf(module, icon.export, `icon "${icon.id}"`);
    for (const name of icon.fills ?? [])
      fillers.set(name, {id: icon.id, origin});
    for (const variant of icon.variants ?? []) {
      originOf(
        variant.module ?? module,
        variant.export,
        `a variant of icon "${icon.id}"`,
      );
    }
  }

  const themeMap = set.data.themeMap;
  if (fillers.size === 0) return issues;
  if (!themeMap) {
    issues.push(
      issueError(
        ICON_THEME_MAP_MISMATCH,
        `${label} fills ${[...fillers.keys()].join(', ')} but names no "themeMap". Export an object keyed by exactly the filled names and name it in ${set.name}.icons.json.`,
      ),
    );
    return issues;
  }
  const mapOrigin = originOf(set.data.module, themeMap, `the theme map`);
  const file = fileOf(set.data.module);
  if (!mapOrigin || !file) return issues;
  const bindings = staticExportBindings(file, themeMap);
  // A theme map built at runtime cannot be read, so it is not checked.
  if (!bindings) return issues;
  for (const key of bindings.keys()) {
    if (!fillers.has(key)) {
      issues.push(
        issueError(
          ICON_THEME_MAP_MISMATCH,
          `${label}: theme map "${themeMap}" has "${key}", which no icon fills. Remove it, or add "${key}" to the "fills" of the icon that draws it.`,
        ),
      );
    }
  }
  for (const [name, filler] of fillers) {
    if (!bindings.has(name)) {
      issues.push(
        issueError(
          ICON_THEME_MAP_MISMATCH,
          `${label}: theme map "${themeMap}" has no "${name}", which icon "${filler.id}" fills. Add it.`,
        ),
      );
      continue;
    }
    const value = bindings.get(name);
    if (!value || !filler.origin) continue;
    if (
      value.file !== filler.origin.file ||
      value.name !== filler.origin.name
    ) {
      issues.push(
        issueError(
          ICON_THEME_MAP_MISMATCH,
          `${label}: theme map "${themeMap}" maps "${name}" to other artwork than icon "${filler.id}", which fills it. Point it at the icon's export.`,
        ),
      );
    }
  }
  return issues;
}

/**
 * The upstream checks of one set: version drift and license notices.
 * @param {DiscoveredIconSet} set
 * @param {string} packageDir
 * @param {Record<string, any>} pkg
 * @returns {Issue[]}
 */
function checkUpstream(set, packageDir, pkg) {
  const source = set.data.source;
  if (!source) return [];
  /** @type {Issue[]} */
  const issues = [];
  const label = `Icon set "${set.name}"`;
  const range = ['dependencies', 'peerDependencies', 'optionalDependencies']
    .map(field => pkg[field]?.[source.package])
    .find(value => typeof value === 'string');
  const installedDir = findInstalledPackage(packageDir, source.package);
  const installed = installedDir
    ? readJson(path.join(installedDir, 'package.json'))?.version
    : undefined;
  if (typeof installed === 'string' && installed !== source.version) {
    issues.push(
      issueWarning(
        ICON_SOURCE_VERSION_DRIFT,
        `${label} was generated from ${source.package}@${source.version}, but the package resolves ${source.package}@${installed}. Regenerate ${set.name}.icons.json.`,
      ),
    );
  } else if (
    installed == null &&
    range != null &&
    !safeSatisfies(source.version, range)
  ) {
    issues.push(
      issueWarning(
        ICON_SOURCE_VERSION_DRIFT,
        `${label} was generated from ${source.package}@${source.version}, but the package depends on ${source.package}@${range}. Regenerate ${set.name}.icons.json.`,
      ),
    );
  }
  const rootNotices = safeList(packageDir).filter(name =>
    NOTICE_FILE_RE.test(name),
  );
  if (set.notices.length === 0 && rootNotices.length === 0) {
    issues.push(
      issueWarning(
        ICON_LICENSE_NOTICE_MISSING,
        `${label} is generated from ${source.package} but ships no license notice. Copy the library's LICENSE (and NOTICE, if any) into the set directory or the package root.`,
      ),
    );
  }
  return issues;
}

/** @param {string} version @param {string} range */
function safeSatisfies(version, range) {
  try {
    return satisfiesRange(version, range);
  } catch {
    // A range this reader cannot judge is not reported.
    return true;
  }
}

/** @param {string} dir */
function safeList(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}
