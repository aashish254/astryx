// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Icon-set authoring (AST-084): find the icon set being authored, read
 * a source module's exports statically, and rewrite the set's data file.
 *
 * Shared by `astryx icon map`, `astryx icon add`, and the icon-set kinds of
 * `astryx integration add`. Nothing here executes package code: exports are
 * read with the static module reader. A rewritten data file is checked the
 * way discovery checks it (the data parser, then every `map` key against
 * Astryx's definitions and the set's own) before it replaces the old one, and
 * it is written in one fixed shape, so the same edits give the same bytes.
 *
 * Errors carry a `code` (an ERR_* code) and `suggestions`, which the api
 * leaves turn into typed CLI errors.
 *
 * @input The directory the command runs in, and a set name when the package
 *   ships more than one
 * @output The set, its source module's icons, and data-file writes
 * @position packages/cli/foundation/discovery — read by api/icon and
 *   api/integration
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {randomUUID} from 'node:crypto';
import {parseIconSetData} from '../../authoring/doctypes/icon-set/parse.mjs';
import {assertWithin} from '../fs/path-safety.mjs';
import {findLocalIntegrationManifestOrNull} from '../integrations/manifest-writer.mjs';
import {loadManifestObject} from '../integrations/integrations.mjs';
import {levenshteinDistance} from '../text/string-utils.mjs';
import {astryxDefinitionsByName} from './icon-definition-discovery.mjs';
import {
  discoverIconSetDirectory,
  resolveIconModule,
} from './icon-set-discovery.mjs';
import {
  exportValueKind,
  moduleExportNames,
  moduleExportOrigin,
} from './module-exports.mjs';

/** @typedef {import('./icon-set-discovery.mjs').DiscoveredIconSet} DiscoveredIconSet */
/** @typedef {import('../../authoring/doctypes/icon-set/type').IconSetData} IconSetData */

/**
 * An authoring error with an ERR_* code and suggestions.
 */
export class IconSetAuthoringError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   * @param {Array<{name: string, reason: string}>} [suggestions]
   */
  constructor(message, code, suggestions = []) {
    super(message);
    this.code = code;
    this.suggestions = suggestions;
  }
}

/**
 * `XMarkIcon` → `x-mark`; `Trash2` → `trash-2`; `ArrowUpDown` →
 * `arrow-up-down`: an icon id from an export name.
 * @param {string} name
 */
export function iconIdOf(name) {
  return name
    .replace(/Icon$/u, '')
    .replace(/([a-z])([A-Z0-9])/gu, '$1-$2')
    .replace(/([0-9])([A-Z])/gu, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/gu, '$1-$2')
    .toLowerCase();
}

/**
 * The name an icon set exports an icon as: PascalCase ending in `Icon`
 * (`Trash2` → `Trash2Icon`; `TrashIcon` stays).
 * @param {string} name
 */
export function iconExportName(name) {
  const pascal = name[0].toUpperCase() + name.slice(1);
  return pascal.endsWith('Icon') ? pascal : `${pascal}Icon`;
}

/**
 * The name an icon set exports a variant as: the icon's name, then the
 * variant's values, then `Icon` (`TrashIcon` solid 20 → `TrashSolid20Icon`).
 * @param {string} iconName the icon's own export
 * @param {{appearance?: string, size?: number, weight?: number}} values
 */
export function variantExportName(iconName, values) {
  const base = iconName.replace(/Icon$/u, '');
  const appearance = (values.appearance ?? '')
    .split('-')
    .map(part => (part ? part[0].toUpperCase() + part.slice(1) : ''))
    .join('');
  const weight =
    values.weight != null ? `W${String(values.weight).replace('.', '_')}` : '';
  return `${base}${appearance}${values.size ?? ''}${weight}Icon`;
}

/**
 * The nearest directory at or above `cwd` with a package.json.
 * @param {string} cwd
 */
function packageDirOf(cwd) {
  let dir = path.resolve(cwd);
  for (let depth = 0; depth < 50; depth++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new IconSetAuthoringError(
    'No package.json found. Run this command inside the icon-set package.',
    'ERR_FILE_NOT_FOUND',
  );
}

/**
 * The icon-set package the command runs in, and the set it edits: the one
 * `selector` names, else the only set.
 * @param {string} cwd
 * @param {string} [selector] a set name
 * @returns {Promise<{packageDir: string, pkg: Record<string, any>, root: string, set: DiscoveredIconSet, sets: DiscoveredIconSet[]}>}
 */
export async function findLocalIconSet(cwd, selector) {
  const packageDir = packageDirOf(cwd);
  /** @type {Record<string, any>} */
  let pkg;
  try {
    pkg = JSON.parse(
      fs.readFileSync(path.join(packageDir, 'package.json'), 'utf-8'),
    );
  } catch (error) {
    throw new IconSetAuthoringError(
      `Cannot read package.json: ${error instanceof Error ? error.message : String(error)}`,
      'ERR_INVALID_ARGUMENT',
    );
  }
  const manifestFile = findLocalIntegrationManifestOrNull(packageDir);
  const manifest = manifestFile
    ? await loadManifestObject(manifestFile, 'Integration manifest', {
        fresh: true,
      })
    : {};
  if (!manifest.iconSets) {
    throw new IconSetAuthoringError(
      'This package ships no icon set. Add one first.',
      'ERR_NOT_FOUND',
      [
        {
          name: 'astryx integration add icon-set <name>',
          reason: 'add an icon set',
        },
      ],
    );
  }
  const root = assertWithin(manifest.iconSets, packageDir, {
    label: 'iconSets root',
  });
  const owner = typeof pkg.name === 'string' ? pkg.name : '(local integration)';
  const found = discoverIconSetDirectory(root, owner);
  const named = selector
    ? found.sets.filter(set => set.name === selector)
    : found.sets;
  if (named.length === 1) {
    return {
      packageDir,
      pkg,
      root,
      set: {...named[0], packageDir},
      sets: found.sets,
    };
  }
  const broken = selector
    ? found.errors.find(error => error.name === selector)
    : null;
  if (broken) {
    throw new IconSetAuthoringError(broken.message, 'ERR_INVALID_ARGUMENT');
  }
  const names = found.sets.map(set => set.name);
  if (named.length === 0 && selector) {
    throw new IconSetAuthoringError(
      `This package has no icon set "${selector}".`,
      'ERR_NOT_FOUND',
      names.map(name => ({name, reason: 'an icon set in this package'})),
    );
  }
  throw new IconSetAuthoringError(
    names.length === 0
      ? `This package has no valid icon set${found.errors.length > 0 ? `: ${found.errors[0].message}` : '.'}`
      : `This package has ${names.length} icon sets; name one with --set.`,
    names.length === 0 ? 'ERR_NOT_FOUND' : 'ERR_INVALID_ARGUMENT',
    names.map(name => ({
      name: `--set ${name}`,
      reason: 'an icon set in this package',
    })),
  );
}

/** The data file's fields, in the order the file is written. */
const DATA_KEYS = [
  'schemaVersion',
  'module',
  'source',
  'generated',
  'adapter',
  'axes',
  'default',
  'themeMap',
  'map',
  'icons',
];

/**
 * A data file's text, in one fixed shape: fields in schema order, `map` keys
 * sorted, two-space JSON, a final newline.
 * @param {IconSetData} data
 */
export function iconSetDataText(data) {
  /** @type {Record<string, unknown>} */
  const ordered = {};
  for (const key of DATA_KEYS) {
    const value = /** @type {Record<string, unknown>} */ (
      /** @type {unknown} */ (data)
    )[key];
    if (value === undefined) continue;
    ordered[key] =
      key === 'map'
        ? Object.fromEntries(
            Object.entries(/** @type {Record<string, string>} */ (value)).sort(
              ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
            ),
          )
        : value;
  }
  for (const [key, value] of Object.entries(data)) {
    if (!DATA_KEYS.includes(key)) ordered[key] = value;
  }
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/**
 * The icon definitions a set may map: Astryx's and its own, by name.
 * @param {DiscoveredIconSet} set
 * @param {string[]} [extra] definition names about to be added
 */
export function mappableDefinitions(set, extra = []) {
  return new Set([
    ...astryxDefinitionsByName().keys(),
    ...set.definitions.map(each => each.doc.name),
    ...extra,
  ]);
}

/**
 * Check a set's next data the way discovery will, then write it in place.
 * Returns a function that puts the old file back.
 * @param {DiscoveredIconSet} set
 * @param {IconSetData} next
 * @param {{extraDefinitions?: string[]}} [options] definitions written in
 *   the same command, which count as declared
 * @returns {() => void}
 */
export function writeIconSetData(set, next, {extraDefinitions = []} = {}) {
  const label = `Icon set "${set.name}"`;
  let parsed;
  try {
    parsed = parseIconSetData(next, `${label} data file`);
  } catch (error) {
    throw new IconSetAuthoringError(
      error instanceof Error ? error.message : String(error),
      'ERR_INVALID_ARGUMENT',
    );
  }
  const known = mappableDefinitions(set, extraDefinitions);
  for (const name of Object.keys(parsed.map ?? {})) {
    if (!known.has(name)) {
      throw new IconSetAuthoringError(
        `"${name}" is not an icon definition. Use an Astryx icon definition (astryx docs icon-definitions), or add your own.`,
        'ERR_INVALID_ARGUMENT',
        [
          ...closestNames(name, [...known]).map(each => ({
            name: each,
            reason: 'a known icon definition',
          })),
          {
            name: `astryx integration add icon-definition ${name} --set ${set.name}`,
            reason: 'add it as your own definition',
          },
        ],
      );
    }
  }
  const text = iconSetDataText(next);
  const before = fs.readFileSync(set.dataPath);
  replaceText(set.dataPath, text);
  return () => {
    if (fs.readFileSync(set.dataPath, 'utf-8') === text) {
      replaceText(set.dataPath, before.toString('utf-8'));
    }
  };
}

/**
 * Replace a file's text atomically.
 * @param {string} file
 * @param {string} text
 */
function replaceText(file, text) {
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.tmp-${randomUUID()}`,
  );
  try {
    fs.writeFileSync(temporary, text, 'utf-8');
    fs.renameSync(temporary, file);
  } catch (error) {
    fs.rmSync(temporary, {force: true});
    throw new IconSetAuthoringError(
      `Could not write ${path.basename(file)}: ${error instanceof Error ? error.message : String(error)}`,
      'ERR_WRITE_FAILED',
    );
  }
}

/**
 * The names closest to one that matched nothing.
 * @param {string} wanted
 * @param {string[]} candidates
 * @param {number} [max]
 */
export function closestNames(wanted, candidates, max = 5) {
  const lower = wanted.toLowerCase();
  return [...new Set(candidates)]
    .map(name => ({
      name,
      distance: levenshteinDistance(lower, name.toLowerCase()),
    }))
    .filter(each => each.distance <= Math.max(2, Math.ceil(lower.length / 3)))
    .sort((a, b) => a.distance - b.distance || (a.name < b.name ? -1 : 1))
    .slice(0, max)
    .map(each => each.name);
}

/**
 * A source module an icon is read from: the file it resolves to, and the
 * specifier to import it by. A package or a package subpath resolves from the
 * set's package (its `exports` map honored) and is imported by that
 * specifier. A relative path inside the set's package is imported by its
 * path (`module` is then the path from the package root).
 * @param {string} from
 * @param {{packageDir: string, pkg: Record<string, any>}} where
 * @returns {{file: string, module: string}}
 */
export function resolveIconSource(from, {packageDir, pkg}) {
  const name = typeof pkg.name === 'string' ? pkg.name : '';
  if (from.startsWith('.') || path.isAbsolute(from)) {
    const target = assertWithin(from, packageDir, {
      label: 'icon source',
      allowAbsolute: true,
    });
    const file = resolveFile(target);
    if (!file) {
      throw new IconSetAuthoringError(
        `"${from}" does not resolve to a module file in this package.`,
        'ERR_FILE_NOT_FOUND',
      );
    }
    return {
      file,
      module: `./${path.relative(packageDir, file).split(path.sep).join('/')}`,
    };
  }
  const file = resolveIconModule(from, packageDir, {name, dir: packageDir});
  if (!file) {
    throw new IconSetAuthoringError(
      `"${from}" does not resolve from ${name || 'this package'}. Install it as a dependency, or check the specifier.`,
      'ERR_NOT_FOUND',
    );
  }
  return {file, module: from};
}

/** @param {string} base */
function resolveFile(base) {
  const extensions = ['', '.mjs', '.js', '.cjs', '.ts', '.tsx', '.jsx', '.mts'];
  for (const candidate of [
    ...extensions.map(extension => `${base}${extension}`),
    ...extensions
      .slice(1)
      .map(extension => path.join(base, `index${extension}`)),
  ]) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

/**
 * Prove a source module has one export, without running it. `default` reads
 * the module's default export.
 * @param {string} file
 * @param {string} module the specifier, for messages
 * @param {string} exportName
 */
export function assertIconExport(file, module, exportName) {
  if (!moduleExportOrigin(file, exportName)) {
    const names = moduleExportNames(file);
    throw new IconSetAuthoringError(
      exportName === 'default'
        ? `"${module}" has no default export.`
        : `"${module}" does not export "${exportName}".`,
      'ERR_NOT_FOUND',
      closestNames(exportName, names).map(name => ({
        name,
        reason: `an export of ${module}`,
      })),
    );
  }
}

/**
 * Every icon a whole library exports, for wrapping it at once: one entry per
 * component, read by its `…Icon` export when it has one (an alias of the
 * same component is recorded once), with its id from the name and the name
 * the set exports it as. Names that are not PascalCase, and exports that are
 * not components, are left out.
 * @param {string} file
 * @returns {Array<{export: string, id: string, name: string}>}
 */
export function libraryIcons(file) {
  /** @type {Map<string, string[]>} */
  const byOrigin = new Map();
  for (const name of moduleExportNames(file)) {
    if (!/^[A-Z][A-Za-z0-9]*$/u.test(name) || name === 'Icon') continue;
    const origin = moduleExportOrigin(file, name);
    if (!origin) continue;
    if (exportValueKind(file, name) !== 'component') continue;
    const key = `${origin.file}\0${origin.name}`;
    const names = byOrigin.get(key) ?? [];
    names.push(name);
    byOrigin.set(key, names);
  }
  /** @type {Map<string, {export: string, id: string, name: string}>} */
  const byId = new Map();
  for (const [key, names] of byOrigin) {
    const local = key.split('\0')[1];
    const withIcon = names.filter(name => name.endsWith('Icon'));
    const preferred =
      withIcon.find(name => name === `${local}Icon`) ??
      names.find(name => name === local) ??
      [...(withIcon.length > 0 ? withIcon : names)].sort(
        (a, b) => a.length - b.length || (a < b ? -1 : 1),
      )[0];
    const id = iconIdOf(preferred);
    if (!id || byId.has(id)) continue;
    byId.set(id, {export: preferred, id, name: iconExportName(preferred)});
  }
  return [...byId.values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
}

/** @param {string} value a single-quoted JavaScript string literal */
function quote(value) {
  return `'${value.replace(/\\/gu, '\\\\').replace(/'/gu, "\\'").replace(/\n/gu, '\\n')}'`;
}

/**
 * The source of one icon definition file, typed IconDefinitionDoc.
 * @param {{name: string, description: string, words: string[]}} doc
 */
export function iconDefinitionSource(doc) {
  return [
    "/** @type {import('@astryxdesign/cli/authoring').IconDefinitionDoc} */",
    'export default {',
    "  type: 'icon-definition',",
    `  name: ${quote(doc.name)},`,
    `  description: ${quote(doc.description)},`,
    `  words: [${doc.words.map(quote).join(', ')}],`,
    '};',
    '',
  ].join('\n');
}

/**
 * Check a new icon definition for a set: a camelCase name no Astryx
 * definition has, a description, and at least one lower-case word.
 * @param {DiscoveredIconSet} set
 * @param {{name: string, description?: string, words?: string[]}} doc
 * @returns {{name: string, description: string, words: string[]}}
 */
export function checkNewDefinition(set, doc) {
  if (!/^[a-z][a-zA-Z0-9]*$/u.test(doc.name)) {
    throw new IconSetAuthoringError(
      `Invalid icon definition name "${doc.name}": use camelCase starting with a lower-case letter.`,
      'ERR_INVALID_ARGUMENT',
    );
  }
  if (astryxDefinitionsByName().has(doc.name)) {
    throw new IconSetAuthoringError(
      `Astryx already has the icon definition "${doc.name}"; map to it instead of adding your own.`,
      'ERR_INVALID_ARGUMENT',
      [{name: `--definition ${doc.name}`, reason: "use Astryx's definition"}],
    );
  }
  const description = (doc.description ?? '').trim();
  const words = [
    ...new Set(
      (doc.words ?? []).map(word => word.trim().toLowerCase()).filter(Boolean),
    ),
  ];
  if (!description || words.length === 0) {
    throw new IconSetAuthoringError(
      `A new icon definition needs --description and --words: one sentence on what the icon is for, and the words people search for.`,
      'ERR_MISSING_ARGUMENT',
    );
  }
  return {name: doc.name, description, words};
}

/**
 * The set's definition file for `name`, and whether it exists.
 * @param {DiscoveredIconSet} set
 * @param {string} name
 */
export function definitionFile(set, name) {
  return assertWithin(`definitions/${name}.doc.mjs`, set.dir, {
    label: 'icon definition file',
  });
}

/**
 * Write one new definition file into the set, refusing to overwrite one.
 * Returns a function that removes it again.
 * @param {DiscoveredIconSet} set
 * @param {{name: string, description: string, words: string[]}} doc
 * @returns {() => void}
 */
export function writeDefinitionFile(set, doc) {
  const file = definitionFile(set, doc.name);
  if (fs.existsSync(file)) {
    throw new IconSetAuthoringError(
      `Refusing to overwrite existing file definitions/${doc.name}.doc.mjs.`,
      'ERR_FILE_EXISTS',
    );
  }
  const text = iconDefinitionSource(doc);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  try {
    fs.writeFileSync(file, text, {encoding: 'utf-8', flag: 'wx'});
  } catch (error) {
    throw new IconSetAuthoringError(
      `Could not write definitions/${doc.name}.doc.mjs: ${error instanceof Error ? error.message : String(error)}`,
      'ERR_WRITE_FAILED',
    );
  }
  return () => {
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf-8') === text) {
      fs.rmSync(file);
    }
  };
}

/** The comment the generated icons module opens with. */
const GENERATED_HEADER = [
  '// Generated by `astryx icon add`: one export per icon of this set.',
  '// Edit with `astryx icon add`; a line edited by hand is kept as written.',
];

/** The local name the generated module gives the set's adapter. */
const ADAPTER_LOCAL = 'adaptIcon';

/**
 * The generated icons module of a set, from the package root: `generated`
 * in its data file, else `<set directory>/<set>.generated.js`.
 * @param {DiscoveredIconSet} set
 * @param {string} packageDir
 */
export function generatedModulePath(set, packageDir) {
  return (
    set.data.generated ??
    `./${path
      .relative(packageDir, path.join(set.dir, `${set.name}.generated.js`))
      .split(path.sep)
      .join('/')}`
  );
}

/**
 * One icon export of the generated module.
 * @typedef {object} GeneratedIcon
 * @property {string} name the export the set exposes
 * @property {string} from the source module: a specifier, or a ./ path from
 *   the package root
 * @property {string} source the source export, or `default`
 * @property {boolean} adapt whether the set's adapter turns it into a
 *   component
 */

/**
 * Add icon exports to the set's generated module, keeping every line it
 * already has: re-exports and adapted exports, each import and export line
 * sorted, the adapter imported once when any export needs it. An export the
 * module already has with the same source is left as it is; one with
 * another source is refused. Returns a function that puts the old file back.
 * @param {string} packageDir
 * @param {string} generated the module's ./ path from the package root
 * @param {{module: string, export: string} | undefined} adapter
 * @param {GeneratedIcon[]} icons
 * @returns {{changed: boolean, undo: () => void}}
 */
export function writeGeneratedIcons(packageDir, generated, adapter, icons) {
  const file = assertWithin(generated, packageDir, {
    label: 'generated icons module',
  });
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : null;
  const fileDir = path.dirname(file);
  /** @param {string} from */
  const specifierOf = from => {
    if (!from.startsWith('./')) return from;
    const relative = path
      .relative(fileDir, path.join(packageDir, from))
      .split(path.sep)
      .join('/');
    return relative.startsWith('.') ? relative : `./${relative}`;
  };
  const lines = (before ?? '')
    .split('\n')
    .filter(line => line.trim() !== '' && !GENERATED_HEADER.includes(line));
  const imports = new Set(
    lines.filter(
      line =>
        line.startsWith('import ') && !line.includes(` as ${ADAPTER_LOCAL} `),
    ),
  );
  const exports = new Set(lines.filter(line => !line.startsWith('import ')));
  /** @param {string} name */
  const existing = name =>
    [...exports].find(line =>
      new RegExp(
        `(?:\\b(?:as\\s+|export\\s+\\{\\s*|export const\\s+))${name}\\b`,
        'u',
      ).test(line),
    );
  let changed = false;
  for (const icon of icons) {
    const specifier = specifierOf(icon.from);
    /** @type {string[]} */
    const want = [];
    /** @type {string[]} */
    const wantImports = [];
    if (icon.adapt) {
      const local = `${icon.name}Source`;
      wantImports.push(
        icon.source === 'default'
          ? `import ${local} from '${specifier}';`
          : `import {${icon.source === local ? local : `${icon.source} as ${local}`}} from '${specifier}';`,
      );
      want.push(`export const ${icon.name} = ${ADAPTER_LOCAL}(${local});`);
    } else {
      want.push(
        icon.source === icon.name
          ? `export {${icon.name}} from '${specifier}';`
          : `export {${icon.source} as ${icon.name}} from '${specifier}';`,
      );
    }
    const prior = existing(icon.name);
    if (prior) {
      if (prior !== want[0]) {
        throw new IconSetAuthoringError(
          `The generated icons module already exports ${icon.name} as \`${prior}\`. Pass another name, or edit ${generated}.`,
          'ERR_FILE_EXISTS',
        );
      }
      continue;
    }
    for (const line of wantImports) imports.add(line);
    for (const line of want) exports.add(line);
    changed = true;
  }
  if (!changed) return {changed: false, undo: () => {}};
  const needsAdapter = [...exports].some(line =>
    line.includes(`= ${ADAPTER_LOCAL}(`),
  );
  if (needsAdapter && !adapter) {
    throw new IconSetAuthoringError(
      'An icon here is not a component, so the set needs an adapter. Declare "adapter": {"module": "./src/adapt.js", "export": "adapt"} in the data file: a function in your package that turns the library export into a component (astryx docs cli/integrations/building-blocks/icon-sets library-shapes).',
      'ERR_INVALID_ARGUMENT',
    );
  }
  const text = [
    ...GENERATED_HEADER,
    ...(needsAdapter && adapter
      ? [
          `import {${adapter.export} as ${ADAPTER_LOCAL}} from '${specifierOf(adapter.module)}';`,
        ]
      : []),
    ...[...imports].sort(),
    ...[...exports].sort(),
    '',
  ].join('\n');
  fs.mkdirSync(fileDir, {recursive: true});
  replaceText(file, text);
  return {
    changed: true,
    undo: () => {
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf-8') !== text)
        return;
      if (before == null) fs.rmSync(file);
      else replaceText(file, before);
    },
  };
}

/**
 * Whether the set's own module exports `name`, read without running it, and
 * the line its entry needs when it does not.
 * @param {DiscoveredIconSet} set
 * @param {{packageDir: string, pkg: Record<string, any>}} where
 * @param {string} generated the generated module's ./ path from the package root
 * @param {string} name
 * @returns {string | null} a note for the author, or null when nothing is needed
 */
export function setModuleNote(set, where, generated, name) {
  const entry = resolveIconModule(set.data.module, where.packageDir, {
    name: where.pkg.name,
    dir: where.packageDir,
  });
  if (entry && moduleExportOrigin(entry, name)) return null;
  const target = path.join(where.packageDir, generated);
  if (!entry) {
    return `"${set.data.module}" does not resolve yet: point its package.json "exports" at a file that has \`export * from '${generated.replace(/\.[cm]?[jt]sx?$/u, '.js')}';\`.`;
  }
  let relative = path
    .relative(path.dirname(entry), target)
    .split(path.sep)
    .join('/');
  if (!relative.startsWith('.')) relative = `./${relative}`;
  return `Add \`export * from '${relative}';\` to ${path.relative(where.packageDir, entry).split(path.sep).join('/')}, so the icons import from ${set.data.module}.`;
}
