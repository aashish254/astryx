// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Package mistakes `astryx doctor integration validate` and
 * `astryx integration check` used to pass, crash on, or describe badly: names
 * that differ from file names, ids readers cannot take, duplicate and
 * case-mismatched docs, symlinked or absolute roots, a root that is a file, a
 * package.json missing what npm needs, manifest key typos, docs and manifests
 * with no default export, and theme descriptors named for built output. Each
 * finding carries a `Fix:` that holds when followed.
 *
 * Temp dirs live under the repo root, as in validate-integration.test.mjs.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {
  validateIntegration,
  validateLocalIntegration,
} from './validate-integration.mjs';
import {integrationCheck} from './check/check.mjs';
import {componentDocNamesReport} from '../../foundation/integrations/validate-contributions.mjs';

let tmpDir;
let copies = 0;

const CLI = path.join(
  process.cwd(),
  'packages',
  'cli',
  'clients',
  'cli',
  'bin',
  'astryx.mjs',
);

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-validate-gaps-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

const MANIFEST = 'astryx.integration.mjs';
const THEME_TYPE =
  "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\n";

/** @param {Record<string, unknown>} roots */
const manifest = roots => `export default ${JSON.stringify(roots)};\n`;
/** @param {string} name */
const componentDoc = name =>
  `export default {type: 'component', name: '${name}', displayName: '${name}', usage: {description: '${name}.'}, props: []};\n`;
/** @param {string} name */
const componentSource = name => `export function ${name}() { return null; }\n`;
/** @param {string} name */
const topic = name =>
  `export default ${JSON.stringify({
    type: 'generic',
    name,
    title: name,
    description: `The ${name} topic.`,
    sections: [{title: 'Overview', content: [{type: 'prose', text: name}]}],
  })};\n`;
/** @param {string} name */
const templateDoc = name =>
  `export default {type: 'block', name: '${name}', displayName: '${name}', aspectRatio: 1};\n`;
const templateSource = 'export default function Block() { return null; }\n';

/**
 * @param {Record<string, string>} files package-relative path -> contents
 * @param {Record<string, unknown>} [pkg] package.json
 * @returns {string} the package directory
 */
function writePackage(files, pkg = {name: '@acme/kit', version: '1.0.0'}) {
  const dir = path.join(tmpDir, 'pkg');
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg));
  for (const [file, contents] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true});
    fs.writeFileSync(path.join(dir, file), contents);
  }
  return dir;
}

/**
 * Carry out a fix on a fresh copy of the package.
 * @param {string} dir
 * @param {{move?: Array<[string, string]>, write?: Record<string, string>, remove?: string[]}} steps
 */
function follow(dir, {move = [], write = {}, remove = []}) {
  copies += 1;
  const copy = path.join(tmpDir, `followed-${copies}`);
  fs.cpSync(dir, copy, {recursive: true, verbatimSymlinks: true});
  for (const file of remove) {
    fs.rmSync(path.join(copy, file), {recursive: true, force: true});
  }
  for (const [from, to] of move) {
    fs.mkdirSync(path.dirname(path.join(copy, to)), {recursive: true});
    fs.renameSync(path.join(copy, from), path.join(copy, to));
  }
  for (const [file, contents] of Object.entries(write)) {
    fs.mkdirSync(path.dirname(path.join(copy, file)), {recursive: true});
    fs.writeFileSync(path.join(copy, file), contents);
  }
  return copy;
}

/** @param {string} dir */
async function issuesOf(dir) {
  return (await validateLocalIntegration(dir)).issues;
}

/**
 * The one issue with this code, which the test is about.
 * @param {Array<{code: string, message: string}>} issues
 * @param {string} code
 */
function only(issues, code) {
  const found = issues.filter(issue => issue.code === code);
  expect(found).toHaveLength(1);
  return found[0].message;
}

/**
 * A component doc whose import names its published subpath.
 * @param {string} stem the doc's file name
 * @param {string} name
 */
const namedDoc = (stem, name) =>
  componentDoc(name).replace(
    "type: 'component',",
    `type: 'component', import: '@acme/kit/components/${stem}',`,
  );
/**
 * A package that publishes each file under its components folder.
 * @param {Record<string, string>} files
 */
const writeNamed = files =>
  writePackage(files, {
    name: '@acme/kit',
    version: '1.0.0',
    exports: {
      './components/*': './components/*.tsx',
      '.': './index.ts',
    },
  });

describe('a name that differs from its file name', () => {
  it('warns about a component doc whose name is not the name it is listed under', async () => {
    const dir = writeNamed({
      [MANIFEST]: manifest({components: './components'}),
      'components/AcmeWidget.doc.mjs': namedDoc('AcmeWidget', 'AcmeWidgets'),
      'components/AcmeWidget.tsx': componentSource('AcmeWidget'),
    });

    const issues = await issuesOf(dir);
    expect(issues.map(issue => issue.code)).toEqual(['doc_name_mismatch']);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].message).toBe(
      'Component doc "AcmeWidget.doc.mjs" sets name: \'AcmeWidgets\', but components/AcmeWidget.tsx, the module its import names, does not export AcmeWidgets, so Astryx lists the component as "AcmeWidget" (its file name), and `astryx component AcmeWidget` prints `import {AcmeWidgets}`. Fix: set name: \'AcmeWidget\' in AcmeWidget.doc.mjs.',
    );

    const fixed = follow(dir, {
      write: {
        'components/AcmeWidget.doc.mjs': namedDoc('AcmeWidget', 'AcmeWidget'),
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it.each([
    [
      'a re-export from another package',
      "export {AcmeWidgets} from '@acme/ui';\n",
      'AcmeWidget.tsx re-exports AcmeWidgets from "@acme/ui", another package this check does not read.',
    ],
    [
      'a .js specifier this read cannot follow',
      "export {AcmeWidgets} from './impl/widgets.js';\n",
      'AcmeWidget.tsx re-exports AcmeWidgets from "./impl/widgets.js", which resolves to no file this check can read.',
    ],
    [
      'an export * from another package',
      "export * from '@acme/ui';\n",
      'AcmeWidget.tsx re-exports everything from "@acme/ui", another package this check does not read.',
    ],
    [
      'a destructured export',
      'const parts = {AcmeWidgets: () => null};\nexport const {AcmeWidgets} = parts;\n',
      'AcmeWidget.tsx exports a destructured binding, whose names this check does not read.',
    ],
    [
      'a TypeScript namespace export',
      'export namespace AcmeWidgets {\n  export const Root = () => null;\n}\n',
      'AcmeWidget.tsx exports AcmeWidgets as a TypeScript namespace, which has a runtime value only when it holds one.',
    ],
    [
      'an export assignment',
      'const AcmeWidgets = () => null;\nexport = {AcmeWidgets};\n',
      'AcmeWidget.tsx uses `export =`, whose names this check does not read.',
    ],
  ])(
    'lists a doc name the code cannot judge as not checked, with no finding: %s',
    async (_label, source, reason) => {
      const dir = writeNamed({
        [MANIFEST]: manifest({components: './components'}),
        'components/AcmeWidget.doc.mjs': namedDoc('AcmeWidget', 'AcmeWidgets'),
        'components/AcmeWidget.tsx': source,
      });

      const {data} = await validateIntegration(undefined, {cwd: dir});
      expect(
        data.issues.filter(issue => issue.code === 'doc_name_mismatch'),
      ).toEqual([]);
      expect(data.docNames).toEqual({
        status: 'checked',
        findings: [],
        unchecked: [
          {file: 'components/AcmeWidget.doc.mjs', name: 'AcmeWidgets', reason},
        ],
      });
      // Counted as not compared, never as a failure, even under --strict.
      const checked = await integrationCheck({cwd: dir, strict: true});
      const propsNotCompared = checked.data.checks
        .map(check => check.response.data.propDrift?.unchecked?.length ?? 0)
        .reduce((a, b) => a + b, 0);
      expect(checked.data.unchecked).toBe(1 + propsNotCompared);
      expect(
        checked.data.failures.filter(
          failure => failure.code === 'doc_names_skipped',
        ),
      ).toEqual([]);
    },
  );

  it.each([
    [
      'a source that exports both names',
      'export function AcmeWidget() { return null; }\nexport const AcmeWidgets = AcmeWidget;\n',
    ],
    [
      'an export import alias, a runtime value',
      'namespace Impl {\n  export const Widgets = () => null;\n}\nexport function AcmeWidget() { return null; }\nexport import AcmeWidgets = Impl.Widgets;\n',
    ],
    [
      'an enum, a runtime value',
      'export function AcmeWidget() { return null; }\nexport enum AcmeWidgets {\n  Small,\n}\n',
    ],
  ])(
    'checks a doc name the source exports, with nothing listed: %s',
    async (_label, source) => {
      const dir = writeNamed({
        [MANIFEST]: manifest({components: './components'}),
        'components/AcmeWidget.doc.mjs': namedDoc('AcmeWidget', 'AcmeWidgets'),
        'components/AcmeWidget.tsx': source,
      });

      const {data} = await validateIntegration(undefined, {cwd: dir});
      expect(data.issues).toEqual([]);
      expect(data.docNames).toEqual({
        status: 'checked',
        findings: [],
        unchecked: [],
      });
    },
  );

  it('prints the doc names it could not check', () => {
    const dir = writeNamed({
      [MANIFEST]: manifest({components: './components'}),
      'components/AcmeWidget.doc.mjs': namedDoc('AcmeWidget', 'AcmeWidgets'),
      'components/AcmeWidget.tsx': "export {AcmeWidgets} from '@acme/ui';\n",
    });

    const run = spawnSync(
      process.execPath,
      [CLI, 'doctor', 'integration', 'validate'],
      {cwd: dir, encoding: 'utf-8', timeout: 60_000},
    );
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain(
      '[info] Component names not checked: 1 doc(s) whose source exports this check cannot read:',
    );
    expect(run.stdout).toContain('components/AcmeWidget.doc.mjs');
    expect(run.stdout).toContain(
      'AcmeWidget.tsx re-exports AcmeWidgets from "@acme/ui", another package this check does not read.',
    );
  });

  it('does not count a member a namespace exports as an export of the module', async () => {
    const dir = writeNamed({
      [MANIFEST]: manifest({components: './components'}),
      'components/AcmeWidget.doc.mjs': namedDoc('AcmeWidget', 'AcmeWidgets'),
      'components/AcmeWidget.tsx':
        'namespace Impl {\n  export const AcmeWidgets = () => null;\n}\nexport function AcmeWidget() { return null; }\n',
    });

    expect(only(await issuesOf(dir), 'doc_name_mismatch')).toContain(
      'components/AcmeWidget.tsx, the module its import names, does not export AcmeWidgets',
    );
  });

  it('follows a local re-export that does not export the documented name', async () => {
    const dir = writeNamed({
      [MANIFEST]: manifest({components: './components'}),
      'components/AcmeWidget.doc.mjs': namedDoc('AcmeWidget', 'AcmeWidgets'),
      'components/AcmeWidget.tsx': "export * from './impl';\n",
      'components/impl.tsx': componentSource('AcmeWidget'),
    });

    expect(only(await issuesOf(dir), 'doc_name_mismatch')).toContain(
      "sets name: 'AcmeWidgets'",
    );
  });

  it('proposes the export a kebab-case source holds, never its file name', async () => {
    const dir = writeNamed({
      [MANIFEST]: manifest({components: './components'}),
      'components/acme-widget.doc.mjs': namedDoc('acme-widget', 'AcmeWidgets'),
      'components/acme-widget.tsx': componentSource('AcmeWidget'),
    });

    const message = only(await issuesOf(dir), 'doc_name_mismatch');
    expect(message).toBe(
      'Component doc "acme-widget.doc.mjs" sets name: \'AcmeWidgets\', but components/acme-widget.tsx, the module its import names, does not export AcmeWidgets, so Astryx lists the component as "acme-widget" (its file name), and `astryx component acme-widget` prints `import {AcmeWidgets}`. Fix: set name: \'AcmeWidget\' in acme-widget.doc.mjs, the component components/acme-widget.tsx exports.',
    );
    const fixed = follow(dir, {
      write: {
        'components/acme-widget.doc.mjs': namedDoc('acme-widget', 'AcmeWidget'),
      },
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('names no single export when a source exports several components', async () => {
    const dir = writeNamed({
      [MANIFEST]: manifest({components: './components'}),
      'components/acme-widget.doc.mjs': namedDoc('acme-widget', 'AcmeWidgets'),
      'components/acme-widget.tsx':
        'export function AcmeWidget() { return null; }\nexport function AcmeGizmo() { return null; }\n',
    });

    expect(only(await issuesOf(dir), 'doc_name_mismatch')).toContain(
      'Fix: set name in acme-widget.doc.mjs to the component components/acme-widget.tsx exports (AcmeGizmo, AcmeWidget).',
    );
  });

  it('judges the module the printed import names: an entry that publishes a default under the doc name passes', async () => {
    const dir = writePackage(
      {
        [MANIFEST]: manifest({components: './components'}),
        'components/acme-widget.doc.mjs': componentDoc('AcmeWidget'),
        'components/acme-widget.tsx':
          'export default function AcmeWidget() { return null; }\n',
        'index.ts':
          "export {default as AcmeWidget} from './components/acme-widget';\n",
      },
      {name: '@acme/kit', version: '1.0.0', exports: {'.': './index.ts'}},
    );

    const {data} = await validateIntegration(undefined, {cwd: dir});
    expect(data.issues).toEqual([]);
    expect(data.docNames?.unchecked).toEqual([]);
  });

  it('flags a name the printed entry provably does not publish', async () => {
    const dir = writePackage(
      {
        [MANIFEST]: manifest({components: './components'}),
        'components/acme-widget.doc.mjs': componentDoc('AcmeWidget'),
        'components/acme-widget.tsx':
          'export default function AcmeWidget() { return null; }\n',
        'index.ts':
          "export {default as AcmeGadget} from './components/acme-widget';\n",
      },
      {name: '@acme/kit', version: '1.0.0', exports: {'.': './index.ts'}},
    );

    expect(only(await issuesOf(dir), 'doc_name_mismatch')).toContain(
      'but index.ts, the module its import names, does not export AcmeWidget',
    );
  });

  it('flags a name the printed import cannot give when its module exports only a default', async () => {
    const dir = writeNamed({
      [MANIFEST]: manifest({components: './components'}),
      'components/acme-widget.doc.mjs': namedDoc('acme-widget', 'AcmeWidget'),
      'components/acme-widget.tsx':
        'export default function AcmeWidget() { return null; }\n',
    });

    const message = only(await issuesOf(dir), 'doc_name_mismatch');
    expect(message).toContain(
      'but components/acme-widget.tsx, the module its import names, does not export AcmeWidget',
    );
    expect(message).toContain(
      "Fix: export it by name from components/acme-widget.tsx (`export {default as AcmeWidget}`), or set the doc's import to the module that publishes it as AcmeWidget.",
    );
  });

  it('lists a default-only source as not checked when no printed import can be resolved', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './components'}),
      'components/acme-widget.doc.mjs': componentDoc('AcmeWidget'),
      'components/acme-widget.tsx':
        'export default function AcmeWidget() { return null; }\n',
    });
    // No package to resolve an import in: the same-stem source is read.
    const report = await componentDocNamesReport({
      name: '@acme/kit',
      components: path.join(dir, 'components'),
      __spec: '@acme/kit',
      __manifestFile: path.join(dir, MANIFEST),
    });

    expect(report.unchecked).toEqual([
      {
        file: 'acme-widget.doc.mjs',
        name: 'AcmeWidget',
        reason:
          'acme-widget.tsx exports a default, which the package entry may publish under any name.',
      },
    ]);
  });

  it('lists a name whose printed import resolves to no file as not checked', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './components'}),
      'components/acme-widget.doc.mjs': componentDoc('AcmeGadget'),
      'components/acme-widget.tsx': componentSource('AcmeWidget'),
    });

    const {data} = await validateIntegration(undefined, {cwd: dir});
    expect(data.issues).toEqual([]);
    expect(data.docNames?.unchecked.map(entry => entry.file)).toEqual([
      'components/acme-widget.doc.mjs',
    ]);
  });

  it('accepts a kebab-case file whose doc names the export it holds', async () => {
    const dir = writeNamed({
      [MANIFEST]: manifest({components: './components'}),
      'components/acme-widget.doc.mjs': namedDoc('acme-widget', 'AcmeWidget'),
      'components/acme-widget.tsx': componentSource('AcmeWidget'),
    });

    expect(await issuesOf(dir)).toEqual([]);
  });

  it('leaves a doc topic named differently from its file alone: the code does not contradict it', async () => {
    const dir = writeNamed({
      [MANIFEST]: manifest({docs: './docs'}),
      'docs/deploying.doc.mjs': topic('deploy'),
    });

    expect(await issuesOf(dir)).toEqual([]);
  });

  it('leaves a template name alone: it is the display title', async () => {
    const dir = writeNamed({
      [MANIFEST]: manifest({templates: './templates'}),
      'templates/account-card.doc.mjs': templateDoc('Account card'),
      'templates/account-card.tsx': templateSource,
    });

    expect(await issuesOf(dir)).toEqual([]);
  });
});

describe('block component names', () => {
  /** @param {string} extra */
  const block = extra =>
    `export default {type: 'block', name: 'Account card', displayName: 'Account card', aspectRatio: 1,${extra}};\n`;

  it('flags exampleFor and componentsUsed naming no component', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({templates: './templates'}),
      'templates/account-card.doc.mjs': block(
        " exampleFor: 'AcmeGizmo', componentsUsed: ['AcmeGizmo']",
      ),
      'templates/account-card.tsx': templateSource,
    });

    const issues = await issuesOf(dir);
    expect(issues.map(issue => issue.code)).toEqual([
      'unknown_block_component',
      'unknown_block_component',
    ]);
    expect(issues[0].message).toBe(
      'Template "account-card" names "AcmeGizmo" in exampleFor, but neither this package nor Core has a component by that name and the template does not import it, so `astryx template --list` and the block\'s search keywords give a component name no one can look up. Fix: use the component\'s exact name, or remove "AcmeGizmo" from exampleFor.',
    );
  });

  it("accepts every doc astryx component resolves in Core, such as Chat and Layout, and the package's and imported names", async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({
        components: './components',
        templates: './templates',
      }),
      'components/AcmeWidget.doc.mjs': componentDoc('AcmeWidget'),
      'components/AcmeWidget.tsx': componentSource('AcmeWidget'),
      'templates/account-card.doc.mjs': block(
        " exampleFor: 'AcmeWidget', componentsUsed: ['Chat', 'Layout', 'Button', 'AcmeWidget', 'Helper']",
      ),
      'templates/account-card.tsx':
        "import {Helper} from 'some-lib';\nexport default function A() {\n  return <Helper />;\n}\n",
    });

    expect(await issuesOf(dir)).toEqual([]);
  });

  it('lists a name the template may render through a namespace import as not checked', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({templates: './templates'}),
      'templates/account-card.doc.mjs': block(" componentsUsed: ['Panel']"),
      'templates/account-card.tsx':
        "import * as UI from '@acme/ui';\nexport default function A() {\n  return <UI.Panel />;\n}\n",
    });

    const {data} = await validateIntegration(undefined, {cwd: dir});
    expect(data.issues).toEqual([]);
    expect(data.blockComponents?.unchecked).toEqual([
      {
        file: 'templates/account-card.doc.mjs',
        name: 'Panel',
        reason:
          'account-card.tsx imports "@acme/ui" as a namespace (UI), whose component names this check does not read.',
      },
    ]);
  });

  it('follows a local helper the template renders through', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({templates: './templates'}),
      'templates/account-card/account-card.doc.mjs': block(
        " componentsUsed: ['Panel', 'AcmeGizmo']",
      ),
      'templates/account-card/account-card.tsx':
        "import {Body} from './parts/Body';\nexport default function A() {\n  return <Body />;\n}\n",
      'templates/account-card/parts/Body.tsx':
        "import {Panel} from '@acme/ui';\nexport function Body() {\n  return <Panel />;\n}\n",
    });

    const {data} = await validateIntegration(undefined, {cwd: dir});
    expect(
      data.issues
        .filter(issue => issue.code === 'unknown_block_component')
        .map(issue => issue.message),
    ).toEqual([expect.stringContaining('names "AcmeGizmo" in componentsUsed')]);
    expect(data.blockComponents?.unchecked).toEqual([]);
  });

  it('lists a name behind a local helper it cannot read as not checked', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({templates: './templates'}),
      'templates/account-card.doc.mjs': block(" componentsUsed: ['Panel']"),
      'templates/account-card.tsx':
        "import {Body} from './parts/missing';\nexport default function A() {\n  return <Body />;\n}\n",
    });

    const {data} = await validateIntegration(undefined, {cwd: dir});
    expect(data.issues).toEqual([]);
    expect(data.blockComponents?.unchecked.map(entry => entry.name)).toEqual([
      'Panel',
    ]);
  });

  it('lists names only Core could resolve as not checked when Core is not installed', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-no-core-'));
    try {
      fs.writeFileSync(
        path.join(outside, 'package.json'),
        JSON.stringify({name: '@acme/kit', version: '1.0.0'}),
      );
      fs.writeFileSync(
        path.join(outside, MANIFEST),
        manifest({templates: './templates'}),
      );
      fs.mkdirSync(path.join(outside, 'templates'));
      fs.writeFileSync(
        path.join(outside, 'templates', 'account-card.doc.mjs'),
        block(" componentsUsed: ['Chat', 'Layout']"),
      );
      fs.writeFileSync(
        path.join(outside, 'templates', 'account-card.tsx'),
        templateSource,
      );

      const {data} = await validateIntegration(undefined, {cwd: outside});
      expect(
        data.issues.filter(issue => issue.code === 'unknown_block_component'),
      ).toEqual([]);
      const reason =
        'Core is not installed, so its component names cannot be checked.';
      expect(data.blockComponents).toEqual({
        status: 'checked',
        findings: [],
        unchecked: [
          {file: 'templates/account-card.doc.mjs', name: 'Chat', reason},
          {file: 'templates/account-card.doc.mjs', name: 'Layout', reason},
        ],
      });
    } finally {
      fs.rmSync(outside, {recursive: true, force: true});
    }
  });
});

describe('template ids', () => {
  it('leaves an id with spaces alone: it is naming policy, not a contradiction', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({templates: './templates'}),
      'templates/AI Chat Conversation.doc.mjs': templateDoc(
        'AI Chat Conversation',
      ),
      'templates/AI Chat Conversation.tsx': templateSource,
    });

    expect(await issuesOf(dir)).toEqual([]);
  });
});

describe('component doc files', () => {
  it('warns about two docs for one component and names the one read', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './components'}),
      'components/AcmeWidget.doc.mjs': componentDoc('AcmeWidget'),
      'components/AcmeWidget.doc.js': componentDoc('AcmeWidget'),
      'components/AcmeWidget.tsx': componentSource('AcmeWidget'),
    });

    const message = only(await issuesOf(dir), 'duplicate_component_doc');
    expect(message).toBe(
      'Component "AcmeWidget" has 2 docs: AcmeWidget.doc.mjs, AcmeWidget.doc.js. Astryx reads AcmeWidget.doc.mjs and ignores AcmeWidget.doc.js. Fix: delete AcmeWidget.doc.js, moving anything only it says into AcmeWidget.doc.mjs.',
    );

    const fixed = follow(dir, {remove: ['components/AcmeWidget.doc.js']});
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('gives one finding for a doc whose name differs from its source only in case', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './components'}),
      'components/Acmewidget.doc.mjs': componentDoc('AcmeWidget'),
      'components/AcmeWidget.tsx': componentSource('AcmeWidget'),
    });

    const issues = await issuesOf(dir);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({
      code: 'invalid_component',
      severity: 'error',
      message:
        'Component doc "Acmewidget.doc.mjs" and its source "AcmeWidget.tsx" differ only in letter case. They pair on a case-insensitive disk (macOS, Windows) but not on Linux, where CI and most installs run, so there the component is missing. Fix: rename Acmewidget.doc.mjs to AcmeWidget.doc.mjs.',
    });

    // Through a temporary name, so a case-insensitive disk renames it too.
    const fixed = follow(dir, {
      move: [
        ['components/Acmewidget.doc.mjs', 'components/tmp.doc.mjs'],
        ['components/tmp.doc.mjs', 'components/AcmeWidget.doc.mjs'],
      ],
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('names a .jsx source beside a component doc and says to rename it', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './components'}),
      'components/AcmeWidget.doc.mjs': componentDoc('AcmeWidget'),
      'components/AcmeWidget.jsx': componentSource('AcmeWidget'),
    });

    const message = only(await issuesOf(dir), 'invalid_component');
    expect(message).toBe(
      'Component "AcmeWidget" is missing its same-stem source file AcmeWidget.tsx: found AcmeWidget.jsx, but a component source must be a .tsx file. Fix: rename AcmeWidget.jsx to AcmeWidget.tsx (and point its package export at the new file).',
    );

    const fixed = follow(dir, {
      move: [['components/AcmeWidget.jsx', 'components/AcmeWidget.tsx']],
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('says what an empty doc and a doc with no default export are missing', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './components'}),
      'components/Empty.doc.mjs': '',
      'components/Empty.tsx': componentSource('Empty'),
      'components/Named.doc.mjs': componentDoc('Named').replace(
        'export default',
        'export const doc =',
      ),
      'components/Named.tsx': componentSource('Named'),
    });

    const messages = (await issuesOf(dir)).map(issue => issue.message);
    const fix =
      'Fix: export the doc object as the default export: `export default {type: ..., name: ..., ...}`.';
    expect(messages).toEqual([
      `Component "Empty" has invalid metadata: ${path.join(dir, 'components', 'Empty.doc.mjs')} is empty, so it documents nothing. ${fix}`,
      `Component "Named" has invalid metadata: ${path.join(dir, 'components', 'Named.doc.mjs')} has no default export or \`docs\` export (it exports \`doc\`), so it documents nothing. ${fix}`,
    ]);
    expect(messages.join('\n')).not.toContain('Invalid input');
  });
});

describe('template and theme pairing', () => {
  it('gives a template doc with no source a fix', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({templates: './templates'}),
      'templates/account-card.doc.mjs': templateDoc('Account card'),
    });

    const message = only(await issuesOf(dir), 'invalid_template');
    expect(message).toBe(
      'Template "account-card" is missing its same-stem source file account-card.tsx. Fix: add account-card.tsx beside account-card.doc.mjs, with the template as its default export.',
    );
    const fixed = follow(dir, {
      write: {'templates/account-card.tsx': templateSource},
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  const themeDoc = `${THEME_TYPE}export default {type: 'theme', name: 'ocean', displayName: 'Ocean', description: 'A theme.', maintained: true};\n`;
  const themeSource =
    "import {defineTheme} from '@astryxdesign/core/theme';\nexport const oceanTheme = defineTheme({name: 'ocean'});\n";

  it('gives a theme descriptor with no source a fix', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({themes: './themes'}),
      'themes/ocean/oceanTheme.doc.mjs': themeDoc,
    });

    expect(only(await issuesOf(dir), 'invalid_theme')).toBe(
      'Theme "ocean" for @acme/kit must contain exactly one same-stem source for oceanTheme.doc.mjs; found 0. Fix: add oceanTheme.ts beside oceanTheme.doc.mjs, exporting `oceanTheme` from defineTheme.',
    );
  });

  it('gives a theme source with no descriptor a fix', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({themes: './themes'}),
      'themes/ocean/oceanTheme.ts': themeSource,
    });

    const message = only(await issuesOf(dir), 'invalid_theme');
    expect(message).toBe(
      'Theme "ocean" for @acme/kit must contain exactly one same-stem .doc.mjs descriptor; found 0 beside "oceanTheme.ts". Fix: add oceanTheme.doc.mjs beside it with type: \'theme\' and name: \'ocean\'; `astryx docs authoring theme-doc` lists its fields.',
    );
    const fixed = follow(dir, {
      write: {'themes/ocean/oceanTheme.doc.mjs': themeDoc},
    });
    expect(
      (await issuesOf(fixed)).filter(issue => issue.code === 'invalid_theme'),
    ).toEqual([]);
  });

  it('says a descriptor named for the built file must share its stem with the theme source', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({themes: './themes'}),
      'themes/ocean/ocean.doc.mjs': themeDoc,
      'themes/ocean/oceanTheme.ts': themeSource,
      'themes/ocean/ocean.js':
        "/**\n * @generated by `astryx theme build` — do not edit manually.\n */\nimport './ocean.css';\nexport const oceanTheme = {};\n",
      'themes/ocean/ocean.css': '.astryx-theme-ocean {}\n',
    });

    const message = only(await issuesOf(dir), 'invalid_theme');
    expect(message).toContain(
      'shares its stem with the built module "ocean.js", but the theme\'s source is "oceanTheme.ts": a descriptor must share its stem with the source that calls defineTheme. Fix: rename ocean.doc.mjs to oceanTheme.doc.mjs.',
    );
    expect(message).not.toContain('does not export');
    const fixed = follow(dir, {
      move: [['themes/ocean/ocean.doc.mjs', 'themes/ocean/oceanTheme.doc.mjs']],
    });
    expect(
      (await issuesOf(fixed)).filter(issue => issue.code === 'invalid_theme'),
    ).toEqual([]);
  });
});

describe('a theme folder with a helper', () => {
  it('reads a descriptor beside its own defineTheme source, with a <name>Theme helper beside them', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({themes: './themes'}),
      'themes/brand/brand.doc.mjs': `${THEME_TYPE}export default {type: 'theme', name: 'brand', displayName: 'Brand', description: 'A theme.', maintained: true};\n`,
      'themes/brand/brand.ts':
        "import {defineTheme} from '@astryxdesign/core/theme';\nimport {baseTheme} from './baseTheme';\nexport const brand = defineTheme({name: 'brand', extends: baseTheme});\n",
      'themes/brand/baseTheme.ts':
        "import {defineTheme} from '@astryxdesign/core/theme';\nexport const baseTheme = defineTheme({name: 'base'});\n",
    });

    expect(
      (await issuesOf(dir)).filter(issue => issue.code === 'invalid_theme'),
    ).toEqual([]);
  });
});

describe('roots', () => {
  it('warns that npm pack does not follow a symlinked root, and reads its folder through it', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({components: './components'}),
      'real-components/AcmeWidget.doc.mjs': componentDoc('AcmeWidget'),
      'real-components/AcmeWidget.tsx': componentSource('AcmeWidget'),
    });
    fs.symlinkSync('real-components', path.join(dir, 'components'));

    const issues = await issuesOf(dir);
    expect(issues.map(issue => issue.code)).toEqual(['symlinked_root']);
    expect(issues[0].message).toBe(
      'Declared components root "components" is reached through the symlink "components" (to "real-components"). Astryx follows it locally, but npm pack does not follow a symlinked folder, so the published package ships none of these files. Fix: replace the link with the folder itself (move real-components/ to components/), or set `components: \'./real-components\'` in astryx.integration.mjs.',
    );

    const fixed = follow(dir, {
      remove: ['components'],
      move: [['real-components', 'components']],
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('says an absolute root inside the package must be relative', async () => {
    const dir = writePackage({
      'docs/deploying.doc.mjs': topic('deploying'),
    });
    fs.writeFileSync(
      path.join(dir, MANIFEST),
      manifest({docs: path.join(dir, 'docs')}),
    );

    const issues = await issuesOf(dir);
    expect(issues).toEqual([
      {
        code: 'root_outside_package',
        severity: 'error',
        message: `The docs root "${path.join(dir, 'docs')}" is an absolute path, so Astryx reads nothing from it: a root is relative to the package, so it resolves the same wherever the package is installed. Fix: set \`docs: './docs'\` in astryx.integration.mjs.`,
      },
    ]);
    expect(issues[0].message).not.toContain('outside');

    const fixed = follow(dir, {
      write: {[MANIFEST]: manifest({docs: './docs'})},
    });
    expect(await issuesOf(fixed)).toEqual([]);
  });

  it('reports a root that is a file from every check, without crashing', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({
        components: './components/AcmeWidget.tsx',
        templates: './templates/account-card.tsx',
        docs: './docs/deploying.doc.mjs',
      }),
      'components/AcmeWidget.tsx': componentSource('AcmeWidget'),
      'templates/account-card.tsx': templateSource,
      'docs/deploying.doc.mjs': topic('deploying'),
    });

    const result = await integrationCheck({cwd: dir});
    expect(result.data.checks.map(check => check.check)).toEqual([
      'validate',
      'components',
      'templates',
      'docs',
    ]);
    for (const check of result.data.checks) {
      const codes = check.response.data.issues
        .filter(issue => issue.severity === 'error')
        .map(issue => issue.code);
      expect(codes).toEqual(['invalid_root', 'invalid_root', 'invalid_root']);
    }
  });
});

describe('package.json', () => {
  it('warns about a missing name and keeps checking, without crashing any check', async () => {
    const dir = writePackage(
      {
        [MANIFEST]: manifest({components: './components', docs: './docs'}),
        'components/AcmeWidget.doc.mjs': componentDoc('AcmeWidget'),
        'docs/deploying.doc.mjs': topic('deploying'),
      },
      {version: '1.0.0'},
    );

    const result = await integrationCheck({cwd: dir});
    for (const check of result.data.checks) {
      expect(
        check.response.data.issues.map(issue => [issue.code, issue.severity]),
      ).toEqual([
        ['invalid_package_json', 'warning'],
        ['invalid_component', 'error'],
      ]);
    }
    expect(result.data.checks[0].response.data.issues[0].message).toBe(
      'package.json has no "name", so npm cannot pack or publish the package, and a project that installs it has no name to select it by. Fix: add "name": "@your-scope/your-package" to package.json.',
    );
    expect(result.data.failed).toBe(true);
  });

  it('still compares documented props for a package without a name', async () => {
    const dir = writePackage(
      {
        [MANIFEST]: manifest({components: './components'}),
        'components/AcmeWidget.doc.mjs':
          "export default {type: 'component', name: 'AcmeWidget', displayName: 'AcmeWidget', usage: {description: 'A widget.'}, props: [{name: 'label', type: 'string', description: 'Text.'}]};\n",
        'components/AcmeWidget.tsx':
          'export function AcmeWidget(props: {title: string}) { return null; }\n',
      },
      {version: '1.0.0'},
    );

    const result = await integrationCheck({cwd: dir, strict: true});
    const components = result.data.checks.find(
      check => check.check === 'components',
    );
    const propDrift = /** @type {any} */ (components?.response.data)?.propDrift;
    expect(propDrift).toBeDefined();
    const failures = result.data.failures.map(failure => failure.code);
    expect(failures).toContain('invalid_package_json');
    if (propDrift.status === 'skipped') {
      // No TypeScript here: --strict names the skipped comparison.
      expect(failures).toContain('prop_drift_skipped');
    } else {
      expect(propDrift.findings.map((/** @type {any} */ f) => f.kind)).toEqual(
        expect.arrayContaining(['not_in_code', 'not_in_doc']),
      );
    }
  });

  it('completes --strict for a package without a name whose component docs hold links, reporting none', async () => {
    const dir = writePackage(
      {
        [MANIFEST]: manifest({components: './components'}),
        'components/AcmeWidget.doc.mjs':
          "export default {type: 'component', name: 'AcmeWidget', displayName: 'AcmeWidget', usage: {description: 'Read {@link generic:x} first.'}, props: []};\n",
        'components/AcmeWidget.tsx': componentSource('AcmeWidget'),
      },
      {version: '1.0.0'},
    );

    const result = await integrationCheck({cwd: dir, strict: true});
    const components = result.data.checks.find(
      check => check.check === 'components',
    );
    expect(components?.response.data.issues.map(issue => issue.code)).toEqual([
      'invalid_package_json',
    ]);
    expect(
      result.data.failures.filter(
        failure => failure.code === 'invalid_doc_graph',
      ),
    ).toEqual([]);
  });

  it('checks the docs of a package without a name, naming them by path', async () => {
    const dir = writePackage(
      {
        [MANIFEST]: manifest({docs: './docs'}),
        'docs/deploying.doc.mjs': topic('deploying').replace(
          '"text":"deploying"',
          '"text":"See {@link generic:no-such-topic}."',
        ),
      },
      {version: '1.0.0'},
    );

    const result = await integrationCheck({cwd: dir});
    const docs = result.data.checks.find(check => check.check === 'docs');
    const messages =
      docs?.response.data.issues.map(issue => issue.message) ?? [];
    expect(messages.join('\n')).not.toContain('astryx-unnamed-local-package');
    expect(docs?.response.data.issues.map(issue => issue.code)).toEqual([
      'invalid_package_json',
      'invalid_doc_graph',
    ]);
    expect(messages[1]).toMatch(
      /^deploying § overview: "generic:no-such-topic" names no doc\./u,
    );
  });

  it.each([
    ['acme kit'],
    ['_acme'],
    ['acme/kit'],
    ['-acme'],
    ['@acme/-kit'],
    ['~acme'],
  ])(
    'warns that no provider ID can be derived from the name %s, and keeps checking',
    async name => {
      const dir = writePackage(
        {
          [MANIFEST]: manifest({components: './components'}),
          'components/AcmeWidget.doc.mjs': componentDoc('AcmeWidget'),
        },
        {name, version: '1.0.0'},
      );

      const issues = await issuesOf(dir);
      expect(issues.map(issue => [issue.code, issue.severity])).toEqual([
        ['no_provider_id', 'warning'],
        ['invalid_component', 'error'],
      ]);
      expect(issues[0].message).toBe(
        `No provider ID can be derived for this package: package.json "name" ${JSON.stringify(name)} is not a bare package name (an optional @scope/ and a name, each starting with a lowercase letter or digit and holding only lowercase letters, digits, "-", ".", "_" and "~"), and astryx.integration.mjs declares no providerId that is one. Astryx files the package's components, templates and docs under that ID, so links to them and selecting the package cannot work. Fix: rename the package, such as "@your-scope/your-package", or set \`providerId: '@your-scope/your-package'\` in astryx.integration.mjs.`,
      );
      expect(issues[0].message).not.toContain('npm cannot pack');
      const result = await integrationCheck({cwd: dir});
      expect(result.data.checks.every(check => check.response.type)).toBe(true);
    },
  );

  it('derives the provider ID from the manifest when the name cannot give one', async () => {
    const dir = writePackage(
      {
        [MANIFEST]: manifest({
          providerId: '@acme/kit',
          components: './components',
        }),
        'components/AcmeWidget.doc.mjs': componentDoc('AcmeWidget'),
        'components/AcmeWidget.tsx': componentSource('AcmeWidget'),
      },
      {name: '@acme/_kit', version: '1.0.0'},
    );

    expect(await issuesOf(dir)).toEqual([]);
    expect((await integrationCheck({cwd: dir, strict: true})).data.failed).toBe(
      false,
    );
  });

  it('checks a package without a name whose root is a file, without crashing', async () => {
    const dir = writePackage(
      {
        [MANIFEST]: manifest({
          templates: './templates/account-card.tsx',
          docs: './docs/deploying.doc.mjs',
        }),
        'templates/account-card.tsx': templateSource,
        'docs/deploying.doc.mjs': topic('deploying'),
      },
      {version: '1.0.0'},
    );

    const result = await integrationCheck({cwd: dir});
    for (const check of result.data.checks) {
      expect(
        check.response.data.issues
          .filter(issue => issue.severity === 'error')
          .map(issue => issue.code),
      ).toEqual(['invalid_root', 'invalid_root']);
    }
  });

  it('checks links under the manifest providerId when the name gives none', async () => {
    const linked = (/** @type {string} */ name, /** @type {string} */ text) =>
      `export default ${JSON.stringify({
        type: 'generic',
        name,
        title: name,
        description: `The ${name} topic.`,
        sections: [{title: 'Overview', content: [{type: 'prose', text}]}],
      })};\n`;
    const dir = writePackage(
      {
        [MANIFEST]: manifest({
          providerId: '@acme/kit',
          components: './components',
          docs: './docs',
        }),
        'components/AcmeWidget.doc.mjs':
          "export default {type: 'component', name: 'AcmeWidget', displayName: 'AcmeWidget', usage: {description: 'Read {@link generic:no-such-topic}.'}, props: []};\n",
        'components/AcmeWidget.tsx': componentSource('AcmeWidget'),
        'docs/deploying.doc.mjs': linked(
          'deploying',
          'See {@link @acme/kit:generic:other}.',
        ),
        'docs/other.doc.mjs': linked('other', 'The other topic.'),
      },
      {name: '@acme/_kit', version: '1.0.0'},
    );

    const result = await integrationCheck({cwd: dir});
    const issuesOf = (/** @type {string} */ name) =>
      result.data.checks.find(check => check.check === name)?.response.data
        .issues ?? [];
    const componentLinks = issuesOf('components').filter(
      issue => issue.code === 'invalid_doc_graph',
    );
    expect(componentLinks).toHaveLength(1);
    expect(componentLinks[0].message).toContain('no-such-topic');
    expect(
      issuesOf('docs').filter(issue => issue.code === 'invalid_doc_graph'),
    ).toEqual([]);
  });

  it('fails only --strict on a missing name when nothing else is wrong', async () => {
    const dir = writePackage(
      {
        [MANIFEST]: manifest({docs: './docs'}),
        'docs/deploying.doc.mjs': topic('deploying'),
      },
      {version: '1.0.0'},
    );

    expect((await integrationCheck({cwd: dir})).data.failed).toBe(false);
    expect((await integrationCheck({cwd: dir, strict: true})).data.failed).toBe(
      true,
    );
  });

  it('warns about a missing version and still checks the rest', async () => {
    const dir = writePackage(
      {
        [MANIFEST]: manifest({components: './components'}),
        'components/AcmeWidget.doc.mjs': componentDoc('AcmeWidget'),
      },
      {name: '@acme/kit'},
    );

    const issues = await issuesOf(dir);
    expect(issues.map(issue => [issue.code, issue.severity])).toEqual([
      ['invalid_package_json', 'warning'],
      ['invalid_component', 'error'],
    ]);
    expect(issues[0].message).toBe(
      'package.json has no "version", so npm cannot pack or publish the package. Fix: add "version": "0.1.0" to package.json.',
    );
  });

  it('asks no version of a private package', async () => {
    const dir = writePackage(
      {[MANIFEST]: manifest({docs: './docs'}), 'docs/a.doc.mjs': topic('a')},
      {name: '@acme/kit', private: true},
    );

    expect(await issuesOf(dir)).toEqual([]);
  });
});

describe('the manifest', () => {
  it('asks about a key one letter from a known one before blaming the CLI version', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({component: './components'}),
    });

    const message = only(await issuesOf(dir), 'unknown_manifest_key');
    expect(message).toBe(
      'This CLI does not know the manifest key "component", so it is ignored. Did you mean `components`? Fix: rename "component" to "components" in astryx.integration.mjs. If it is a key from a newer Astryx CLI instead, upgrading @astryxdesign/cli picks it up.',
    );
  });

  it('keeps the newer-CLI explanation for a key that is no near miss', async () => {
    const dir = writePackage({[MANIFEST]: manifest({playgrounds: './x'})});

    expect(only(await issuesOf(dir), 'unknown_manifest_key')).toContain(
      'published against a newer Astryx CLI',
    );
  });

  it('says a manifest has no default export, and what it exports', async () => {
    const dir = writePackage({
      [MANIFEST]: "export const integration = {docs: './docs'};\n",
    });

    expect(only(await issuesOf(dir), 'invalid_manifest')).toBe(
      "Integration manifest (astryx.integration.mjs) has no default export (it exports `integration`). Fix: export the manifest object as the default export: `export default {components: './components'}`, naming the roots the package has.",
    );
  });

  it('says a manifest is empty', async () => {
    const dir = writePackage({[MANIFEST]: ''});

    expect(only(await issuesOf(dir), 'invalid_manifest')).toMatch(
      /^Integration manifest \(astryx\.integration\.mjs\) is empty\. Fix: /u,
    );
  });
});

describe('unreadable files and theme names', () => {
  const asRoot = process.getuid?.() === 0;

  it.skipIf(asRoot)(
    'reports a contribution file it cannot read, which npm pack would fail on',
    async () => {
      const dir = writePackage({
        [MANIFEST]: manifest({components: './components'}),
        'components/AcmeWidget.doc.mjs': componentDoc('AcmeWidget'),
        'components/AcmeWidget.tsx': componentSource('AcmeWidget'),
      });
      const file = path.join(dir, 'components', 'AcmeWidget.tsx');
      fs.chmodSync(file, 0);
      try {
        const issues = await issuesOf(dir);
        const message = only(issues, 'unreadable_file');
        expect(issues.find(i => i.code === 'unreadable_file')?.severity).toBe(
          'warning',
        );
        expect(message).toBe(
          'Could not read "components/AcmeWidget.tsx" (EACCES), so Astryx cannot check it and npm pack fails on it. Fix: make it readable (chmod a+r components/AcmeWidget.tsx), or delete it if it does not belong in the package.',
        );
      } finally {
        fs.chmodSync(file, 0o644);
      }
      expect(await issuesOf(dir)).toEqual([]);
    },
  );

  it.skipIf(asRoot)(
    'ignores an unreadable file no reader and no pack reads, such as .DS_Store',
    async () => {
      const dir = writePackage({
        [MANIFEST]: manifest({components: './components'}),
        'components/AcmeWidget.doc.mjs': componentDoc('AcmeWidget'),
        'components/AcmeWidget.tsx': componentSource('AcmeWidget'),
        'components/.DS_Store': 'x',
        'components/notes.txt': 'x',
      });
      const files = ['.DS_Store', 'notes.txt'].map(name =>
        path.join(dir, 'components', name),
      );
      for (const file of files) fs.chmodSync(file, 0);
      try {
        expect(await issuesOf(dir)).toEqual([]);
      } finally {
        for (const file of files) fs.chmodSync(file, 0o644);
      }
    },
  );

  const themeDoc = `${THEME_TYPE}export default {type: 'theme', name: 'ocean', displayName: 'Ocean', description: 'A theme.', maintained: true};\n`;
  /** @param {string} name */
  const themeSource = name =>
    `import {defineTheme} from '@astryxdesign/core/theme';\nexport const oceanTheme = defineTheme({\n  name: '${name}',\n});\n`;

  it('accepts a theme that names itself differently from its folder', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({themes: './themes'}),
      'themes/ocean/oceanTheme.doc.mjs': themeDoc,
      'themes/ocean/oceanTheme.ts': themeSource('deep-sea'),
    });

    expect(
      (await issuesOf(dir)).filter(issue => issue.code === 'invalid_theme'),
    ).toEqual([]);
  });

  it('leaves a theme name it can only know by building alone', async () => {
    const dir = writePackage({
      [MANIFEST]: manifest({themes: './themes'}),
      'themes/ocean/oceanTheme.doc.mjs': themeDoc,
      'themes/ocean/oceanTheme.ts':
        "import {defineTheme} from '@astryxdesign/core/theme';\nconst name = 'sea';\nexport const oceanTheme = defineTheme({name});\n",
    });

    expect(
      (await issuesOf(dir)).filter(issue => issue.code === 'invalid_theme'),
    ).toEqual([]);
  });
});
