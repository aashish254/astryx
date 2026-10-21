// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Source-level checks that what an integration package tells apps to
 * import is importable, read without a build.
 *
 * @input A package directory and its loaded integration record.
 * @output Warnings for: a template source with no default export; a
 *   component doc's `import` or a template's public import whose subpath
 *   package.json `exports` does not declare (or that names another package);
 *   a component example that imports an undeclared subpath or a name the
 *   package does not export; a template source that imports a relative path
 *   outside the templates root, an undeclared subpath of its own package or
 *   of Core, or a name its package does not export; a block whose
 *   `exampleFor`/`componentsUsed` names no known component.
 * @position foundation/integrations, beside the other on-disk contribution
 *   validators; run by `astryx doctor integration validate` (and so by
 *   `integration check`) through api/integration/validate-integration.mjs.
 *
 * An `exports` target may point at build output that does not exist yet, so
 * only the declared subpath is judged here, never the target file. A name is
 * judged only when a declared target exists on disk and its export list can be
 * read completely; anything less is left to `integration verify`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {parse} from '@babel/parser';
import {findCoreDir} from '../fs/paths.mjs';
import {
  discoverIntegrationComponents,
  discoverOwnedComponents,
} from '../discovery/component-discovery.mjs';
import {loadComponentDoc} from '../discovery/component-loader.mjs';
import {discoverIntegrationTemplatesForOne} from '../discovery/template-adapter.mjs';
import {issueWarning} from './validate-contributions.mjs';
import {
  allTargets,
  importable,
  isRecord,
  subpathDeclaration,
} from './exports-subpaths.mjs';

/**
 * @typedef {import('./issue').AstryxIntegrationIssue} Issue
 */

const CORE = '@astryxdesign/core';
const MODULE_EXTENSIONS = [
  '.tsx',
  '.ts',
  '.mts',
  '.jsx',
  '.mjs',
  '.js',
  '.cjs',
  '.cts',
];

/** @param {string} file */
function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

/** @param {string} file */
function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/** @param {string} from @param {string} to */
function rel(from, to) {
  return path.relative(from, to).split(path.sep).join('/');
}

// ── Import specifiers ───────────────────────────────────────────────

/**
 * Split a bare specifier into its package name and `./`-prefixed subpath.
 * @param {string} specifier
 * @returns {{pkg: string, subpath: string} | null}
 */
export function splitSpecifier(specifier) {
  const m = /^((?:@[^/\s]+\/)?[^/\s]+)(\/.*)?$/.exec(specifier);
  if (!m || specifier.startsWith('.') || specifier.startsWith('/')) return null;
  return {pkg: m[1], subpath: m[2] ? `.${m[2]}` : '.'};
}

/**
 * @typedef {object} ImportBinding
 * @property {string} imported the exported name (`default` for a default import)
 * @property {boolean} typeOnly
 */

/**
 * @typedef {object} ImportStatement
 * @property {string} source
 * @property {ImportBinding[]} names
 * @property {boolean} namespace
 */

const PARSE_PLUGINS = /** @type {any} */ ([
  'jsx',
  'typescript',
  'decorators-legacy',
  'importAttributes',
  'exportDefaultFrom',
]);

/** @param {string} text */
function parseModuleText(text) {
  return parse(text, {
    sourceType: 'module',
    allowImportExportEverywhere: true,
    allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true,
    errorRecovery: true,
    plugins: PARSE_PLUGINS,
  });
}

const IMPORT_RE =
  /(?:^|[;\n])\s*import\s+(type\s+)?([^'";]*?)\s*from\s*['"]([^'"]+)['"]/g;

/**
 * Read the import statements of a module or a snippet: named, default,
 * aliased, namespace and type-only. A snippet that does not parse (an example
 * with elisions, say) falls back to reading `import … from '…'` lines.
 * @param {string} text
 * @returns {ImportStatement[]}
 */
export function readImports(text) {
  /** @type {ImportStatement[]} */
  const out = [];
  let ast;
  try {
    ast = parseModuleText(text);
  } catch {
    // Not a module: read the import lines below.
  }
  if (ast) {
    for (const node of ast.program.body) {
      if (node.type !== 'ImportDeclaration') continue;
      const typeOnly = node.importKind === 'type';
      /** @type {ImportStatement} */
      const statement = {
        source: String(node.source.value),
        names: [],
        namespace: false,
      };
      for (const s of node.specifiers ?? []) {
        if (s.type === 'ImportDefaultSpecifier') {
          statement.names.push({imported: 'default', typeOnly});
        } else if (s.type === 'ImportNamespaceSpecifier') {
          statement.namespace = true;
        } else if (s.type === 'ImportSpecifier') {
          const imported =
            s.imported.type === 'Identifier'
              ? s.imported.name
              : String(s.imported.value);
          statement.names.push({
            imported,
            typeOnly: typeOnly || s.importKind === 'type',
          });
        }
      }
      out.push(statement);
    }
    return out;
  }
  for (const m of text.matchAll(IMPORT_RE)) {
    const typeOnly = Boolean(m[1]);
    const clause = m[2].trim();
    /** @type {ImportStatement} */
    const statement = {
      source: m[3],
      names: [],
      namespace: /\*\s*as\s/.test(clause),
    };
    const braces = /\{([^}]*)\}/.exec(clause);
    const head = clause
      .replace(/\{[^}]*\}/, '')
      .replace(/\*\s*as\s+[\w$]+/, '');
    const defaultName = /^([\w$]+)/.exec(head.trim());
    if (defaultName) statement.names.push({imported: 'default', typeOnly});
    if (braces) {
      for (const part of braces[1].split(',')) {
        const item = part.trim();
        if (!item) continue;
        const t = /^type\s+/.test(item);
        const name = item
          .replace(/^type\s+/, '')
          .split(/\s+as\s+/)[0]
          .trim();
        if (/^[\w$]+$/.test(name))
          statement.names.push({imported: name, typeOnly: typeOnly || t});
      }
    }
    out.push(statement);
  }
  return out;
}

// ── package.json exports ────────────────────────────────────────────

/** @typedef {import('./exports-subpaths.mjs').SubpathDeclaration} SubpathDeclaration */

/**
 * The files on disk a declared subpath can load, in condition order of the
 * package.json (any condition); empty when none exists yet (build output).
 * @param {string} packageDir
 * @param {SubpathDeclaration} declaration
 * @returns {string[]}
 */
function existingTargets(packageDir, declaration) {
  if (declaration.state !== 'declared') return [];
  const root = path.resolve(packageDir);
  return allTargets(declaration.value)
    .filter(target => target.startsWith('./'))
    .map(target =>
      path.resolve(root, target.replaceAll('*', declaration.wildcard ?? '')),
    )
    .filter(
      file =>
        (file === root || file.startsWith(root + path.sep)) && isFile(file),
    );
}

/**
 * How a package declares one subpath. A package with no `exports` keeps its
 * legacy deep paths: a subpath that names a file on disk (with or without a
 * module extension, or a folder index) counts as declared.
 * @param {unknown} exportsField
 * @param {string} packageDir
 * @param {string} subpath
 * @returns {SubpathDeclaration}
 */
function declarationIn(exportsField, packageDir, subpath) {
  const declaration = subpathDeclaration(exportsField, subpath);
  if (declaration.state !== 'no_exports') return declaration;
  if (subpath === '.') return {state: 'declared', value: null, wildcard: ''};
  const root = path.resolve(packageDir);
  const base = path.resolve(root, subpath.slice(2));
  if (!base.startsWith(root + path.sep)) return declaration;
  const file = [
    base,
    ...MODULE_EXTENSIONS.map(ext => `${base}${ext}`),
    ...MODULE_EXTENSIONS.map(ext => path.join(base, `index${ext}`)),
  ].find(isFile);
  return file
    ? {state: 'declared', value: `./${rel(root, file)}`, wildcard: ''}
    : declaration;
}

/**
 * A declared subpath of the package whose target is `file`, if any: an exact
 * key, or a wildcard key whose target pattern matches the file.
 * @param {unknown} exportsField
 * @param {string} packageDir
 * @param {string} file
 * @returns {string | null}
 */
function subpathFor(exportsField, packageDir, file) {
  if (!isRecord(exportsField)) return null;
  const wanted = `./${rel(packageDir, file)}`;
  for (const [key, value] of Object.entries(exportsField)) {
    if (!key.startsWith('.') || !importable(value)) continue;
    for (const target of allTargets(value)) {
      if (!key.includes('*')) {
        if (target === wanted) return key;
        continue;
      }
      const star = target.indexOf('*');
      if (star === -1) continue;
      const prefix = target.slice(0, star);
      const suffix = target.slice(star + 1);
      if (
        wanted.startsWith(prefix) &&
        wanted.endsWith(suffix) &&
        wanted.length >= prefix.length + suffix.length
      ) {
        return key.replace(
          '*',
          wanted.slice(prefix.length, wanted.length - suffix.length),
        );
      }
    }
  }
  return null;
}

/**
 * The condition names an export value uses, at any depth, in order.
 * @param {unknown} value
 * @param {string[]} [out]
 * @returns {string[]}
 */
function conditionNames(value, out = []) {
  if (Array.isArray(value)) for (const v of value) conditionNames(v, out);
  else if (isRecord(value)) {
    for (const [key, v] of Object.entries(value)) {
      if (!out.includes(key)) out.push(key);
      conditionNames(v, out);
    }
  }
  return out;
}

/**
 * Why a declared state is not importable, in words.
 * @param {SubpathDeclaration} declaration
 * @param {string} subpath
 */
function whyUndeclared(declaration, subpath) {
  const {state} = declaration;
  switch (state) {
    case 'no_exports':
      return `package.json has no "exports" and no file exists at "${subpath}"`;
    case 'root_only':
      return `package.json "exports" names only the package root, which blocks every subpath`;
    case 'blocked':
      return `package.json "exports" maps "${subpath}" to null`;
    case 'not_importable': {
      const names = conditionNames(declaration.value);
      const listed = names.map(name => `"${name}"`).join(', ');
      return names.length === 0
        ? `package.json "exports" gives "${subpath}" no target an ES module import can load`
        : `package.json "exports" gives "${subpath}" only the ${listed} condition${names.length === 1 ? '' : 's'}, none of which an ES module import loads`;
    }
    default:
      return `package.json "exports" does not declare "${subpath}"`;
  }
}

/**
 * The paste-ready package.json change that declares `subpath` → `target`.
 * @param {unknown} exportsField
 * @param {SubpathDeclaration['state']} state
 * @param {string} subpath
 * @param {string} target `./`-prefixed package-relative file
 */
function exportsFix(exportsField, state, subpath, target) {
  const entry = `${JSON.stringify(subpath)}: ${JSON.stringify(target)}`;
  if (state === 'no_exports') {
    return `point it at a file the package ships, or add "exports": {${entry}} to package.json (an "exports" map makes every path it does not list private, so list "." and the package's other public paths too).`;
  }
  if (state === 'root_only') {
    return `make "exports" a subpath map: {".": ${JSON.stringify(exportsField)}, ${entry}}.`;
  }
  if (state === 'not_importable') {
    return `add an ES module condition to "${subpath}" in package.json "exports", e.g. "default": ${JSON.stringify(target)} (or the built file).`;
  }
  if (state === 'blocked') {
    return `replace the null for "${subpath}" in package.json "exports" with ${JSON.stringify(target)}, or stop advertising it.`;
  }
  return `add ${entry} to package.json "exports" (or the built file it compiles to).`;
}

// ── Module export names ─────────────────────────────────────────────

/** @type {Map<string, {stamp: string, value: {names: Set<string>, complete: boolean}}>} */
const exportNameCache = new Map();

/** @param {string} file */
function stampOf(file) {
  const s = fs.statSync(file);
  return `${s.size}:${s.mtimeMs}:${s.ino}`;
}

/** @param {string} specifier @param {string} fromFile */
function resolveRelative(specifier, fromFile) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const stripped = base.replace(/\.(?:m?js|jsx|cjs)$/u, '');
  const candidates = [
    base,
    ...MODULE_EXTENSIONS.map(ext => `${base}${ext}`),
    ...MODULE_EXTENSIONS.map(ext => `${stripped}${ext}`),
    ...MODULE_EXTENSIONS.map(ext => path.join(base, `index${ext}`)),
  ];
  return candidates.find(isFile) ?? null;
}

/**
 * Every name (runtime or type) a module exports, and whether the list is
 * complete: an `export *` from another package, `export =`, or a module that
 * does not parse leaves it incomplete, and then no name is judged missing.
 * @param {string} file
 * @param {Set<string>} [seen]
 * @returns {{names: Set<string>, complete: boolean}}
 */
export function moduleExportNames(file, seen = new Set()) {
  /** @type {Set<string>} */
  const names = new Set();
  if (seen.has(file)) return {names, complete: true};
  seen.add(file);
  let stamp;
  try {
    stamp = stampOf(file);
  } catch {
    return {names, complete: false};
  }
  const cached = exportNameCache.get(file);
  if (cached?.stamp === stamp) return cached.value;
  // A CommonJS module's exports cannot be read from declarations: leave it
  // unjudged rather than read it as exporting nothing. That is any .cjs/.cts
  // file, any file (built `dist/*.js` included) with no ES module import or
  // export, and any file that also assigns `module.exports` or `exports.*`.
  if (/\.c[jt]s$/u.test(file)) return {names, complete: false};
  let complete = true;
  let ast;
  let text;
  try {
    text = fs.readFileSync(file, 'utf-8');
    ast = parseModuleText(text);
    if (ast.errors?.length) complete = false;
  } catch {
    return {names, complete: false};
  }
  const esm = ast.program.body.some(
    (/** @type {any} */ node) =>
      node.type === 'ImportDeclaration' ||
      node.type === 'ExportNamedDeclaration' ||
      node.type === 'ExportDefaultDeclaration' ||
      node.type === 'ExportAllDeclaration' ||
      node.type === 'TSExportAssignment',
  );
  if (!esm) return {names, complete: false};
  if (/\b(?:module\.exports|exports\.[\w$]+)\s*=/u.test(text)) {
    return {names, complete: false};
  }
  for (const node of ast.program.body) {
    if (node.type === 'ExportDefaultDeclaration') names.add('default');
    else if (node.type === 'TSExportAssignment') complete = false;
    else if (node.type === 'ExportNamedDeclaration') {
      const d = /** @type {any} */ (node.declaration);
      if (d) {
        if (d.id?.name) names.add(d.id.name);
        for (const v of d.declarations ?? []) {
          if (v.id?.type === 'Identifier') names.add(v.id.name);
          else complete = false;
        }
      }
      for (const s of /** @type {any[]} */ (node.specifiers ?? [])) {
        const exported = s.exported?.name ?? s.exported?.value;
        if (exported) names.add(exported);
      }
    } else if (node.type === 'ExportAllDeclaration') {
      const n = /** @type {any} */ (node);
      if (n.exported) {
        names.add(n.exported.name ?? n.exported.value);
        continue;
      }
      const source = String(n.source.value);
      const target = source.startsWith('.')
        ? resolveRelative(source, file)
        : null;
      if (!target) {
        complete = false;
        continue;
      }
      const inner = moduleExportNames(target, seen);
      for (const name of inner.names) if (name !== 'default') names.add(name);
      if (!inner.complete) complete = false;
    }
  }
  const value = {names, complete};
  exportNameCache.set(file, {stamp, value});
  return value;
}

/**
 * The names an import statement asks for that the module provably lacks.
 * @param {ImportStatement} statement
 * @param {string[]} files candidate targets on disk
 * @returns {string[] | null} null when it cannot be judged
 */
function missingNames(statement, files) {
  if (files.length === 0 || statement.names.length === 0) return null;
  for (const file of files) {
    const {names, complete} = moduleExportNames(file);
    if (!complete) return null;
    const missing = statement.names
      .map(binding => binding.imported)
      .filter(name => !names.has(name));
    if (missing.length === 0) return [];
    // Another condition's file may be the one that has it (source vs built).
    if (file === files[files.length - 1]) return missing;
  }
  return null;
}

// ── Checks ──────────────────────────────────────────────────────────

/**
 * @typedef {object} Context
 * @property {string} packageDir
 * @property {string} name
 * @property {unknown} exportsField
 * @property {string | null} coreDir
 * @property {any} corePkg
 */

/**
 * Judge an import of the package's own name.
 * @param {Context} ctx
 * @param {ImportStatement} statement
 * @param {string} subpath
 * @returns {{undeclared: SubpathDeclaration | null, missing: string[] | null}}
 */
function judgeOwnImport(ctx, statement, subpath) {
  const declaration = declarationIn(ctx.exportsField, ctx.packageDir, subpath);
  if (declaration.state !== 'declared')
    return {undeclared: declaration, missing: null};
  return {
    undeclared: null,
    missing: missingNames(
      statement,
      existingTargets(ctx.packageDir, declaration),
    ),
  };
}

/**
 * A component doc's import specifier, and every example's imports.
 * @param {Context} ctx
 * @param {any} integration
 * @returns {Promise<Issue[]>}
 */
async function componentIssues(ctx, integration) {
  /** @type {Issue[]} */
  const issues = [];
  let records;
  try {
    records = discoverIntegrationComponents(integration);
  } catch {
    return issues; // an unreadable root is reported by the root validators
  }
  /** @type {Map<string, typeof records>} */
  const byDoc = new Map();
  for (const record of records) {
    const list = byDoc.get(record.docPath) ?? [];
    list.push(record);
    byDoc.set(record.docPath, list);
  }
  for (const [docPath, list] of byDoc) {
    let doc;
    try {
      doc = await loadComponentDoc(docPath);
    } catch {
      continue; // reported by the doc validators
    }
    if (!isRecord(doc)) continue;
    const shownDoc = rel(ctx.packageDir, docPath);
    const record = list[0];
    const source = record.sourcePath;
    const sourceTarget = source ? `./${rel(ctx.packageDir, source)}` : null;
    // Only an import the doc writes is judged; one the CLI derives is left to
    // `integration verify`, which resolves it from the packed package.
    const authored = typeof doc.import === 'string' ? doc.import : null;
    const specifier = authored ?? '';
    const split = authored ? splitSpecifier(specifier) : null;
    const declared = source
      ? subpathFor(ctx.exportsField, ctx.packageDir, source)
      : null;
    const suggested =
      declared ??
      (sourceTarget ? sourceTarget.replace(/\.[cm]?[jt]sx?$/u, '') : null);
    if (split && split.pkg !== ctx.name) {
      issues.push(
        issueWarning(
          'component_import_other_package',
          `Component doc "${shownDoc}" gives import "${specifier}", which names package "${split.pkg}", not this package "${ctx.name}", so apps are told to import the component from somewhere it is not. Fix: set import: '${ctx.name}${suggested ? suggested.slice(1) : ''}' in the doc.`,
        ),
      );
    } else if (split) {
      const declaration = declarationIn(
        ctx.exportsField,
        ctx.packageDir,
        split.subpath,
      );
      if (declaration.state !== 'declared') {
        const already =
          declared && declared !== split.subpath
            ? `set import: '${ctx.name}${declared.slice(1)}' (already exported), or `
            : '';
        issues.push(
          issueWarning(
            'component_import_not_exported',
            `Component doc "${shownDoc}" gives import "${specifier}", but ${whyUndeclared(declaration, split.subpath)}, so apps cannot import the component from it. Fix: ${already}${exportsFix(ctx.exportsField, declaration.state, split.subpath, sourceTarget ?? `./${split.subpath.slice(2)}.tsx`)}`,
          ),
        );
      }
    }

    /**
     * Where an example with an undeclared import should import from: the
     * doc's own import, when it differs from the example's and is declared;
     * else the subpath the component's source is already exported under;
     * else the exact `exports` entry to add for the example's subpath.
     * @param {string} specifier
     * @param {string} subpath
     * @param {SubpathDeclaration} undeclared
     */
    const exampleFix = (specifier, subpath, undeclared) => {
      const own = authored ? splitSpecifier(authored) : null;
      if (
        authored &&
        authored !== specifier &&
        own?.pkg === ctx.name &&
        declarationIn(ctx.exportsField, ctx.packageDir, own.subpath).state ===
          'declared'
      ) {
        return `import from '${authored}' in the example, as the doc's import does.`;
      }
      if (declared && declared !== subpath) {
        return `import from '${ctx.name}${declared.slice(1)}' in the example (already exported).`;
      }
      return exportsFix(
        ctx.exportsField,
        undeclared.state,
        subpath,
        sourceTarget ?? `./${subpath.slice(2)}.tsx`,
      );
    };

    const examples = Array.isArray(doc.examples) ? doc.examples : [];
    for (const [index, example] of examples.entries()) {
      if (!isRecord(example) || typeof example.code !== 'string') continue;
      const label =
        typeof example.label === 'string'
          ? `"${example.label}"`
          : `#${index + 1}`;
      for (const statement of readImports(example.code)) {
        const parts = splitSpecifier(statement.source);
        if (!parts || parts.pkg !== ctx.name) continue;
        const {undeclared, missing} = judgeOwnImport(
          ctx,
          statement,
          parts.subpath,
        );
        if (undeclared) {
          issues.push(
            issueWarning(
              'example_import_not_exported',
              `Component doc "${shownDoc}" example ${label} imports "${statement.source}", but ${whyUndeclared(undeclared, parts.subpath)}, so the example fails when an app copies it. Fix: ${exampleFix(statement.source, parts.subpath, undeclared)}`,
            ),
          );
        } else if (missing && missing.length > 0) {
          issues.push(
            issueWarning(
              'example_import_missing_name',
              `Component doc "${shownDoc}" example ${label} imports ${missing.map(n => `"${n}"`).join(', ')} from "${statement.source}", which does not export ${missing.length === 1 ? 'it' : 'them'}, so the example fails when an app copies it. Fix: import a name that module exports (${[...list.map(r => r.name)].map(n => `"${n}"`).join(', ')} for this doc), or export the name from it.`,
            ),
          );
        }
      }
    }
  }
  return issues;
}

/**
 * Template public imports and what each template source imports, plus the
 * components a block names.
 * @param {Context} ctx
 * @param {any} integration
 * @returns {Promise<Issue[]>}
 */
async function templateIssues(ctx, integration) {
  /** @type {Issue[]} */
  const issues = [];
  const root = integration.templates;
  if (!root) return issues;
  let templates;
  try {
    ({templates} = await discoverIntegrationTemplatesForOne(integration));
  } catch {
    return issues;
  }
  /** @type {Set<string> | null} */
  let knownComponents = null;
  const known = () => {
    if (knownComponents) return knownComponents;
    try {
      knownComponents = new Set(
        discoverIntegrationComponents(integration).map(r => r.name),
      );
    } catch {
      return null;
    }
    // Without Core installed its names cannot be judged, so nothing is (as
    // the components check reports core_not_found rather than guess).
    if (!ctx.coreDir) {
      knownComponents = null;
      return null;
    }
    try {
      for (const r of discoverOwnedComponents(ctx.coreDir, []))
        knownComponents.add(r.name);
    } catch {
      knownComponents = null;
    }
    return knownComponents;
  };

  for (const template of templates) {
    const id = template.dirName;
    const file = template.filePath;
    const shown = rel(ctx.packageDir, file);
    const sourceTarget = `./${shown}`;
    const subpath = `./${shown.replace(/\.tsx?$/u, '')}`;
    const declaration = declarationIn(
      ctx.exportsField,
      ctx.packageDir,
      subpath,
    );
    if (declaration.state !== 'declared') {
      issues.push(
        issueWarning(
          'template_import_not_exported',
          `Template "${id}" has public import "${ctx.name}${subpath.slice(1)}", but ${whyUndeclared(declaration, subpath)}, so it cannot be imported once published. Fix: ${exportsFix(ctx.exportsField, declaration.state, subpath, sourceTarget)}`,
        ),
      );
    }

    let text;
    try {
      text = fs.readFileSync(file, 'utf-8');
    } catch {
      text = '';
    }
    // `astryx template` copies the source as written, but the package's
    // public import, the gallery preview and a page that renders the
    // template import its default export.
    const exported = text ? moduleExportNames(file) : null;
    if (exported?.complete && !exported.names.has('default')) {
      const named = [...exported.names].find(name => /^[A-Z]/.test(name));
      const fix = named
        ? `add \`export default ${named};\` to ${shown}, or make ${named} the default export`
        : `export the template's component as the default export of ${shown} (\`export default function …\`)`;
      issues.push(
        issueWarning(
          'template_no_default_export',
          `Template "${id}" (${shown}) has no default export, so its public import "${ctx.name}${subpath.slice(1)}" and anything that renders the template get nothing. Fix: ${fix}.`,
        ),
      );
    }
    const statements = readImports(text);
    for (const statement of statements) {
      const spec = statement.source;
      if (spec.startsWith('.')) {
        const target = path.resolve(path.dirname(file), spec);
        if (target !== root && !target.startsWith(root + path.sep)) {
          issues.push(
            issueWarning(
              'template_import_outside_root',
              `Template "${id}" (${shown}) imports "${spec}", a path outside the templates root; \`astryx template\` copies only the template into an app, where that path does not exist. Fix: import it through the package's public name (e.g. '${ctx.name}/…' declared in package.json "exports"), or move the code into the template.`,
            ),
          );
        }
        continue;
      }
      const parts = splitSpecifier(spec);
      if (!parts) continue;
      if (parts.pkg === ctx.name) {
        const {undeclared, missing} = judgeOwnImport(
          ctx,
          statement,
          parts.subpath,
        );
        if (undeclared) {
          issues.push(
            issueWarning(
              'template_private_import',
              `Template "${id}" (${shown}) imports "${spec}", but ${whyUndeclared(undeclared, parts.subpath)}, so the template breaks in an app. Fix: import from a subpath package.json "exports" declares, or add one for it.`,
            ),
          );
        } else if (missing && missing.length > 0) {
          issues.push(
            issueWarning(
              'template_import_missing_name',
              `Template "${id}" (${shown}) imports ${missing.map(n => `"${n}"`).join(', ')} from "${spec}", which does not export ${missing.length === 1 ? 'it' : 'them'}, so the template breaks in an app. Fix: import a name that module exports, or export the name from it.`,
            ),
          );
        }
      } else if (parts.pkg === CORE && ctx.corePkg && parts.subpath !== '.') {
        const core = declarationIn(
          ctx.corePkg.exports,
          /** @type {string} */ (ctx.coreDir),
          parts.subpath,
        );
        if (core.state !== 'declared') {
          const top = parts.subpath
            .split('/')
            .filter(s => s && s !== '.' && s !== 'src')[0];
          const hint =
            top &&
            subpathDeclaration(ctx.corePkg.exports, `./${top}`).state ===
              'declared'
              ? `'${CORE}/${top}'`
              : `a subpath Core's package.json "exports" declares`;
          issues.push(
            issueWarning(
              'template_private_import',
              `Template "${id}" (${shown}) imports "${spec}", a path Core's package.json "exports" does not declare, so the template breaks in an app. Fix: import from ${hint}.`,
            ),
          );
        }
      }
    }

    if (
      template.type === 'block' ||
      template.exampleFor ||
      template.componentsUsed?.length
    ) {
      const names = known();
      if (!names) continue;
      const fields = [
        ...(typeof template.exampleFor === 'string'
          ? [{field: 'exampleFor', name: template.exampleFor}]
          : []),
        ...(template.componentsUsed ?? [])
          .filter(name => typeof name === 'string')
          .map(name => ({field: 'componentsUsed', name})),
      ];
      // A block may name a component it imports that has no doc of its own.
      const imported = new Set(
        statements.flatMap(statement => statement.names.map(n => n.imported)),
      );
      for (const {field, name} of fields) {
        if (names.has(name) || imported.has(name)) continue;
        issues.push(
          issueWarning(
            'unknown_block_component',
            `Template "${id}" names "${name}" in ${field}, but neither this package nor Core has a component by that name and the template does not import it, so no component lists the block under that name. Fix: use the component's exact name, or remove "${name}" from ${field}.`,
          ),
        );
      }
    }
  }
  return issues;
}

/**
 * Every public-import and peer issue for one package.
 * @param {string} packageDir
 * @param {any} integration the loaded integration record
 * @returns {Promise<Issue[]>}
 */
export async function publicImportIssues(packageDir, integration) {
  const pkg = readJson(path.join(packageDir, 'package.json'));
  if (!isRecord(pkg) || typeof pkg.name !== 'string') return [];
  const coreDir = pkg.name === CORE ? packageDir : findCoreDir(packageDir);
  /** @type {Context} */
  const ctx = {
    packageDir,
    name: pkg.name,
    exportsField: pkg.exports,
    coreDir,
    corePkg: coreDir ? readJson(path.join(coreDir, 'package.json')) : null,
  };
  return [
    ...(await componentIssues(ctx, integration)),
    ...(await templateIssues(ctx, integration)),
  ];
}
