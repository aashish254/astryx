// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The search area's adapter: every read of the disk search does. It
 * gathers the candidates of each content domain (components, hooks, docs,
 * templates, themes) and loads the area's static weights and entry cards.
 */

import {readDocView} from '../../foundation/doc-compiler/read.mjs';
import {
  discoverExternalPackages,
  findCoreDir,
} from '../../foundation/fs/paths.mjs';
import {
  discoverComponents,
  discoverValidIntegrationComponents,
  docStem,
  familyMember,
  findComponentReadme,
  forEachIntegrationDoc,
  integrationMemberEntry,
  integrationRecordHold,
  isIntegrationMember,
  resolveImportPath,
  resolveIntegrationImportPath,
  CORE_PACKAGE,
} from '../../foundation/discovery/component-discovery.mjs';
import {
  discoverHooks,
  findHookDoc,
} from '../../foundation/discovery/hook-discovery.mjs';
import {
  loadComponentReplacements,
  loadIntegrationsSafely,
  resolveLegacyExternalDoc,
} from '../component/_adapter.mjs';
import {discoverTemplates, extractComponents} from '../template/template.mjs';
import {templateLookupIds} from '../../foundation/discovery/template-adapter.mjs';
import {listAvailableThemes} from '../theme/_adapter.mjs';
import {
  guideEntry,
  loadDocsCatalog,
  lowerTopic,
  projectTree,
  holdsOwnName,
} from '../docs/_adapter.mjs';
import {unlinkText} from '../../foundation/doc-compiler/links.mjs';
import {nodeView} from '../docs/node/node.mjs';
import {
  sectionKey,
  sectionSummary,
} from '../../foundation/discovery/docs-section-key.mjs';
import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {CORELESS_DOMAINS} from './_lexical.mjs';

/** @typedef {import('./_lexical.mjs').Candidate} Candidate */

/**
 * A component or hook doc, compiled, or null when it cannot be read.
 * @param {string} docPath
 * @param {string} [exportName]
 * @param {'components' | 'hooks'} [root]
 * @returns {Promise<any>}
 */
async function loadModuleDoc(
  docPath,
  exportName = 'docs',
  root = 'components',
) {
  try {
    // Support both the stamped default export and the legacy named export.
    return (
      (await readDocView(docPath, {
        root,
        loader: 'native',
        exports: ['default', exportName],
      })) ?? null
    );
  } catch {
    return null;
  }
}

/**
 * Build component candidates from core's own tree: name + keywords +
 * usage/description from the component's .doc.mjs.
 * @param {string} coreDir
 * @returns {Promise<Candidate[]>}
 */
/**
 * Usage guidance from a component doc: its feature list and its best-practice
 * advice, flattened to plain strings.
 *
 * This is where a reader's vocabulary usually lives. `Banner` calls itself "a
 * persistent message" and only its guidance names "form errors, system
 * updates, maintenance notices" — so a search for the words people actually
 * type finds nothing without it.
 *
 * @param {any} doc
 * @returns {string[]}
 */
function guidanceFrom(doc) {
  if (!doc) return [];
  const features = Array.isArray(doc.features) ? doc.features : [];
  const practices = Array.isArray(doc.usage?.bestPractices)
    ? doc.usage.bestPractices
    : [];
  return [...features, ...practices]
    .map(entry =>
      typeof entry === 'string'
        ? entry
        : [
            entry?.title,
            entry?.text,
            entry?.description,
            entry?.do,
            entry?.dont,
          ]
            .filter(Boolean)
            .join(' '),
    )
    .filter(Boolean);
}

/**
 * Build component candidates from core's own tree: name + keywords +
 * usage/description from the component's .doc.mjs.
 * @param {string} coreDir
 * @returns {Promise<Candidate[]>}
 */
async function gatherCoreComponents(coreDir) {
  const grouped = discoverComponents(coreDir);
  const names = Object.values(grouped).flat();
  /** @type {Candidate[]} */
  const candidates = [];
  for (const comp of names) {
    const readme = findComponentReadme(coreDir, comp);
    /** @type {string[]} */
    let keywords = [];
    let description = '';
    /** @type {string[]} */
    let guidance = [];
    if (readme && readme.endsWith('.doc.mjs')) {
      const loaded = await loadModuleDoc(readme);
      // A member documented in its family's doc (VStack in Stack's doc) is
      // indexed from its own entry: the family's keywords and guidance
      // describe the family, not the member.
      const doc = familyMember(loaded, comp) ?? loaded;
      if (doc) {
        keywords = Array.isArray(doc.keywords) ? doc.keywords : [];
        description = doc.usage?.description || doc.description || '';
        guidance = guidanceFrom(doc);
      }
    }
    candidates.push({
      domain: 'component',
      name: comp,
      keywords,
      description,
      guidance,
      _package: CORE_PACKAGE,
      _import: resolveImportPath(coreDir, comp),
    });
  }
  return candidates;
}

/**
 * Build component candidates contributed by the project's configured
 * integrations (astryx.config's `integrations`): name + keywords +
 * usage/description from each component's .doc.mjs, same as core. Without
 * this, an integration component is invisible to `search`/`build` even
 * though `component --list`/`component <Name>` already resolve it — the two
 * discovery paths silently disagreed. Also returns, per name, the docs that
 * hold it by their file name and the loadable docs that only record it.
 * @param {import('../../foundation/integrations/integrations.mjs').LoadedIntegration[]} loadedIntegrations
 * @returns {Promise<{candidates: Candidate[], fileNamed: Map<string, Set<string>>, documented: Map<string, Set<string>>}>}
 */
async function gatherIntegrationComponents(loadedIntegrations) {
  /** @type {Candidate[]} */
  const candidates = [];
  // What the owner rule reads: the docs that hold a name by their file name,
  // loadable or not and hidden ones too, and the loadable docs that only
  // record it.
  /** @type {Map<string, Set<string>>} */
  const fileNamed = new Map();
  /** @type {Map<string, Set<string>>} */
  const documented = new Map();
  /** @param {Map<string, Set<string>>} map @param {string} name @param {string} docPath */
  const hold = (map, name, docPath) =>
    map.set(name, (map.get(name) ?? new Set()).add(docPath));
  for (const integration of loadedIntegrations) {
    const {components, discovered} =
      await discoverValidIntegrationComponents(integration);
    const renamed = new Set(
      discovered
        .filter(rec => integrationRecordHold(rec) === 'doc')
        .filter(rec => !isIntegrationMember(rec))
        .map(rec => rec.docPath),
    );
    forEachIntegrationDoc(integration.components, (docPath, stem) => {
      if (!renamed.has(docPath)) hold(fileNamed, stem, docPath);
    });
    for (const rec of components) {
      const loaded = await loadModuleDoc(rec.docPath);
      // A family member is indexed from its own entry: the family's keywords
      // and guidance describe the family.
      const member = isIntegrationMember(rec);
      const doc = member ? integrationMemberEntry(loaded, rec) : loaded;
      // A doc that names another export of its file still answers to the
      // file's name, as `component <file name>` does.
      const fileName = docStem(rec.docPath);
      if (integrationRecordHold(rec) === 'doc') {
        hold(documented, rec.name, rec.docPath);
      }
      if (renamed.has(rec.docPath) && !member) {
        hold(documented, fileName, rec.docPath);
      }
      candidates.push({
        domain: 'component',
        name: rec.name,
        aliases: !member && fileName !== rec.name ? [fileName] : [],
        _hold: integrationRecordHold(rec),
        _docPath: rec.docPath,
        keywords: doc && Array.isArray(doc.keywords) ? doc.keywords : [],
        description: doc ? doc.usage?.description || doc.description || '' : '',
        guidance: guidanceFrom(doc),
        _package: rec.package ?? integration.name,
        // Exactly what `component` reports: a doc may state its own specifier
        // (one entry point exporting several components), and only when it
        // does not do we resolve the subpath against the owning package's
        // exports — read off the integration, which the loader already parsed.
        // Reporting the bare package name here handed out a path that does not
        // resolve, and disagreed with what `component <Name>` said about the
        // very same component.
        _import: resolveIntegrationImportPath(
          {
            exportsMap: integration.__packageExports,
            packageDir: integration.__packageDir,
            docPath: rec.docPath,
            packageName: rec.package,
          },
          rec.name,
          loaded?.import,
        ),
      });
    }
  }
  return {candidates, fileNamed, documented};
}

/**
 * Build component candidates: core's own tree plus every configured
 * integration's components.
 * @param {string} coreDir
 * @param {string} cwd
 * @returns {Promise<Candidate[]>}
 */
async function gatherComponents(coreDir, cwd) {
  const loadedIntegrations = await loadIntegrationsSafely(cwd);
  const [core, gathered, replacements] = await Promise.all([
    gatherCoreComponents(coreDir),
    gatherIntegrationComponents(loadedIntegrations),
    loadComponentReplacements(coreDir, loadedIntegrations),
  ]);
  const {candidates: integrations, fileNamed, documented} = gathered;
  // An active replacement answers to the Core name it replaces, so a search
  // for that name finds the replacement and not the Core original
  // (spec:AST-035 FR11).
  /** @type {Map<string, string>} */
  const targetOf = new Map(
    replacements.active.map(active => [
      `${active.package}\0${active.name}`,
      active.target,
    ]),
  );
  // The owner rule, as component detail applies it: a candidate `component
  // <name>` does not open names its package and follows the owner, and a
  // file-name alias that opens another owner is dropped.
  const coreNames = new Set(core.map(candidate => candidate.name));
  /** @param {string} name @param {Candidate} candidate */
  const opens = (name, candidate) =>
    !coreNames.has(name) &&
    findComponentReadme(coreDir, name) == null &&
    [...(fileNamed.get(name) ?? [])].every(doc => doc === candidate._docPath) &&
    [...(documented.get(name) ?? [])].every(doc => doc === candidate._docPath);
  // A legacy docs package keeps an exact name over an export name a doc records.
  /** @type {ReturnType<typeof discoverExternalPackages> | undefined} */
  let externals;
  /** @param {string} name */
  const legacyDocuments = name =>
    (externals ??= discoverExternalPackages(cwd)).some(
      ext => resolveLegacyExternalDoc(ext, name) != null,
    );
  const ruled = integrations.map(candidate => {
    const aliases = (candidate.aliases ?? []).filter(alias =>
      opens(alias, candidate),
    );
    return candidate._hold === 'doc' &&
      (!opens(candidate.name, candidate) || legacyDocuments(candidate.name))
      ? {
          ...candidate,
          aliases,
          _command: `astryx component ${candidate.name} --package ${candidate._package}`,
        }
      : {...candidate, aliases};
  });
  return [
    ...core.filter(candidate => !replacements.forTarget(candidate.name)),
    ...[
      ...ruled.filter(candidate => !candidate._command),
      ...ruled.filter(candidate => candidate._command),
    ].map(candidate => {
      const target = targetOf.get(`${candidate._package}\0${candidate.name}`);
      if (target != null) {
        return {...candidate, aliases: [...(candidate.aliases ?? []), target]};
      }
      // Another package's component named after a replaced Core component is
      // shadowed for the bare name (FR14): its command names its package.
      const shadowedBy = replacements.forTarget(candidate.name);
      return shadowedBy && shadowedBy.package !== candidate._package
        ? {
            ...candidate,
            _command: `astryx component ${candidate.name} --package ${candidate._package}`,
          }
        : candidate;
    }),
  ];
}

/**
 * Every component the project can use, Core's and its integrations', with the
 * keywords its own doc declares: the discovery and doc reads search's own
 * candidates use, without the import paths and prose a result carries. `build`
 * reads it to tell a part of a page from a page when its search was narrowed
 * away from components.
 * @param {string} coreDir
 * @param {string} cwd
 * @returns {Promise<{name: string, keywords: string[]}[]>}
 */
export async function componentKeywords(coreDir, cwd) {
  /** @param {any} doc */
  const keywordsOf = doc => (Array.isArray(doc?.keywords) ? doc.keywords : []);
  const core = Object.values(discoverComponents(coreDir))
    .flat()
    .map(async name => {
      const readme = findComponentReadme(coreDir, name);
      const loaded =
        readme && readme.endsWith('.doc.mjs')
          ? await loadModuleDoc(readme)
          : null;
      return {name, keywords: keywordsOf(familyMember(loaded, name) ?? loaded)};
    });
  const loadedIntegrations = await loadIntegrationsSafely(cwd);
  const replacements = await loadComponentReplacements(
    coreDir,
    loadedIntegrations,
  );
  const integrations = loadedIntegrations.map(async integration => {
    const {components} = await discoverValidIntegrationComponents(integration);
    return Promise.all(
      components.map(async rec => {
        const loaded = await loadModuleDoc(rec.docPath);
        return {
          name: rec.name,
          keywords: keywordsOf(integrationMemberEntry(loaded, rec) ?? loaded),
        };
      }),
    );
  });
  return [
    ...(await Promise.all(core)).filter(
      component => !replacements.forTarget(component.name),
    ),
    ...(await Promise.all(integrations)).flat(),
  ];
}

/**
 * Build hook candidates: name + keywords + usage/description from the hook's
 * .doc.mjs.
 * @param {string} coreDir
 * @returns {Promise<Candidate[]>}
 */
async function gatherHooks(coreDir) {
  const grouped = discoverHooks(coreDir);
  const names = Object.values(grouped).flat();
  /** @type {Candidate[]} */
  const candidates = [];
  for (const hookName of names) {
    const docPath = findHookDoc(coreDir, hookName);
    /** @type {string[]} */
    let keywords = [];
    let description = '';
    let importPath = '@astryxdesign/core/hooks';
    if (docPath) {
      const doc = await loadModuleDoc(docPath, 'docs', 'hooks');
      if (doc) {
        keywords = Array.isArray(doc.keywords) ? doc.keywords : [];
        description = doc.usage?.description || doc.description || '';
        importPath = doc.importPath || importPath;
      }
    }
    candidates.push({
      domain: 'hook',
      name: hookName,
      keywords,
      description,
      _package: CORE_PACKAGE,
      _import: importPath,
    });
  }
  return candidates;
}

/**
 * Build doc candidates at the grain a reader reads them: each section of a
 * topic, whose command reads just that section; each topic as a whole, whose
 * command lists its sections; and each docs-tree node by its route. The tree's
 * guides split into sections like topics, and its typed docs also match by
 * their own name, so `assertResponse` finds `cli/api/functions/assert-response`.
 *
 * Reads the project's catalog rather than the CLI's own docs directory, so a
 * topic an integration contributed (or replaced) is searchable exactly like a
 * built-in one — otherwise the replacement is served by `astryx docs` but
 * invisible to the command whose job is finding it.
 * @param {string} cwd
 * @returns {Promise<Candidate[]>}
 */
async function gatherDocs(cwd) {
  /** @type {Candidate[]} */
  const candidates = [];
  let catalog;
  try {
    catalog = await loadDocsCatalog(cwd);
  } catch {
    return candidates;
  }
  let tree = null;
  try {
    tree = await projectTree(catalog);
  } catch {
    // `astryx doctor` reports a tree that fails to build; search still
    // indexes the topics.
  }
  for (const entry of catalog.entries()) {
    // A topic whose name opens another doc (spec:AST-046 FR11) is not
    // offered: every hit's command must open the hit.
    if (tree && !holdsOwnName(tree, catalog, entry)) continue;
    let lowered = null;
    try {
      lowered = await lowerTopic(catalog, entry);
    } catch {
      // A topic that cannot be loaded is reported by the commands that own
      // integration issues; search just cannot index it.
    }
    const doc = lowered?.doc ?? null;
    // A flat topic lives in the Unorganized level; its hits say so, and name
    // the package each section came from.
    const home = tree?.get(entry.name);
    const placed = home?.ref?.flatTopic === entry.name ? home : null;
    /** @type {Map<string, string>} */
    const packages = new Map([
      [entry.providerId ?? entry.package, entry.package],
      ...entry.extensions.map(
        ext =>
          /** @type {[string, string]} */ ([
            ext.providerId ?? ext.package,
            ext.package,
          ]),
      ),
    ]);
    candidates.push(
      ...topicCandidates(
        entry.name,
        doc,
        entry.title,
        '',
        placed && tree
          ? [
              ...tree.ancestors(placed).map(a => a.title),
              doc?.title || entry.title || entry.name,
            ].join(' › ')
          : undefined,
        placed ? `astryx docs ${placed.parent}` : undefined,
        entry.package,
        key =>
          packages.get(lowered?.sectionProviders?.[key] ?? '') ?? entry.package,
      ),
    );
  }
  if (tree == null) return candidates;
  for (const node of tree.nodes.values()) {
    // A flat topic is indexed above, as a topic.
    if (node.ref?.flatTopic) continue;
    // A tree hit names where it lives: its ancestors' titles, then its own.
    const path = [...tree.ancestors(node).map(a => a.title), node.title];
    if (node.kind === 'generic') {
      let doc = null;
      try {
        doc = (await lowerTopic(catalog, guideEntry(node))).doc;
      } catch {
        // As above: the owning commands report it.
      }
      candidates.push(
        ...topicCandidates(
          node.route,
          doc,
          node.title,
          node.summary,
          path.join(' › '),
          node.parent == null ? undefined : `astryx docs ${node.parent}`,
          node.provider,
        ),
      );
      continue;
    }
    const selfDoc = /** @type {any} */ (node.ref)?.selfDoc;
    // A typed doc's content is what `astryx docs <route>` prints. The first
    // column of its tables names what the doc defines (an error code, an
    // option, a parameter), so each is a keyword the doc answers to.
    /** @type {any[]} */
    const content = (await nodeView(catalog, tree, node)).content ?? [];
    /** @type {string[]} */
    const defined = [];
    for (const block of content) {
      if (block.type !== 'table' || !Array.isArray(block.rows)) continue;
      for (const row of block.rows)
        if (row[0] != null) defined.push(plain(row[0]));
    }
    candidates.push({
      domain: 'doc',
      name: node.name,
      keywords: [
        node.route.slice(node.route.lastIndexOf('/') + 1),
        ...(Array.isArray(selfDoc?.keywords) ? selfDoc.keywords : []),
        // A namespace doc's own keywords, which it declares for search.
        ...(Array.isArray(node.keywords) ? node.keywords : []),
        ...defined,
        ...codeTerms({content}),
      ],
      _declared: [
        ...(Array.isArray(selfDoc?.keywords) ? selfDoc.keywords : []),
        ...(Array.isArray(node.keywords) ? node.keywords : []),
      ],
      description: node.summary || '',
      prose: sectionProse({title: node.title, content}),
      titles: [node.title],
      _topic: node.route,
      _title: path.join(' › '),
      _command: `astryx docs ${node.route}`,
      _parent:
        node.parent == null ? 'astryx docs' : `astryx docs ${node.parent}`,
      _package: node.provider,
    });
  }
  return candidates;
}

/**
 * The words one section says: its prose, headings, and list items.
 * @param {any} section
 * @returns {string[]}
 */
function sectionProse(section) {
  /** @type {string[]} */
  const prose = [];
  if (section?.title) prose.push(section.title);
  for (const block of section?.content || []) {
    if ((block.type === 'prose' || block.type === 'heading') && block.text) {
      prose.push(block.text);
    } else if (block.type === 'list' && Array.isArray(block.items)) {
      for (const item of block.items) {
        const text = typeof item === 'string' ? item : item?.text;
        if (typeof text === 'string') prose.push(text);
      }
    } else if (block.type === 'table' && Array.isArray(block.rows)) {
      for (const row of block.rows) prose.push(row.map(plain).join(' '));
    } else if (block.type === 'code' && typeof block.code === 'string') {
      prose.push([block.label, block.code].filter(Boolean).join(' '));
    }
  }
  return prose;
}

/**
 * The identifiers a doc part names in code ticks (`token-ref`,
 * `ERR_UNKNOWN_SECTION`). Each is a keyword: a reader who types one exactly
 * wants the part that defines or explains it.
 * @param {any} part - a section, or `{content}` of a typed doc
 * @returns {string[]}
 */
function codeTerms(part) {
  /** @type {Set<string>} */
  const terms = new Set();
  /** @param {unknown} text */
  const scan = text => {
    for (const m of String(text ?? '').matchAll(/`([^`\s]{2,40})`/g)) {
      terms.add(m[1]);
    }
  };
  for (const block of part?.content || []) {
    if (block.type === 'prose') scan(block.text);
    else if (block.type === 'list' && Array.isArray(block.items)) {
      for (const item of block.items) {
        scan(typeof item === 'string' ? item : item?.text);
      }
    } else if (block.type === 'table' && Array.isArray(block.rows)) {
      for (const row of block.rows) for (const cell of row) scan(cell);
    }
  }
  return [...terms];
}

/**
 * The headings inside a section. Each names a subsection, so a query that
 * names one should find the section as surely as one that names its title.
 * @param {any} section
 * @returns {string[]}
 */
function headings(section) {
  return (section?.content || [])
    .filter(
      (/** @type {any} */ block) => block.type === 'heading' && block.text,
    )
    .map((/** @type {any} */ block) => String(block.text));
}

/**
 * A table cell as plain words, without its code ticks.
 * @param {unknown} cell
 * @returns {string}
 */
function plain(cell) {
  return unlinkText(String(cell ?? '')).replaceAll('`', '');
}

/**
 * The candidates one topic yields: the topic itself, and one per section when
 * it has more than one. A topic's command lists its sections, and a section's
 * command reads only that section, so a hit never costs a whole-topic read.
 * @param {string} name - the topic name, or a placed guide's route
 * @param {any} doc - the lowered topic, or null when it did not load
 * @param {string} [title]
 * @param {string} [summary]
 * @param {string} [path] - where the topic lives in the docs tree, as titles
 *   joined by ` › `; a flat topic is its own title
 * @param {string} [parent] - the command that opens the level above the
 *   topic: its namespace, or the Unorganized level for a flat topic
 * @param {string} [pkg] - the npm package that authored the topic
 * @param {(key: string) => string} [sectionPackage] - the npm package a
 *   section came from: an extension's section names the extension's package
 * @returns {Candidate[]}
 */
function topicCandidates(
  name,
  doc,
  title,
  summary = '',
  path,
  parent,
  pkg,
  sectionPackage,
) {
  /** @type {any[]} */
  const sections = doc?.sections ?? [];
  const docTitle = path || doc?.title || title || name;
  const split = sections.length > 1;
  // A placed guide also answers to its last route segment's words:
  // `quick start` is cli/integrations/quick-start.
  const leaf = name.slice(name.lastIndexOf('/') + 1);
  /** @type {Candidate[]} */
  const out = [
    {
      domain: 'doc',
      name,
      keywords: [
        ...(leaf !== name ? [leaf.replaceAll('-', ' ')] : []),
        ...(doc?.title || title ? [doc?.title || title] : []),
        ...(Array.isArray(doc?.keywords) ? doc.keywords : []),
      ],
      _declared: Array.isArray(doc?.keywords) ? doc.keywords : [],
      description: doc?.description || summary,
      prose: split
        ? sections.map(section => section.title).filter(Boolean)
        : sections.flatMap(sectionProse),
      titles: [
        doc?.title || title || name,
        // A topic read whole answers for the headings inside it.
        ...(split ? [] : sections.flatMap(s => [s.title, ...headings(s)])),
      ].filter(Boolean),
      _topic: name,
      _title: docTitle,
      _command: split ? `astryx docs ${name} --index` : `astryx docs ${name}`,
      ...(parent ? {_parent: parent} : {}),
      ...(pkg ? {_package: pkg} : {}),
    },
  ];
  if (!split) return out;
  for (const section of sections) {
    const key = sectionKey(section);
    out.push({
      domain: 'doc',
      name: key,
      keywords: [
        ...(section.title ? [section.title] : []),
        ...headings(section),
        ...codeTerms(section),
      ],
      description: sectionSummary(section),
      prose: sectionProse(section),
      titles: [section.title, ...headings(section)].filter(Boolean),
      _topic: name,
      _section: key,
      _title: `${docTitle} › ${section.title}`,
      _command: `astryx docs ${name} ${key}`,
      _parent: `astryx docs ${name} --index`,
      ...((sectionPackage?.(key) ?? pkg)
        ? {_package: sectionPackage?.(key) ?? pkg}
        : {}),
    });
  }
  return out;
}

/**
 * Build template candidates (page + block) from the template discovery API.
 * @param {string} cwd
 * @returns {Promise<Candidate[]>}
 */
async function gatherTemplates(cwd) {
  let templates;
  try {
    templates = await discoverTemplates(cwd);
  } catch {
    return [];
  }
  return templates.map(t => {
    // A replacement's target is its canonical unqualified lookup id. Keep the
    // integration-owned id as a keyword and response label, but score and print
    // commands against the id that `template()` resolves back to this entry.
    // This matters for replacement chains: one replacement's own id can be the
    // target of another, so using that shadowed id as the command would select
    // the other template.
    const commandName = t.replaces ?? t.dirName;
    // Blocks ship an authored componentsUsed; page templates don't, so derive
    // them from the source. Category words (e.g. "Dashboard - Analytics") are
    // strong intent signal for pages, which otherwise only index on name +
    // description.
    //
    // Authored signal and derived signal are kept apart: componentsUsed and
    // category words are a deliberate statement of what the template is for,
    // while scraped JSX tags only say what it happens to render. See the
    // scoring table at the top of this file for why the derived set is capped.
    const keywords = Array.isArray(t.componentsUsed)
      ? [...t.componentsUsed]
      : [];
    keywords.push(...templateLookupIds(t).filter(id => id !== commandName));
    /** @type {string[]} */
    let weakKeywords = [];
    if (t.type === 'page') {
      if (t.filePath) {
        try {
          weakKeywords = extractComponents(t.filePath);
        } catch {
          // Best-effort: skip keyword enrichment if the source can't be read.
        }
      }
      if (t.category)
        keywords.push(...t.category.split(/[^A-Za-z0-9]+/).filter(Boolean));
    }
    return {
      domain: 'template',
      name: commandName,
      keywords,
      weakKeywords,
      description: t.description || '',
      // A template's own keywords name the many ideas it serves, so they score
      // as its prose does, not as a name: one of them matching one word of a
      // short idea is not a direct match.
      prose: t.keywords ?? [],
      _displayName: t.name,
      _package: t.package ?? CORE_PACKAGE,
      _kind: t.type, // 'page' | 'block'
      _resultName: t.dirName,
      _commandName: commandName,
    };
  });
}

/**
 * Build theme candidates from bundled and integration-provided themes. Without
 * this, an integration's themes are invisible to `search` even though
 * `theme list` and `discover` already resolve them.
 *
 * A theme's slug and display name are its names, and its description is prose
 * (`spec:AST-050/FR14`). A theme declares no keywords, so a word it shares with
 * the query only through its description is a description mention: read as a
 * keyword, every word of the description would outrank the components and docs
 * that declare that word.
 * @param {string} cwd
 * @returns {Promise<Candidate[]>}
 */
async function gatherThemes(cwd) {
  let themes;
  try {
    themes = await listAvailableThemes(cwd);
  } catch {
    return [];
  }
  return themes.map(t => ({
    domain: 'theme',
    name: t.slug,
    aliases: t.displayName ? [t.displayName] : [],
    description: t.description || '',
    _displayName: t.displayName,
    _package: t.package,
  }));
}

/**
 * Gathers every candidate the query's domains hold.
 *
 * @param {{cwd?: string, type?: string}} options
 * @returns {Promise<{all: Candidate[], components: Candidate[], searchedComponents: boolean}>}
 */
export async function gatherCandidates(options) {
  const {cwd = process.cwd(), type} = options;
  // `astryx docs` reads docs without @astryxdesign/core, and `astryx theme
  // list` reads themes without it (bundled themes need no project), so a
  // search of either must too. Every other domain reads core: asked for by
  // name, it is an error without core; an open search then covers the docs
  // and themes alone.
  const needsCore = !type || !CORELESS_DOMAINS.includes(type);
  const coreDir = needsCore ? findCoreDir(cwd) : null;
  if (type && needsCore && !coreDir) {
    throw new AstryxError(
      'Could not find @astryxdesign/core package',
      undefined,
      ERROR_CODES.ERR_CORE_NOT_FOUND,
    );
  }

  // Gather candidates from each requested domain in parallel.
  /** @param {string} d */
  const wants = d =>
    (!type && (coreDir != null || CORELESS_DOMAINS.includes(d))) || type === d;
  const [components, hooks, docTopics, templates, themes] = await Promise.all([
    wants('component')
      ? gatherComponents(/** @type {string} */ (coreDir), cwd)
      : [],
    wants('hook') ? gatherHooks(/** @type {string} */ (coreDir)) : [],
    wants('doc') ? gatherDocs(cwd) : [],
    wants('template') ? gatherTemplates(cwd) : [],
    wants('theme') ? gatherThemes(cwd) : [],
  ]);

  const all = [...components, ...hooks, ...docTopics, ...templates, ...themes];
  return {all, components, searchedComponents: wants('component')};
}
