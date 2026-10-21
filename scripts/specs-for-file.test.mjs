// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {
  GLOBAL_REVIEW_TRIGGERS,
  collectGlobalReviewMatches,
} from './check-knowledge.mjs';
import {
  findUnreachedRecords,
  findUnroutedFiles,
  loadKnowledgeIndex,
  resolveSpecsForFile,
} from './specs-for-file.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

function fixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-specs-for-'));
  roots.push(root);
  return root;
}

function write(root, relative, content = '') {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), {recursive: true});
  fs.writeFileSync(absolute, content);
}

function frontmatterValue(value) {
  return Array.isArray(value) ? `[${value.join(', ')}]` : String(value);
}

function writeRecord(root, relative, fields, body = '') {
  const lines = Object.entries({authority: 'current', ...fields}).map(
    ([key, value]) => `${key}: ${frontmatterValue(value)}`,
  );
  write(root, relative, `---\n${lines.join('\n')}\n---\n\n# Record\n${body}`);
}

function globalBlock(triggers) {
  return [
    '',
    '<!-- review-applicability:v1 -->',
    '',
    '```json',
    JSON.stringify({scope: 'global', triggers}),
    '```',
    '',
    '## Requirements',
    '',
    ...Object.values(triggers)
      .flat()
      .map(id => `- **${id} — Claim ${id}.** Detail.`),
    '',
  ].join('\n');
}

/**
 * A small repository: Popover (component + family + architecture + deciding
 * spec), a Dialog module directory, a tooling architecture, and a docs topic.
 */
function popoverFixture() {
  const root = fixtureRoot();
  write(root, 'packages/core/src/Popover/Popover.tsx');
  write(root, 'packages/core/src/Popover/Popover.test.tsx');
  write(
    root,
    'packages/core/src/Popover/Popover.doc.mjs',
    "export const docs = {name: 'Popover', components: [{name: 'PopoverTrigger'}]};\n",
  );
  writeRecord(root, 'packages/core/src/Popover/Popover.spec.md', {
    kind: 'component',
    id: 'component:Popover',
    review_triggers: ['behavior', 'layering'],
    verified_by: ['packages/core/src/Popover/Popover.test.tsx'],
    families: ['family:overlay-dismissal'],
    architecture: ['architecture:layer-runtime'],
    modules: [],
  });
  writeRecord(root, 'docs/families/overlay-dismissal.md', {
    kind: 'family',
    id: 'family:overlay-dismissal',
    members: ['component:Popover', 'component:Tooltip'],
    architecture: [],
    deciding_specs: ['spec:AST-003'],
  });
  writeRecord(root, 'docs/architecture/layer-runtime.md', {
    kind: 'architecture',
    id: 'architecture:layer-runtime',
    applies_to: ['packages/core/src/Layer/'],
    verified_by: ['scripts/layer-check.mjs'],
    deciding_specs: [],
  });
  writeRecord(root, 'docs/specs/AST-003/spec.md', {
    kind: 'system-spec',
    id: 'spec:AST-003',
    affects_architecture: ['architecture:layer-runtime'],
    affects_families: [],
    affects_consumer_docs: [],
  });
  writeRecord(root, 'docs/specs/AST-013/spec.md', {
    kind: 'system-spec',
    id: 'spec:AST-013',
    affects_architecture: [],
    affects_families: [],
    affects_consumer_docs: ['Tooltip', 'browser-support'],
  });
  writeRecord(
    root,
    'docs/specs/AST-020/spec.md',
    {
      kind: 'system-spec',
      id: 'spec:AST-020',
      affects_architecture: [],
      affects_families: [],
      affects_consumer_docs: [],
    },
    globalBlock({behavior: ['FR1'], testing: ['FR2']}),
  );
  writeRecord(root, 'docs/specs/AST-090/spec.md', {
    kind: 'system-spec',
    id: 'spec:AST-090',
    authority: 'draft',
    affects_architecture: [],
    affects_families: ['family:overlay-dismissal'],
    affects_consumer_docs: [],
  });

  write(root, 'packages/core/src/Dialog/Dialog.tsx');
  write(root, 'packages/core/src/Dialog/modules/DialogHeader.tsx');
  write(root, 'packages/core/src/Dialog/modules/DialogHeader.test.tsx');
  write(root, 'packages/core/src/Dialog/modules/DialogFooter.tsx');
  writeRecord(root, 'packages/core/src/Dialog/modules/DialogHeader.spec.md', {
    kind: 'module',
    id: 'module:Dialog/DialogHeader',
    parent_component: 'component:Dialog',
    references: [],
  });
  writeRecord(root, 'packages/core/src/Dialog/modules/DialogBody.spec.md', {
    kind: 'module',
    id: 'module:Dialog/DialogBody',
    parent_component: 'component:Dialog',
    references: [],
  });
  write(root, 'packages/core/src/Table/plugins/activation/useActivation.ts');
  write(root, 'packages/core/src/Table/plugins/activation/helpers/key.ts');
  writeRecord(
    root,
    'packages/core/src/Table/plugins/activation/useTableActivation.spec.md',
    {
      kind: 'module',
      id: 'module:Table/useTableActivation',
      parent_component: 'component:Table',
      references: [],
    },
  );

  write(root, 'packages/core/src/Layer/Layer.tsx');
  write(root, 'packages/core/src/LayerProvider/LayerProvider.tsx');
  write(root, 'scripts/layer-check.mjs');
  write(root, 'packages/cli/assets/docs/browser-support.doc.mjs');
  write(root, 'packages/cli/assets/docs/tree/browser-support.doc.mjs');
  write(root, 'apps/docsite/src/content/blog/posts/release.md');
  return root;
}

function ids(entries) {
  return entries.map(entry => entry.id).sort();
}

describe('resolveSpecsForFile', () => {
  it('routes a component file to its record, family, inherited architecture, and deciding specs', () => {
    const index = loadKnowledgeIndex(popoverFixture());
    const result = resolveSpecsForFile(
      index,
      'packages/core/src/Popover/Popover.tsx',
    );
    expect(ids(result.records)).toEqual([
      'architecture:layer-runtime',
      'component:Popover',
      'family:overlay-dismissal',
    ]);
    const family = result.records.find(
      record => record.id === 'family:overlay-dismissal',
    );
    expect(family.routes).toEqual([
      {via: 'members', detail: 'component:Popover'},
      {via: 'inherited:families', detail: 'component:Popover'},
    ]);
    expect(ids(result.decidingSpecs)).toEqual(['spec:AST-003']);
    expect(result.component).toEqual({
      package: 'core',
      root: 'Popover',
      names: ['Popover', 'PopoverTrigger'],
    });
  });

  it('keeps draft records out unless asked', () => {
    const index = loadKnowledgeIndex(popoverFixture());
    const file = 'packages/core/src/Popover/Popover.tsx';
    expect(ids(resolveSpecsForFile(index, file).decidingSpecs)).not.toContain(
      'spec:AST-090',
    );
    expect(
      ids(resolveSpecsForFile(index, file, {includeDraft: true}).decidingSpecs),
    ).toContain('spec:AST-090');
  });

  it('routes a module by its same-stem sources and a dedicated module directory by subtree', () => {
    const index = loadKnowledgeIndex(popoverFixture());
    const header = resolveSpecsForFile(
      index,
      'packages/core/src/Dialog/modules/DialogHeader.test.tsx',
    );
    expect(ids(header.records)).toEqual(['module:Dialog/DialogHeader']);
    const footer = resolveSpecsForFile(
      index,
      'packages/core/src/Dialog/modules/DialogFooter.tsx',
    );
    expect(footer.records).toEqual([]);
    const plugin = resolveSpecsForFile(
      index,
      'packages/core/src/Table/plugins/activation/helpers/key.ts',
    );
    expect(ids(plugin.records)).toEqual(['module:Table/useTableActivation']);
  });

  it('matches applies_to by path segment, never by string prefix', () => {
    const index = loadKnowledgeIndex(popoverFixture());
    expect(
      ids(
        resolveSpecsForFile(index, 'packages/core/src/Layer/Layer.tsx').records,
      ),
    ).toContain('architecture:layer-runtime');
    expect(
      resolveSpecsForFile(
        index,
        'packages/core/src/LayerProvider/LayerProvider.tsx',
      ).records,
    ).toEqual([]);
  });

  it('routes verified_by evidence to the record it verifies', () => {
    const index = loadKnowledgeIndex(popoverFixture());
    const result = resolveSpecsForFile(index, 'scripts/layer-check.mjs');
    expect(result.records[0]).toMatchObject({
      id: 'architecture:layer-runtime',
      routes: [{via: 'verified_by', detail: 'scripts/layer-check.mjs'}],
    });
  });

  it('routes consumer-doc ids to their topic files', () => {
    const index = loadKnowledgeIndex(popoverFixture());
    for (const file of [
      'packages/cli/assets/docs/browser-support.doc.mjs',
      'packages/cli/assets/docs/tree/browser-support.doc.mjs',
    ]) {
      expect(ids(resolveSpecsForFile(index, file).records)).toEqual([
        'spec:AST-013',
      ]);
    }
  });

  it('reports a path no record reaches instead of guessing', () => {
    const index = loadKnowledgeIndex(popoverFixture());
    const result = resolveSpecsForFile(
      index,
      'apps/docsite/src/content/blog/posts/release.md',
    );
    expect(result.records).toEqual([]);
    expect(result.decidingSpecs).toEqual([]);
  });

  it('selects global claims exactly as the review baseline router does', () => {
    const root = popoverFixture();
    const index = loadKnowledgeIndex(root);
    const records = index.records.map(record => ({
      path: record.path,
      content: record.content,
    }));
    const project = matches =>
      matches.map(({recordId, path: recordPath, trigger, claimId, claim}) => ({
        recordId,
        path: recordPath,
        trigger,
        claimId,
        claim,
      }));

    const local = resolveSpecsForFile(
      index,
      'packages/core/src/Popover/Popover.tsx',
    );
    expect(local.triggers).toEqual(['behavior', 'layering']);
    expect(local.globalClaims).toEqual(
      project(collectGlobalReviewMatches(records, local.triggers, null)),
    );
    expect(local.globalClaims.map(claim => claim.claimId)).toEqual(['FR1']);

    const requested = resolveSpecsForFile(index, 'scripts/layer-check.mjs', {
      triggers: ['testing'],
    });
    expect(requested.globalClaims.map(claim => claim.claimId)).toEqual(['FR2']);

    const none = resolveSpecsForFile(
      index,
      'apps/docsite/src/content/blog/posts/release.md',
    );
    expect(none.triggers).toEqual([...GLOBAL_REVIEW_TRIGGERS].sort());
  });
});

describe('coverage audits', () => {
  it('lists current records only their own file reaches', () => {
    const root = popoverFixture();
    const index = loadKnowledgeIndex(root);
    const files = [
      'packages/core/src/Popover/Popover.tsx',
      'docs/specs/AST-020/spec.md',
      'docs/specs/AST-013/spec.md',
    ];
    expect(ids(findUnreachedRecords(index, files))).toEqual([
      'module:Dialog/DialogBody',
      'module:Dialog/DialogHeader',
      'module:Table/useTableActivation',
      'spec:AST-013',
      'spec:AST-020',
    ]);
  });

  it('lists tracked files without a governing record', () => {
    const index = loadKnowledgeIndex(popoverFixture());
    expect(
      findUnroutedFiles(index, [
        'packages/core/src/Popover/Popover.tsx',
        'apps/docsite/src/content/blog/posts/release.md',
      ]),
    ).toEqual(['apps/docsite/src/content/blog/posts/release.md']);
  });
});

describe('repository records', () => {
  const index = loadKnowledgeIndex(repoRoot);

  it('routes every current component and module record from a file beside it', () => {
    const missing = [];
    for (const record of index.records) {
      if (record.authority !== 'current') continue;
      if (record.kind !== 'component' && record.kind !== 'module') continue;
      const directory = path.join(repoRoot, path.dirname(record.path));
      const stem = path.basename(record.path, '.spec.md');
      const sibling = fs
        .readdirSync(directory)
        .find(
          name => name.split('.')[0] === stem && !name.endsWith('.spec.md'),
        );
      if (!sibling) continue;
      const file = path.posix.join(path.posix.dirname(record.path), sibling);
      if (
        !ids(resolveSpecsForFile(index, file, {triggers: []}).records).includes(
          record.id,
        )
      ) {
        missing.push(`${record.id} from ${file}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('routes every current architecture record from each applies_to path', () => {
    const missing = [];
    for (const record of index.records) {
      if (record.authority !== 'current' || record.kind !== 'architecture') {
        continue;
      }
      for (const entry of record.frontmatter.get('applies_to') ?? []) {
        const target = path.join(repoRoot, entry);
        if (!fs.existsSync(target)) continue;
        const file = fs.statSync(target).isDirectory()
          ? path.posix.join(entry.replace(/\/+$/, ''), '__probe__.ts')
          : entry;
        if (
          !ids(
            resolveSpecsForFile(index, file, {triggers: []}).records,
          ).includes(record.id)
        ) {
          missing.push(`${record.id} from ${file}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
