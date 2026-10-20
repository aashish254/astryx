// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The icon-set checks of `astryx integration check` and
 * `astryx doctor integration validate` (AST-084 FR13, FR14).
 *
 * For each set under a package's `iconSets` root it proves, without executing
 * anything, that the data file matches the package:
 *   errors   an invalid descriptor, data file, or definition file (which covers
 *            a duplicate id, an icon with no words, a `map` key that is
 *            neither an Astryx icon definition nor one the set declares, a
 *            `map` value that is not an icon id, and a variant or default
 *            outside `axes`); a built-in definition missing from `map`; an
 *            `export` its module does not export at runtime (read statically,
 *            re-exports followed); a theme map whose keys or values disagree
 *            with the built-in entries of `map`;
 *   warnings an Astryx definition that is not built in and missing from
 *            `map`; a definition the set declares that is missing from `map`,
 *            or whose name is an Astryx definition; a data file generated from an upstream version
 *            other than the one the package depends on; a set with an
 *            upstream and no license notice file in its directory or package.
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
import {
  exportValueKind,
  moduleExportOrigin,
  staticExportBindings,
  unfollowedReexports,
} from './module-exports.mjs';
import {astryxIconDefinitions} from './icon-definition-discovery.mjs';
import {rankIcons} from './icon-ranking.mjs';
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
/** A theme map whose keys or values disagree with the built-in `map` entries. */
export const ICON_THEME_MAP_MISMATCH = 'icon_theme_map_mismatch';
/** A built-in definition missing from the set's `map`. */
export const ICON_BUILTIN_DEFINITION_MISSING =
  'icon_builtin_definition_missing';
/** A theme-map entry the static reader cannot read. */
export const ICON_THEME_MAP_UNCHECKED = 'icon_theme_map_unchecked';
/** An icon read from a module other than the set's package public entry. */
export const ICON_MODULE_NOT_PUBLIC = 'icon_module_not_public';
/** An icon export not named `<Name>Icon`. */
export const ICON_EXPORT_NAME = 'icon_export_name';
/** An icon export that is a literal, not a component. */
export const ICON_NOT_COMPONENT = 'icon_not_component';
/** An Astryx definition, not built in, missing from the set's `map`. */
export const ICON_DEFINITION_MISSING = 'icon_definition_missing';
/** A definition the set declares whose name is an Astryx definition. */
export const ICON_DEFINITION_SHADOWED = 'icon_definition_shadowed';
/** A definition the set declares that is missing from its `map`. */
export const ICON_DEFINITION_UNUSED = 'icon_definition_unused';
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
    issues.push(...checkContract({...set, packageDir}, loaded.name, pkg));
    issues.push(...checkDefinitions(set));
    issues.push(...checkExports(set, packageDir, loaded.name));
    issues.push(...checkUpstream(set, packageDir, pkg));
  }
  return issues;
}

/**
 * The icon export contract of one set: every icon and variant is read from
 * the package's public entry (its name, or one of its `exports` subpaths),
 * and named `<Name>Icon`; a declared generated module and adapter exist.
 * @param {DiscoveredIconSet} set
 * @param {string} packageName
 * @param {Record<string, any>} pkg
 * @returns {Issue[]}
 */
function checkContract(set, packageName, pkg) {
  /** @type {Issue[]} */
  const issues = [];
  const label = `Icon set "${set.name}"`;
  const subpaths =
    pkg.exports != null &&
    typeof pkg.exports === 'object' &&
    !Array.isArray(pkg.exports)
      ? Object.keys(pkg.exports).filter(
          key => key.startsWith('./') && !key.includes('*'),
        )
      : [];
  const publicModules = new Set([
    packageName,
    ...subpaths.map(subpath => `${packageName}/${subpath.slice(2)}`),
  ]);
  /** @param {string} module @param {string} what */
  const checkModule = (module, what) => {
    if (!publicModules.has(module)) {
      issues.push(
        issueError(
          ICON_MODULE_NOT_PUBLIC,
          `${label}: ${what} is read from "${module}", which is not ${packageName} or one of its package.json "exports" subpaths. Every icon is a named export of the set's own package; re-export it there (\`astryx icon add\` does this).`,
        ),
      );
    }
  };
  /** @param {string} name @param {string} what */
  const checkName = (name, what) => {
    if (!/^[A-Z][A-Za-z0-9]*Icon$/u.test(name)) {
      issues.push(
        issueWarning(
          ICON_EXPORT_NAME,
          `${label}: ${what} is exported as "${name}"; icon exports are named <Name>Icon, such as TrashIcon.`,
        ),
      );
    }
  };
  checkModule(set.data.module, 'the set');
  for (const icon of set.data.icons) {
    if (icon.module && icon.module !== set.data.module) {
      checkModule(icon.module, `icon "${icon.id}"`);
    }
    checkName(icon.export, `icon "${icon.id}"`);
    for (const variant of icon.variants ?? []) {
      if (
        variant.module &&
        variant.module !== (icon.module ?? set.data.module)
      ) {
        checkModule(variant.module, `a variant of icon "${icon.id}"`);
      }
      checkName(variant.export, `a variant of icon "${icon.id}"`);
    }
  }
  const packageDir = /** @type {string} */ (set.packageDir);
  if (set.data.generated) {
    const file = path.join(packageDir, set.data.generated);
    if (!fs.existsSync(file)) {
      issues.push(
        issueError(
          ICON_EXPORT_MISSING,
          `${label}: its generated icons module "${set.data.generated}" does not exist. Run \`astryx icon add\` for each icon, or remove "generated".`,
        ),
      );
    }
  }
  if (set.data.adapter) {
    const file = resolveFile(path.join(packageDir, set.data.adapter.module));
    if (!file || !moduleExportOrigin(file, set.data.adapter.export)) {
      issues.push(
        issueError(
          ICON_EXPORT_MISSING,
          `${label}: its adapter "${set.data.adapter.export}" from "${set.data.adapter.module}" does not exist. Export the function there, or fix "adapter".`,
        ),
      );
    }
  }
  return issues;
}

/** @param {string} base */
function resolveFile(base) {
  for (const candidate of [
    base,
    ...['.mjs', '.js', '.cjs', '.ts', '.tsx', '.jsx', '.mts'].map(
      extension => `${base}${extension}`,
    ),
  ]) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // Try the next.
    }
  }
  return null;
}

/**
 * The definition checks of one set's `map`: every built-in definition mapped
 * (error), every other Astryx definition mapped (warning), and each
 * definition the set declares mapped and not already an Astryx definition
 * (warnings). One finding per definition; a finding about an unmapped
 * definition carries a `suggestion` when one of the set's icons draws it by
 * the lookup's own scorer.
 * @param {DiscoveredIconSet} set
 * @returns {Issue[]}
 */
function checkDefinitions(set) {
  /** @type {Issue[]} */
  const issues = [];
  const label = `Icon set "${set.name}"`;
  const mapped = new Set(Object.keys(set.data.map ?? {}));
  const astryx = astryxIconDefinitions().definitions.map(each => each.doc);
  for (const doc of astryx) {
    if (mapped.has(doc.name)) continue;
    const suggestion = suggestIcon(set, doc);
    const hint = suggestion
      ? ` Suggested: astryx icon map ${doc.name} ${suggestion.icon}.`
      : '';
    const message = doc.builtIn
      ? `${label} maps no icon to the built-in icon definition "${doc.name}" (${doc.description} Words: ${doc.words.join(', ')}.). Every set maps every built-in definition: add it to "map" in ${set.name}.icons.json with the id of the icon that draws it.${hint}`
      : `${label} maps no icon to the Astryx icon definition "${doc.name}" (${doc.description} Words: ${doc.words.join(', ')}.). Add it to "map" with the id of the icon that draws it, so templates that use it get your icon.${hint}`;
    const issue = doc.builtIn
      ? issueError(ICON_BUILTIN_DEFINITION_MISSING, message)
      : issueWarning(ICON_DEFINITION_MISSING, message);
    issues.push(suggestion ? {...issue, suggestion} : issue);
  }
  const names = new Set(astryx.map(doc => doc.name));
  for (const {doc} of set.definitions) {
    if (names.has(doc.name)) {
      issues.push(
        issueWarning(
          ICON_DEFINITION_SHADOWED,
          `${label} declares the icon definition "${doc.name}", which Astryx now has. Map your icon to Astryx's definition and remove definitions/${doc.name}.doc.mjs; Astryx's is the one templates use.`,
        ),
      );
    } else if (!mapped.has(doc.name)) {
      const suggestion = suggestIcon(set, doc);
      const issue = issueWarning(
        ICON_DEFINITION_UNUSED,
        `${label} declares the icon definition "${doc.name}", but "map" names no icon for it. Add it to "map" with the id of the icon that draws it, or remove definitions/${doc.name}.doc.mjs.${suggestion ? ` Suggested: astryx icon map ${doc.name} ${suggestion.icon}.` : ''}`,
      );
      issues.push(suggestion ? {...issue, suggestion} : issue);
    }
  }
  return issues;
}

/** The lowest score a suggestion needs: an exact match on an id or a word. */
const SUGGESTION_FLOOR = 80;

/**
 * The set's icon that best draws one definition, by the icon lookup's own
 * scorer: the definition's name (`chevronDown` reads as `chevron down`) and
 * then each of its words, in order, as queries; the first query whose best
 * match is an exact one wins. Null when no query finds one.
 * @param {DiscoveredIconSet} set
 * @param {import('../../authoring/doctypes/icon-definition/type').IconDefinitionDoc} doc
 * @returns {{map: string, icon: string} | null}
 */
export function suggestIcon(set, doc) {
  const name = doc.name.replace(/([a-z0-9])([A-Z])/gu, '$1 $2').toLowerCase();
  // Score the icons by what they are, not by what the map already says.
  const bare = {...set, data: {...set.data, map: {}}};
  for (const query of [name, ...doc.words]) {
    const [best] = rankIcons([bare], query);
    if (best && best.score >= SUGGESTION_FLOOR) {
      return {map: doc.name, icon: best.id};
    }
  }
  return null;
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
   * @param {boolean} [component] whether the export must be a component
   */
  const originOf = (specifier, name, what, component = true) => {
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
      const unfollowed = unfollowedReexports(file);
      issues.push(
        issueError(
          ICON_EXPORT_MISSING,
          unfollowed.length > 0
            ? `${label}: ${what} names export "${name}", which could not be found in "${specifier}": the reader could not follow its re-export from ${unfollowed.map(each => `"${each}"`).join(', ')}. Install that package as a dependency, or re-export the icon by name from a file in this package.`
            : `${label}: ${what} names export "${name}", which "${specifier}" does not export at runtime. Export it, or fix the name in ${set.name}.icons.json.`,
        ),
      );
    } else if (component && exportValueKind(file, name) === 'data') {
      issues.push(
        issueError(
          ICON_NOT_COMPONENT,
          `${label}: ${what} names export "${name}", which is a value, not a component. Export a React component, or add it with \`astryx icon add\` and declare an "adapter" that turns it into one.`,
        ),
      );
    }
    return origin;
  };

  // The theme map is keyed by the built-in definitions in `map`: the shared
  // names Core renders.
  const builtIn = new Set(
    astryxIconDefinitions()
      .definitions.filter(definition => definition.doc.builtIn)
      .map(definition => definition.doc.name),
  );
  /** @type {Map<string, {file: string, name: string} | null>} */
  const iconOrigins = new Map();
  for (const icon of set.data.icons) {
    const module = icon.module ?? set.data.module;
    iconOrigins.set(
      icon.id,
      originOf(module, icon.export, `icon "${icon.id}"`),
    );
    for (const variant of icon.variants ?? []) {
      originOf(
        variant.module ?? module,
        variant.export,
        `a variant of icon "${icon.id}"`,
      );
    }
  }

  /** @type {Map<string, {id: string, origin: {file: string, name: string} | null}>} */
  const fillers = new Map();
  for (const [name, id] of Object.entries(set.data.map ?? {})) {
    if (builtIn.has(name)) {
      fillers.set(name, {id, origin: iconOrigins.get(id) ?? null});
    }
  }
  const themeMap = set.data.themeMap;
  if (fillers.size === 0) return issues;
  if (!themeMap) {
    issues.push(
      issueError(
        ICON_THEME_MAP_MISMATCH,
        `${label} maps the built-in icon definitions ${[...fillers.keys()].join(', ')} but names no "themeMap". Export an object keyed by exactly those names and name it in ${set.name}.icons.json.`,
      ),
    );
    return issues;
  }
  const mapOrigin = originOf(set.data.module, themeMap, `the theme map`, false);
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
          `${label}: theme map "${themeMap}" has "${key}", which "map" does not map. Remove it, or add "${key}" to "map" with the id of the icon that draws it.`,
        ),
      );
    }
  }
  for (const [name, filler] of fillers) {
    if (!bindings.has(name)) {
      issues.push(
        issueError(
          ICON_THEME_MAP_MISMATCH,
          `${label}: theme map "${themeMap}" has no "${name}", which "map" maps to icon "${filler.id}". Add it.`,
        ),
      );
      continue;
    }
    const value = bindings.get(name);
    if (!value) {
      issues.push(
        issueWarning(
          ICON_THEME_MAP_UNCHECKED,
          `${label}: theme map "${themeMap}" has an entry for "${name}" the static reader cannot read, so it was not checked. Write it as the icon's binding (${name}: TrashIcon), an element (<TrashIcon />), or createElement(TrashIcon).`,
        ),
      );
      continue;
    }
    if (!filler.origin) continue;
    if (
      value.file !== filler.origin.file ||
      value.name !== filler.origin.name
    ) {
      issues.push(
        issueError(
          ICON_THEME_MAP_MISMATCH,
          `${label}: theme map "${themeMap}" maps "${name}" to other artwork than icon "${filler.id}", which "map" names for it. Point it at the icon's export.`,
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
