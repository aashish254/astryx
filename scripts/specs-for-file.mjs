// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Resolve the knowledge records that govern a repository file.
 * @input Repository-relative file paths and the working tree's knowledge records.
 * @output Every record linked to each path, with the declared link that put it
 *   there, plus the trigger-routed global claims reviewers load today.
 * @position Read-only lookup over the links records already declare. It never
 *   infers coverage from names or extensions, and reports a path no record
 *   reaches instead of returning a partial answer silently.
 */

/* global console, process */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {
  GLOBAL_REVIEW_TRIGGERS,
  collectGlobalReviewMatches,
  discoverKnowledgeRecords,
  parseKnowledgeDocument,
} from './check-knowledge.mjs';

const require = createRequire(import.meta.url);
const {
  componentPackage,
  documentedComponentNames,
} = require('./component-packages.cjs');
const {
  classifyComponentKnowledgePath,
  isIgnoredComponentKnowledgeSegment,
} = require('../.github/scripts/knowledge-paths.cjs');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..');

/**
 * Reference fields that point from a record to the broader authority it
 * relies on. Following them never narrows scope: a record that governs a path
 * passes that path to the records it inherits from.
 */
const INHERITED_REFERENCE_FIELDS = [
  'architecture',
  'families',
  'design_specs',
  'system_specs',
  'references',
  'parent_component',
];

/**
 * Links from a governing record to the system specs that decided it. Those
 * specs are listed separately: they carry the decisions behind a governing
 * record, but nothing in them declares that the whole spec governs the path.
 */
const DECIDING_REFERENCE_FIELDS = ['deciding_specs'];
const DECIDED_REFERENCE_FIELDS = ['affects_architecture', 'affects_families'];

/** Fields naming the components a family or design record governs. */
const MEMBER_FIELDS = ['members', 'components'];

function toPosix(filePath) {
  return String(filePath).split(path.sep).join('/').replace(/^\.\//, '');
}

function asList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.length > 0) return [value];
  return [];
}

function referenceTarget(reference) {
  return reference.replace(/\/DEC-[0-9]+$/, '');
}

function looksLikePath(entry) {
  return (
    /^[A-Za-z0-9_.@-]+(?:\/[A-Za-z0-9_.@*-]*)*$/.test(entry) &&
    (entry.includes('/') || /\.[A-Za-z0-9]+$/.test(entry))
  );
}

/**
 * True when a declared path entry covers `filePath`. A trailing slash or a
 * directory entry covers its subtree; any other entry is exact.
 */
function pathEntryCovers(root, entry, filePath) {
  const normalized = toPosix(entry).replace(/\/+$/, '');
  if (normalized === '' || !looksLikePath(entry)) return false;
  if (filePath === normalized) return true;
  if (!filePath.startsWith(`${normalized}/`)) return false;
  if (entry.endsWith('/')) return true;
  const absolute = path.join(root, normalized);
  return fs.existsSync(absolute) && fs.statSync(absolute).isDirectory();
}

/** Load every knowledge record in the working tree once. */
export function loadKnowledgeIndex(root = DEFAULT_ROOT) {
  const records = [];
  for (const absolutePath of discoverKnowledgeRecords(root)) {
    const filePath = toPosix(path.relative(root, absolutePath));
    const content = fs.readFileSync(absolutePath, 'utf8');
    const {frontmatter} = parseKnowledgeDocument(content, filePath);
    const id = frontmatter.get('id');
    if (typeof id !== 'string') continue;
    records.push({
      id,
      path: filePath,
      content,
      kind: frontmatter.get('kind'),
      authority: frontmatter.get('authority'),
      frontmatter,
      classified: classifyComponentKnowledgePath(filePath),
    });
  }
  const byId = new Map(records.map(record => [record.id, record]));
  return {root, records, byId};
}

/**
 * The component a path belongs to under the shared component-package path
 * contract, with the names its consumer docs declare.
 */
function componentLocation(root, filePath) {
  const match = /^packages\/([^/]+)\/src\/(.+)$/.exec(filePath);
  if (!match) return null;
  const packageConfig = componentPackage(match[1]);
  if (!packageConfig) return null;
  const segments = match[2].split('/');
  if (segments.slice(0, -1).some(isIgnoredComponentKnowledgeSegment)) {
    return null;
  }
  let componentRoot;
  if (packageConfig.layout === 'flat') {
    componentRoot =
      segments.length > 1 ? segments[0] : segments[0].split('.')[0];
  } else {
    if (segments.length < 2) return null;
    componentRoot = segments[0];
  }
  const rootDirectory = path.join(root, packageConfig.src, componentRoot);
  const names = new Set([componentRoot]);
  if (
    fs.existsSync(rootDirectory) &&
    fs.statSync(rootDirectory).isDirectory()
  ) {
    for (const name of documentedComponentNames(rootDirectory)) names.add(name);
  }
  return {
    packageName: match[1],
    layout: packageConfig.layout,
    componentRoot,
    names,
  };
}

/** Records whose own canonical location places `filePath` inside their scope. */
function placementMatches(index, filePath, location) {
  const matches = [];
  for (const record of index.records) {
    if (record.path === filePath) {
      matches.push({record, via: 'self', detail: 'the file is this record'});
      continue;
    }
    const theme = /^packages\/themes\/([^/]+)\/\1\.spec\.md$/.exec(record.path);
    if (theme && filePath.startsWith(`packages/themes/${theme[1]}/`)) {
      matches.push({
        record,
        via: 'placement',
        detail: `theme record for packages/themes/${theme[1]}/`,
      });
      continue;
    }
    if (!location) continue;
    const {classified} = record;
    if (
      !classified ||
      classified.packageName !== location.packageName ||
      classified.componentRoot !== location.componentRoot
    ) {
      continue;
    }
    if (classified.kind === 'component') {
      matches.push({
        record,
        via: 'placement',
        detail: `component record for ${location.componentRoot}`,
      });
      continue;
    }
    const recordDirectory = path.posix.dirname(record.path);
    const stem = path.posix.basename(record.path, '.spec.md');
    const fileName = path.posix.basename(filePath);
    const fileDirectory = path.posix.dirname(filePath);
    const siblingsInDirectory = index.records.filter(
      other =>
        other !== record &&
        path.posix.dirname(other.path) === recordDirectory &&
        other.classified?.kind === 'module',
    );
    if (fileDirectory === recordDirectory && fileName.split('.')[0] === stem) {
      matches.push({
        record,
        via: 'placement',
        detail: `module record beside ${stem}`,
      });
    } else if (
      siblingsInDirectory.length === 0 &&
      (fileDirectory === recordDirectory ||
        fileDirectory.startsWith(`${recordDirectory}/`))
    ) {
      matches.push({
        record,
        via: 'placement',
        detail: `only module record in ${recordDirectory}/`,
      });
    }
  }
  return matches;
}

/** Records that declare a path entry covering `filePath`. */
function declaredPathMatches(index, filePath) {
  const matches = [];
  for (const record of index.records) {
    for (const field of ['applies_to', 'verified_by']) {
      for (const entry of asList(record.frontmatter.get(field))) {
        if (pathEntryCovers(index.root, entry, filePath)) {
          matches.push({record, via: field, detail: entry});
          break;
        }
      }
    }
  }
  return matches;
}

/** Consumer-doc topic files a system spec's `affects_consumer_docs` id names. */
function consumerDocTopicCovers(docId, filePath) {
  const topic = docId.split('/').at(-1);
  const match =
    /^packages\/cli\/assets\/docs\/(?:tree\/)?([^/]+?)\.doc(?:\.[a-z]+)*\.mjs$/.exec(
      filePath,
    );
  return match != null && match[1] === topic;
}

/** Records that name the file's component or consumer-doc topic. */
function namedMatches(index, filePath, location) {
  const matches = [];
  for (const record of index.records) {
    for (const field of MEMBER_FIELDS) {
      for (const member of asList(record.frontmatter.get(field))) {
        const name = member.replace(/^component:/, '');
        if (location?.names.has(name)) {
          matches.push({record, via: field, detail: member});
        }
      }
    }
    for (const docId of asList(
      record.frontmatter.get('affects_consumer_docs'),
    )) {
      if (location?.names.has(docId)) {
        matches.push({record, via: 'affects_consumer_docs', detail: docId});
      } else if (consumerDocTopicCovers(docId, filePath)) {
        matches.push({record, via: 'affects_consumer_docs', detail: docId});
      } else if (
        docId.includes('/') &&
        pathEntryCovers(index.root, docId, filePath)
      ) {
        matches.push({record, via: 'affects_consumer_docs', detail: docId});
      }
    }
  }
  return matches;
}

function addRoute(reached, record, route) {
  const existing = reached.get(record.id);
  if (existing) {
    if (
      !existing.routes.some(
        known => known.via === route.via && known.detail === route.detail,
      )
    ) {
      existing.routes.push(route);
    }
    return false;
  }
  reached.set(record.id, {record, routes: [route]});
  return true;
}

/**
 * Close the directly matched set over inherited references, then collect the
 * system specs that decided any governing record.
 */
function closeOverReferences(index, direct) {
  const governing = new Map();
  const queue = [];
  for (const match of direct) {
    if (
      addRoute(governing, match.record, {via: match.via, detail: match.detail})
    ) {
      queue.push(match.record);
    }
  }
  while (queue.length > 0) {
    const record = queue.shift();
    for (const field of INHERITED_REFERENCE_FIELDS) {
      for (const reference of asList(record.frontmatter.get(field))) {
        const target = index.byId.get(referenceTarget(reference));
        if (
          target &&
          addRoute(governing, target, {
            via: `inherited:${field}`,
            detail: record.id,
          })
        ) {
          queue.push(target);
        }
      }
    }
  }

  const deciding = new Map();
  for (const {record} of governing.values()) {
    for (const field of DECIDING_REFERENCE_FIELDS) {
      for (const reference of asList(record.frontmatter.get(field))) {
        const target = index.byId.get(referenceTarget(reference));
        if (target && !governing.has(target.id)) {
          addRoute(deciding, target, {via: field, detail: record.id});
        }
      }
    }
  }
  for (const decider of index.records) {
    if (governing.has(decider.id)) continue;
    for (const field of DECIDED_REFERENCE_FIELDS) {
      for (const reference of asList(decider.frontmatter.get(field))) {
        const target = referenceTarget(reference);
        if (governing.has(target)) {
          addRoute(deciding, decider, {via: field, detail: target});
        }
      }
    }
  }
  return {governing: [...governing.values()], deciding: [...deciding.values()]};
}

/**
 * Resolve the records governing one repository-relative path.
 *
 * `records` lists every record linked to the path, with each route that
 * reached it. `decidingSpecs` lists the system specs that decided one of those
 * records without being linked to the path themselves.
 * `globalClaims` lists the trigger-routed global baseline claims, exactly as
 * `scripts/review-global-baselines.mjs` selects them, for `triggers` (default:
 * the review triggers of the matched component and module records, or every
 * supported trigger when none matched).
 */
export function resolveSpecsForFile(index, file, options = {}) {
  const includeDraft = options.includeDraft ?? false;
  const filePath = toPosix(
    path.isAbsolute(file) ? path.relative(index.root, file) : file,
  );
  if (filePath.startsWith('../')) {
    throw new Error(`${file} is outside the repository.`);
  }
  const location = componentLocation(index.root, filePath);
  const direct = [
    ...placementMatches(index, filePath, location),
    ...declaredPathMatches(index, filePath),
    ...namedMatches(index, filePath, location),
  ];
  const visible = entry =>
    entry.record.authority === 'current' ||
    (includeDraft && entry.record.authority === 'draft');
  const project = entries =>
    entries
      .filter(visible)
      .map(({record, routes}) => ({
        id: record.id,
        path: record.path,
        kind: record.kind,
        authority: record.authority,
        routes,
      }))
      .sort((left, right) => left.path.localeCompare(right.path));
  const closed = closeOverReferences(index, direct);
  const records = project(closed.governing);
  const decidingSpecs = project(closed.deciding);

  let triggers = options.triggers;
  let triggerSource = 'requested';
  if (!triggers) {
    const local = new Set();
    for (const {record} of direct) {
      if (record.kind !== 'component' && record.kind !== 'module') continue;
      for (const trigger of asList(record.frontmatter.get('review_triggers'))) {
        if (GLOBAL_REVIEW_TRIGGERS.has(trigger)) local.add(trigger);
      }
    }
    if (local.size > 0) {
      triggers = [...local];
      triggerSource = 'component and module review_triggers';
    } else {
      triggers = [...GLOBAL_REVIEW_TRIGGERS];
      triggerSource = 'every supported trigger (no local record declares any)';
    }
  }
  const globalClaims =
    triggers.length === 0
      ? []
      : collectGlobalReviewMatches(
          index.records.map(record => ({
            path: record.path,
            content: record.content,
          })),
          triggers,
          null,
        ).map(({recordId, path: recordPath, trigger, claimId, claim}) => ({
          recordId,
          path: recordPath,
          trigger,
          claimId,
          claim,
        }));

  return {
    file: filePath,
    exists: fs.existsSync(path.join(index.root, filePath)),
    component: location
      ? {
          package: location.packageName,
          root: location.componentRoot,
          names: [...location.names].sort(),
        }
      : null,
    records,
    decidingSpecs,
    triggers: [...new Set(triggers)].sort(),
    triggerSource,
    globalClaims,
  };
}

/**
 * Current records that no tracked file other than the record itself reaches
 * through a placement, path, name, inherited, or deciding link. Every such
 * record is invisible to a path-first lookup.
 */
export function findUnreachedRecords(index, files) {
  const reached = new Set();
  for (const file of files) {
    const result = resolveSpecsForFile(index, file, {triggers: []});
    for (const record of [...result.records, ...result.decidingSpecs]) {
      if (record.routes.some(route => route.via !== 'self')) {
        reached.add(record.id);
      }
    }
  }
  return index.records
    .filter(record => record.authority === 'current' && !reached.has(record.id))
    .map(record => ({id: record.id, path: record.path, kind: record.kind}))
    .sort((left, right) => left.path.localeCompare(right.path));
}

/** Tracked files that no current record governs. */
export function findUnroutedFiles(index, files) {
  return files.filter(
    file =>
      resolveSpecsForFile(index, file, {triggers: []}).records.length === 0,
  );
}

function trackedFiles(root) {
  return execFileSync('git', ['-C', root, 'ls-files', '-z'], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
}

function formatResult(result) {
  const lines = [
    `${result.file}${result.exists ? '' : ' (not in the working tree)'}`,
  ];
  if (result.records.length === 0) {
    lines.push('  No record links to this path.');
  }
  for (const record of result.records) {
    const routes = record.routes
      .map(route => `${route.via} ${route.detail}`)
      .join('; ');
    const status =
      record.authority === 'current' ? '' : ` [${record.authority}]`;
    lines.push(`  ${record.path}  ${record.id}${status}`);
    lines.push(`      via ${routes}`);
  }
  if (result.decidingSpecs.length > 0) {
    lines.push('  Specs that decided a record above:');
    for (const record of result.decidingSpecs) {
      const routes = record.routes
        .map(route => `${route.via} ${route.detail}`)
        .join('; ');
      lines.push(`    ${record.path}  ${record.id}`);
      lines.push(`        via ${routes}`);
    }
  }
  const byRecord = new Map();
  for (const claim of result.globalClaims) {
    const list = byRecord.get(claim.path) ?? [];
    list.push(`${claim.claimId} (${claim.trigger})`);
    byRecord.set(claim.path, list);
  }
  lines.push(
    `  Global claims for triggers ${result.triggers.join(', ') || '(none)'} — ${result.triggerSource}:`,
  );
  if (byRecord.size === 0) lines.push('    none');
  for (const [recordPath, claims] of byRecord) {
    lines.push(`    ${recordPath}  ${[...new Set(claims)].join(', ')}`);
  }
  return lines.join('\n');
}

const USAGE = `Usage: pnpm specs:for <file...> [--json] [--include-draft] [--triggers a,b]
       pnpm specs:for --unreached [--json]
       pnpm specs:for --unrouted [--json]

Lists every knowledge record that governs each file, with the link that put it
there, the specs that decided those records, and the trigger-routed global
claims. --unreached lists current records no other tracked file reaches.
--unrouted lists tracked files no current record governs.`;

function main(argv) {
  const files = [];
  let json = false;
  let includeDraft = false;
  let unreached = false;
  let unrouted = false;
  let triggers;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') json = true;
    else if (arg === '--include-draft') includeDraft = true;
    else if (arg === '--unreached') unreached = true;
    else if (arg === '--unrouted') unrouted = true;
    else if (arg === '--triggers') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--triggers requires a comma-separated list.');
      }
      triggers = value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      return 0;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option ${arg}.\n\n${USAGE}`);
    } else files.push(arg);
  }

  const index = loadKnowledgeIndex(DEFAULT_ROOT);
  if (unreached) {
    const result = findUnreachedRecords(index, trackedFiles(DEFAULT_ROOT));
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(
        `${result.length} current records are not reached by any tracked file:`,
      );
      for (const record of result)
        console.log(`  ${record.path}  ${record.id}`);
    }
    return 0;
  }
  if (unrouted) {
    const result = findUnroutedFiles(index, trackedFiles(DEFAULT_ROOT));
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
      const byDirectory = new Map();
      for (const file of result) {
        const key = file.split('/').slice(0, 3).join('/');
        byDirectory.set(key, (byDirectory.get(key) ?? 0) + 1);
      }
      console.log(
        `${result.length} tracked files have no governing current record:`,
      );
      for (const [directory, count] of [...byDirectory].sort(
        (left, right) => right[1] - left[1],
      )) {
        console.log(`  ${String(count).padStart(5)}  ${directory}`);
      }
    }
    return 0;
  }
  if (files.length === 0) {
    console.error(USAGE);
    return 2;
  }
  const cwd = process.env.INIT_CWD ?? process.cwd();
  const results = files.map(file =>
    resolveSpecsForFile(index, path.resolve(cwd, file), {
      includeDraft,
      triggers,
    }),
  );
  if (json) console.log(JSON.stringify(results, null, 2));
  else console.log(results.map(formatResult).join('\n\n'));
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
