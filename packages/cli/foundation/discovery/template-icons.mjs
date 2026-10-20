// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Template icon mapping (AST-084 FR11, FR12): rewrite a template's icon
 * imports to the project's icon set, by meaning.
 *
 * Pure: source text and icon-set data in, source text and a report out. Every
 * icon import whose module and export belong to a known set's data file, or to
 * one of the libraries the CLI's own templates import, maps to the project
 * set's icon that:
 *   1. names it in a reviewed `matches` entry with `exact` or `strong`
 *      confidence;
 *   2. otherwise fills the same shared icon name (`IconName`);
 *   3. otherwise has the same id;
 *   4. otherwise shares the most words with it, when the overlap meets
 *      {@link wordsMatch}, ties broken by id.
 * A `likely` reviewed match is never applied: a kept icon names it as a
 * suggestion.
 * The import and every reference to the imported name use the mapped export;
 * a name that would collide with another binding in the file is imported
 * under an alias. An icon that names a variant (a solid appearance) maps to
 * the target's variant with that appearance, else its default. An icon with
 * no match keeps its original import and is reported as kept. Without a
 * project icon set the source is unchanged and the report says why.
 *
 * The libraries the CLI's templates import ship no data file, so their
 * records are derived from export names: `XMarkIcon` from
 * `@heroicons/react/24/outline` is id `x-mark`, words `x` and `mark`,
 * appearance `outline`; the shared names each one draws come from
 * {@link TEMPLATE_LIBRARY_FILLS}.
 *
 * @input Template source, the installed sets, and the project's choice
 * @output The rewritten source and the `icons` report
 * @position packages/cli/foundation/discovery — read by template show/copy
 */

import {parse} from '@babel/parser';

/** @typedef {import('./icon-set-discovery.mjs').DiscoveredIconSet} DiscoveredIconSet */
/** @typedef {import('./icon-set-discovery.mjs').IconSetChoice} IconSetChoice */
/** @typedef {import('../../authoring/doctypes/icon-set/type').IconSetIcon} IconSetIcon */

/**
 * A source icon: what an imported icon means.
 * @typedef {object} SourceIcon
 * @property {string} setName the set or library it comes from, as a reviewed
 *   match names it: an installed set's name, `heroicons`, or `lucide`
 * @property {string} export the export the template imports
 * @property {string} [variant] which variant of its set, as a reviewed match
 *   names it: `24/outline` for heroicons, an installed set's appearance
 * @property {string} id
 * @property {string[]} words
 * @property {string[]} fills
 * @property {string} [appearance]
 * @property {DiscoveredIconSet} [set] the set it came from, when installed
 */

/**
 * One mapped icon.
 * @typedef {object} MappedIcon
 * @property {{module: string, export: string}} source
 * @property {{set: string, package: string, id: string, module: string, export: string}} target
 * @property {'match' | 'fills' | 'id' | 'words'} by `match`: a reviewed
 *   `exact` or `strong` match in the project set's data names the source icon
 */

/**
 * One icon kept as the template wrote it.
 * @typedef {object} KeptIcon
 * @property {string} module
 * @property {string} export
 * @property {string} reason
 * @property {{set: string, id: string, module: string, export: string, confidence: 'likely'}} [suggestion]
 *   a `likely` reviewed match, suggested and never applied
 */

/**
 * What template icon mapping did.
 * @typedef {object} TemplateIconsReport
 * @property {'selected' | 'none' | 'ambiguous' | 'missing'} status the
 *   project's icon-set state; only `selected` maps anything
 * @property {string | null} set the project set as `<package>/<set>`
 * @property {string} reason
 * @property {MappedIcon[]} mapped
 * @property {KeptIcon[]} kept
 */

/** The shared names each template-library icon draws, by library. */
export const TEMPLATE_LIBRARY_FILLS = Object.freeze({
  heroicons: Object.freeze({
    XMarkIcon: 'close',
    ChevronDownIcon: 'chevronDown',
    ChevronLeftIcon: 'chevronLeft',
    ChevronRightIcon: 'chevronRight',
    ChevronDoubleLeftIcon: 'chevronsLeft',
    ChevronDoubleRightIcon: 'chevronsRight',
    CheckIcon: 'check',
    CheckCircleIcon: 'success',
    XCircleIcon: 'error',
    ExclamationTriangleIcon: 'warning',
    InformationCircleIcon: 'info',
    CalendarIcon: 'calendar',
    ClockIcon: 'clock',
    ArrowTopRightOnSquareIcon: 'externalLink',
    Bars3Icon: 'menu',
    EllipsisHorizontalIcon: 'moreHorizontal',
    MagnifyingGlassIcon: 'search',
    ArrowUpTrayIcon: 'upload',
    ArrowUpIcon: 'arrowUp',
    ArrowDownIcon: 'arrowDown',
    ArrowsUpDownIcon: 'arrowsUpDown',
    FunnelIcon: 'funnel',
    EyeSlashIcon: 'eyeSlash',
    ViewColumnsIcon: 'viewColumns',
    DocumentDuplicateIcon: 'copy',
    WrenchIcon: 'wrench',
    StopIcon: 'stop',
    MicrophoneIcon: 'microphone',
  }),
  lucide: Object.freeze({
    X: 'close',
    ChevronDown: 'chevronDown',
    ChevronLeft: 'chevronLeft',
    ChevronRight: 'chevronRight',
    ChevronsLeft: 'chevronsLeft',
    ChevronsRight: 'chevronsRight',
    Check: 'check',
    CheckCircle: 'success',
    XCircle: 'error',
    AlertTriangle: 'warning',
    Info: 'info',
    Calendar: 'calendar',
    Clock: 'clock',
    ExternalLink: 'externalLink',
    Menu: 'menu',
    MoreHorizontal: 'moreHorizontal',
    Search: 'search',
    Upload: 'upload',
    ArrowUp: 'arrowUp',
    ArrowDown: 'arrowDown',
    ArrowUpDown: 'arrowsUpDown',
    Filter: 'funnel',
    EyeOff: 'eyeSlash',
    Columns: 'viewColumns',
    Copy: 'copy',
    CheckCheck: 'checkDouble',
    Wrench: 'wrench',
    Square: 'stop',
    Mic: 'microphone',
  }),
});

const HEROICONS_RE = /^@heroicons\/react\/(16|20|24)\/(outline|solid)$/u;

/**
 * `XMarkIcon` → `x-mark`; `ArrowUp` → `arrow-up`; `Bars3Icon` → `bars-3`.
 * @param {string} name
 */
function kebabOf(name) {
  return name
    .replace(/Icon$/u, '')
    .replace(/([a-z])([A-Z0-9])/gu, '$1-$2')
    .replace(/([0-9])([A-Z])/gu, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/gu, '$1-$2')
    .toLowerCase();
}

/**
 * The derived record of a template-library icon, or null when the module is
 * not one of those libraries.
 * @param {string} module
 * @param {string} exportName
 * @returns {SourceIcon | null}
 */
export function templateLibraryIcon(module, exportName) {
  const hero = HEROICONS_RE.exec(module);
  /** @type {Record<string, string>} */
  let fills;
  /** @type {string | undefined} */
  let appearance;
  /** @type {string} */
  let setName;
  /** @type {string | undefined} */
  let variant;
  if (hero) {
    fills = TEMPLATE_LIBRARY_FILLS.heroicons;
    appearance = hero[2];
    setName = 'heroicons';
    variant = `${hero[1]}/${hero[2]}`;
  } else if (module === 'lucide-react') {
    fills = TEMPLATE_LIBRARY_FILLS.lucide;
    setName = 'lucide';
  } else {
    return null;
  }
  if (!/^[A-Z][A-Za-z0-9]*$/u.test(exportName)) return null;
  const id = kebabOf(exportName);
  const fill = fills[exportName];
  return {
    setName,
    export: exportName,
    ...(variant ? {variant} : {}),
    id,
    words: id.split('-'),
    fills: fill ? [fill] : [],
    ...(appearance ? {appearance} : {}),
  };
}

/**
 * Index every installed set's exports: `<module>\0<export>` → the icon it
 * draws and the appearance of that export.
 * @param {DiscoveredIconSet[]} sets
 * @returns {Map<string, SourceIcon>}
 */
function indexSets(sets) {
  /** @type {Map<string, SourceIcon>} */
  const index = new Map();
  for (const set of sets) {
    for (const icon of set.data.icons) {
      const module = icon.module ?? set.data.module;
      const base = {
        setName: set.name,
        id: icon.id,
        words: icon.words,
        fills: icon.fills ?? [],
        set,
      };
      const key = `${module}\0${icon.export}`;
      if (!index.has(key)) {
        const appearance = set.data.default?.appearance;
        index.set(key, {
          ...base,
          export: icon.export,
          ...(appearance ? {appearance, variant: appearance} : {}),
        });
      }
      for (const variant of icon.variants ?? []) {
        const variantKey = `${variant.module ?? module}\0${variant.export}`;
        if (!index.has(variantKey)) {
          index.set(variantKey, {
            ...base,
            export: variant.export,
            ...(variant.appearance
              ? {appearance: variant.appearance, variant: variant.appearance}
              : {}),
          });
        }
      }
    }
  }
  return index;
}

/**
 * Whether two word lists overlap enough to call one icon the other: at least
 * half the shorter list, and at least one word.
 * @param {number} shared
 * @param {string[]} a
 * @param {string[]} b
 */
export function wordsMatch(shared, a, b) {
  return shared >= Math.max(1, Math.ceil(Math.min(a.length, b.length) / 2));
}

/**
 * The target-set icon whose reviewed `matches` name the source icon with one
 * of `confidences`, ties broken by the order the confidences are given and
 * then by id. A match with a `variant` names only that variant of its set; a
 * match without one names every variant.
 * @param {SourceIcon} source
 * @param {DiscoveredIconSet} target
 * @param {readonly string[]} confidences
 * @returns {IconSetIcon | null}
 */
export function reviewedMatch(source, target, confidences) {
  /** @type {{icon: IconSetIcon, rank: number} | null} */
  let best = null;
  for (const icon of target.data.icons) {
    for (const match of icon.matches ?? []) {
      const rank = confidences.indexOf(match.confidence);
      if (
        rank === -1 ||
        match.set !== source.setName ||
        match.export !== source.export ||
        (match.variant != null && match.variant !== source.variant)
      ) {
        continue;
      }
      if (
        !best ||
        rank < best.rank ||
        (rank === best.rank && icon.id < best.icon.id)
      ) {
        best = {icon, rank};
      }
    }
  }
  return best?.icon ?? null;
}

/**
 * The project-set icon a source icon maps to (FR11), or null: a reviewed
 * `exact` or `strong` match, then a shared name, then the id, then words.
 * @param {SourceIcon} source
 * @param {DiscoveredIconSet} target
 * @returns {{icon: IconSetIcon, by: 'match' | 'fills' | 'id' | 'words'} | null}
 */
export function matchIcon(source, target) {
  const reviewed = reviewedMatch(source, target, ['exact', 'strong']);
  if (reviewed) return {icon: reviewed, by: 'match'};
  const icons = target.data.icons;
  for (const name of source.fills) {
    const icon = icons.find(each => (each.fills ?? []).includes(name));
    if (icon) return {icon, by: 'fills'};
  }
  const sameId = icons.find(each => each.id === source.id);
  if (sameId) return {icon: sameId, by: 'id'};
  const words = new Set(source.words);
  /** @type {{icon: IconSetIcon, shared: number} | null} */
  let best = null;
  for (const icon of icons) {
    const shared = [
      ...new Set(icon.words.flatMap(word => word.split(/\s+/u))),
    ].filter(word => words.has(word)).length;
    if (!wordsMatch(shared, source.words, icon.words)) continue;
    if (
      !best ||
      shared > best.shared ||
      (shared === best.shared && icon.id < best.icon.id)
    ) {
      best = {icon, shared};
    }
  }
  return best ? {icon: best.icon, by: 'words'} : null;
}

/**
 * The export a mapped icon uses: the variant with the source's appearance
 * when the target has one, else the default.
 * @param {IconSetIcon} icon
 * @param {DiscoveredIconSet} set
 * @param {string | undefined} appearance
 */
function targetExport(icon, set, appearance) {
  const module = icon.module ?? set.data.module;
  const defaultAppearance = set.data.default?.appearance;
  if (appearance && appearance !== defaultAppearance) {
    const variant = (icon.variants ?? []).find(
      each => each.appearance === appearance,
    );
    if (variant) {
      return {module: variant.module ?? module, export: variant.export};
    }
  }
  return {module, export: icon.export};
}

/** @param {string} source */
function parseSource(source) {
  return parse(source, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
    errorRecovery: false,
  });
}

/**
 * Every node in the tree, with its parent and the key it sits under.
 * @param {any} node
 * @param {(node: any, parent: any, key: string) => void} visit
 * @param {any} [parent]
 * @param {string} [key]
 */
function walk(node, visit, parent = null, key = '') {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, parent, key);
    return;
  }
  if (
    node == null ||
    typeof node !== 'object' ||
    typeof node.type !== 'string'
  ) {
    return;
  }
  visit(node, parent, key);
  for (const childKey of Object.keys(node)) {
    if (
      childKey === 'loc' ||
      childKey === 'extra' ||
      childKey.endsWith('Comments') ||
      childKey === 'comments' ||
      childKey === 'tokens'
    ) {
      continue;
    }
    const child = node[childKey];
    if (child != null && typeof child === 'object') {
      walk(child, visit, node, childKey);
    }
  }
}

/**
 * Whether an identifier node is a reference to a binding, not a property
 * name or a JSX attribute name.
 * @param {any} node
 * @param {any} parent
 * @param {string} key
 */
function isReference(node, parent, key) {
  if (!parent) return true;
  switch (parent.type) {
    case 'ImportSpecifier':
    case 'ImportDefaultSpecifier':
    case 'ImportNamespaceSpecifier':
      return false;
    case 'MemberExpression':
    case 'OptionalMemberExpression':
      return key !== 'property' || parent.computed;
    case 'ObjectProperty':
      return key === 'value' || parent.computed;
    case 'ObjectMethod':
    case 'ClassMethod':
    case 'ClassProperty':
      return key !== 'key' || parent.computed;
    case 'JSXAttribute':
      return false;
    case 'JSXMemberExpression':
      return key === 'object';
    case 'TSPropertySignature':
      return key !== 'key';
    default:
      return true;
  }
}

/** What a template reads with no icon-set state given: nothing is mapped. */
export const NO_ICON_SETS = Object.freeze({
  sets: [],
  choice: /** @type {IconSetChoice} */ ({
    status: 'none',
    reason: 'No icon set is installed.',
  }),
});

/**
 * Rewrite a template's icon imports to the project's icon set (FR11, FR12).
 * @param {string} source
 * @param {{sets: DiscoveredIconSet[], choice: IconSetChoice}} iconSets
 * @returns {{source: string, icons: TemplateIconsReport}}
 */
export function mapTemplateIcons(source, {sets, choice}) {
  const target = choice.set ?? null;
  /** @type {TemplateIconsReport} */
  const icons = {
    status: choice.status,
    set: target ? `${target.package}/${target.name}` : null,
    reason: choice.reason,
    mapped: [],
    kept: [],
  };
  if (!target) return {source, icons};

  /** @type {any} */
  let ast;
  try {
    ast = parseSource(source);
  } catch {
    return {source, icons};
  }
  const index = indexSets(sets);
  const targetModules = new Set(
    target.data.icons.flatMap(icon => [
      icon.module ?? target.data.module,
      ...(icon.variants ?? []).map(
        variant => variant.module ?? icon.module ?? target.data.module,
      ),
    ]),
  );

  /** Every name the file writes, to keep aliases collision-free. */
  const written = new Set();
  walk(ast.program, (node, parent, key) => {
    // The name an import specifier reads from its module binds nothing here.
    if (parent?.type === 'ImportSpecifier' && key === 'imported') return;
    if (node.type === 'Identifier' || node.type === 'JSXIdentifier') {
      written.add(node.name);
    }
  });

  /** @type {Array<{start: number, end: number, text: string}>} */
  const edits = [];
  /** @type {Map<string, string>} old local name → new local name */
  const renames = new Map();
  /** @type {Map<string, {module: string, imported: string, local: string}>} */
  const added = new Map();
  /**
   * Every local name whose import maps away, found first, so a mapped name
   * may reuse a name another mapped import frees.
   * @type {Set<string>}
   */
  const freed = new Set();
  /**
   * The source record and the match of each mapped import specifier.
   * @type {Map<any, {record: SourceIcon, match: ReturnType<typeof matchIcon>}>}
   */
  const planned = new Map();
  for (const node of ast.program.body) {
    if (node.type !== 'ImportDeclaration' || node.importKind === 'type')
      continue;
    const module = node.source.value;
    if (targetModules.has(module)) continue;
    for (const specifier of node.specifiers) {
      if (
        specifier.type !== 'ImportSpecifier' ||
        specifier.importKind === 'type'
      ) {
        continue;
      }
      const imported = specifier.imported.name ?? specifier.imported.value;
      const record =
        index.get(`${module}\0${imported}`) ??
        templateLibraryIcon(module, imported);
      if (!record || record.set === target) continue;
      const match = matchIcon(record, target);
      planned.set(specifier, {record, match});
      if (match) freed.add(specifier.local.name);
    }
  }
  /** Where the mapped imports go: where the first rewritten import was. */
  let insertAt = -1;

  for (const node of ast.program.body) {
    if (node.type !== 'ImportDeclaration') continue;
    if (node.importKind === 'type') continue;
    const module = node.source.value;
    if (targetModules.has(module)) continue;
    if (!node.specifiers.some((/** @type {any} */ each) => planned.has(each))) {
      continue;
    }

    /** @type {any[]} */
    const keep = [];
    for (const specifier of node.specifiers) {
      const plan = planned.get(specifier);
      if (!plan) {
        keep.push(specifier);
        continue;
      }
      const imported = specifier.imported.name ?? specifier.imported.value;
      const local = specifier.local.name;
      const {record, match} = plan;
      if (!match) {
        keep.push(specifier);
        const likely = reviewedMatch(record, target, ['likely']);
        icons.kept.push({
          module,
          export: imported,
          reason: `no icon in ${icons.set} is a reviewed match for it, ${record.fills.length > 0 ? `fills "${record.fills.join('", "')}", ` : ''}or has id "${record.id}", and none shares enough words with it`,
          ...(likely
            ? {
                suggestion: {
                  set: target.name,
                  id: likely.id,
                  ...targetExport(likely, target, record.appearance),
                  confidence: /** @type {const} */ ('likely'),
                },
              }
            : {}),
        });
        continue;
      }
      const chosen = targetExport(match.icon, target, record.appearance);
      const key = `${chosen.module}\0${chosen.export}`;
      let entry = added.get(key);
      if (!entry) {
        let name = chosen.export;
        const taken = (/** @type {string} */ candidate) =>
          (written.has(candidate) && !freed.has(candidate)) ||
          [...added.values()].some(each => each.local === candidate);
        for (let n = 2; taken(name); n++) name = `${chosen.export}${n}`;
        entry = {module: chosen.module, imported: chosen.export, local: name};
        added.set(key, entry);
      }
      if (local !== entry.local) renames.set(local, entry.local);
      icons.mapped.push({
        source: {module, export: imported},
        target: {
          set: target.name,
          package: target.package,
          id: match.icon.id,
          module: chosen.module,
          export: chosen.export,
        },
        by: match.by,
      });
    }

    if (keep.length === node.specifiers.length) continue;
    if (insertAt === -1) insertAt = node.start;
    if (keep.length === 0) {
      let end = node.end;
      if (source[end] === '\n') end += 1;
      edits.push({start: node.start, end, text: ''});
    } else {
      const defaults = keep.filter(each => each.type !== 'ImportSpecifier');
      const named = keep.filter(each => each.type === 'ImportSpecifier');
      const parts = [
        ...defaults.map(each => source.slice(each.start, each.end)),
        ...(named.length > 0
          ? [
              `{${named.map(each => source.slice(each.start, each.end)).join(', ')}}`,
            ]
          : []),
      ];
      edits.push({
        start: node.start,
        end: node.end,
        text: `import ${parts.join(', ')} from ${source.slice(node.source.start, node.source.end)};`,
      });
    }
  }

  if (added.size === 0) return {source, icons};

  // Every reference to a renamed binding uses the mapped name.
  walk(ast.program, (node, parent, key) => {
    if (node.type === 'Identifier' || node.type === 'JSXIdentifier') {
      const next = renames.get(node.name);
      if (!next || !isReference(node, parent, key)) return;
      if (parent?.type === 'ObjectProperty' && parent.shorthand) {
        edits.push({
          start: node.start,
          end: node.end,
          text: `${node.name}: ${next}`,
        });
        return;
      }
      edits.push({start: node.start, end: node.end, text: next});
    }
  });
  // A shorthand property is visited as both key and value; keep one edit.
  const unique = new Map();
  for (const edit of edits) {
    const at = `${edit.start}:${edit.end}`;
    const prior = unique.get(at);
    if (!prior || edit.text.length > prior.text.length) unique.set(at, edit);
  }

  /** @type {Map<string, string[]>} */
  const byModule = new Map();
  for (const entry of added.values()) {
    const list = byModule.get(entry.module) ?? [];
    list.push(
      entry.local === entry.imported
        ? entry.imported
        : `${entry.imported} as ${entry.local}`,
    );
    byModule.set(entry.module, list);
  }
  const lines = [...byModule.entries()]
    .map(([module, names]) => `import {${names.join(', ')}} from '${module}';`)
    .join('\n');
  unique.set('insert', {start: insertAt, end: insertAt, text: `${lines}\n`});

  let out = source;
  for (const edit of [...unique.values()].sort(
    (a, b) => b.start - a.start || b.end - a.end,
  )) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return {source: out, icons};
}
