// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Source-level public-import and peer-range checks run by
 * `astryx doctor integration validate` (and so `integration check --strict`).
 *
 * Each test stands up a small integration package under the repo root (so the
 * repo's own Core is the installed Core) and validates it.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {validateLocalIntegration} from '../../api/integration/validate-integration.mjs';
import {readImports} from './public-imports.mjs';
import {validRange} from './peer-ranges.mjs';
import {validateIntegration} from '../../api/integration/validate-integration.mjs';
import {subpathDeclaration} from './exports-subpaths.mjs';
import {
  integrationAddComponent,
  integrationAddTemplate,
} from '../../api/integration/add-contribution.mjs';
import {CLI_ROOT} from '../fs/paths.mjs';
import {integrationCheck} from '../../api/integration/check/check.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

const CODES = new Set([
  'component_import_not_exported',
  'component_import_other_package',
  'example_import_not_exported',
  'example_import_missing_name',
  'template_import_not_exported',
  'template_import_outside_root',
  'template_private_import',
  'template_import_missing_name',
  'template_no_default_export',
  'unknown_block_component',
  'invalid_peer_range',
  'core_not_peer',
  'cli_peer_excludes_cli',
  'core_peer_excludes_core',
]);

const CLI_VERSION = JSON.parse(
  fs.readFileSync(path.join(CLI_ROOT, 'package.json'), 'utf-8'),
).version;

let dir;

/** @param {string} file @param {string} text */
function write(file, text) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true});
  fs.writeFileSync(path.join(dir, file), text);
}

/** @param {(pkg: any) => void} edit */
function pkg(edit) {
  const file = path.join(dir, 'package.json');
  const value = JSON.parse(fs.readFileSync(file, 'utf-8'));
  edit(value);
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

const DOC = (
  importPath = '@acme/widgets/components/AcmeWidget',
  example = 'import {AcmeWidget} from \'@acme/widgets/components/AcmeWidget\';\\n\\n<AcmeWidget label=\\"Save\\" />',
) =>
  `export default {
  type: 'component',
  name: 'AcmeWidget',
  displayName: 'Acme Widget',
  import: '${importPath}',
  usage: {description: 'A pressable widget.'},
  props: [{name: 'label', type: 'string', description: 'Text.', required: true}],
  examples: [{label: 'Basic', code: "${example}"}],
};
`;

const BLOCK = (extra = '') =>
  `export default {
  type: 'block',
  name: 'account-card',
  displayName: 'Account Card',
  description: 'Account Card template.',
  aspectRatio: 1,${extra}
};
`;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-public-imports-'));
  write(
    'package.json',
    JSON.stringify({
      name: '@acme/widgets',
      version: '1.0.0',
      type: 'module',
      peerDependencies: {
        '@astryxdesign/core': '>=0.1.0',
        '@astryxdesign/cli': '>=0.1.0',
      },
      exports: {
        './components/AcmeWidget': './components/AcmeWidget.tsx',
        './templates/account-card': './templates/account-card.tsx',
      },
    }),
  );
  write(
    'astryx.integration.mjs',
    "export default {components: './components', templates: './templates'};\n",
  );
  write('components/AcmeWidget.doc.mjs', DOC());
  write(
    'components/AcmeWidget.tsx',
    'export type AcmeWidgetProps = {label: string};\nexport function AcmeWidget({label}: AcmeWidgetProps) {\n  return <button>{label}</button>;\n}\n',
  );
  write('templates/account-card.doc.mjs', BLOCK());
  write(
    'templates/account-card.tsx',
    'import {AcmeWidget} from \'@acme/widgets/components/AcmeWidget\';\nexport default function AccountCard() {\n  return <AcmeWidget label="Account" />;\n}\n',
  );
});

afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

async function found() {
  const result = await validateLocalIntegration(dir);
  return result.issues.filter(issue => CODES.has(issue.code));
}

async function codes() {
  return (await found()).map(issue => issue.code).sort();
}

describe('public imports: clean packages', () => {
  it('passes the known-good package', async () => {
    const result = await validateLocalIntegration(dir);
    expect(result.issues).toEqual([]);
  });

  it('passes a condition object with import (types first) or default', async () => {
    pkg(p => {
      p.exports['./components/AcmeWidget'] = {
        types: './components/AcmeWidget.tsx',
        import: './components/AcmeWidget.tsx',
      };
    });
    expect(await codes()).toEqual([]);
    pkg(p => {
      p.exports['./components/AcmeWidget'] = {
        default: './components/AcmeWidget.tsx',
        import: './missing.js',
      };
    });
    expect(await codes()).toEqual([]);
  });

  it('passes a wildcard that covers the component', async () => {
    pkg(p => {
      delete p.exports['./components/AcmeWidget'];
      p.exports['./components/*'] = './components/*.tsx';
    });
    expect(await codes()).toEqual([]);
  });

  it('keeps legacy deep paths when package.json has no exports', async () => {
    pkg(p => delete p.exports);
    expect(await codes()).toEqual([]);
  });

  it('flags a deep path with no file when package.json has no exports', async () => {
    pkg(p => delete p.exports);
    write(
      'components/AcmeWidget.doc.mjs',
      DOC('@acme/widgets/components/Missing'),
    );
    const issue = (await found()).find(
      i => i.code === 'component_import_not_exported',
    );
    expect(issue?.message).toContain(
      'no file exists at "./components/Missing"',
    );
  });

  it('never requires an exports target to exist (build output)', async () => {
    pkg(p => {
      p.exports['./components/AcmeWidget'] = {
        types: './dist/AcmeWidget.d.ts',
        import: './dist/AcmeWidget.js',
      };
    });
    expect(await codes()).toEqual([]);
  });
});

describe('public imports: component doc import', () => {
  it('flags a missing exports key with the entry to add', async () => {
    pkg(p => delete p.exports['./components/AcmeWidget']);
    const issues = await found();
    const issue = issues.find(i => i.code === 'component_import_not_exported');
    expect(issue?.severity).toBe('warning');
    expect(issue?.message).toContain(
      '"./components/AcmeWidget": "./components/AcmeWidget.tsx"',
    );
  });

  it('adds only warnings: validate keeps its exit, only --strict fails', async () => {
    pkg(p => {
      delete p.exports['./components/AcmeWidget'];
    });
    write(
      'templates/account-card.tsx',
      "import {X} from '../components/AcmeWidget';\nexport function A() {\n  return <X />;\n}\n",
    );
    const issues = await found();
    expect(issues.length).toBeGreaterThan(2);
    expect(issues.every(i => i.severity === 'warning')).toBe(true);
    const plain = await integrationCheck({cwd: dir});
    expect(plain.data.errors).toBe(0);
    expect(plain.data.failed).toBe(false);
    const strict = await integrationCheck({cwd: dir, strict: true});
    expect(strict.data.failed).toBe(true);
  });

  it('flags a require-only condition', async () => {
    pkg(p => {
      p.exports['./components/AcmeWidget'] = {
        require: './components/AcmeWidget.tsx',
      };
    });
    const issue = (await found()).find(
      i => i.code === 'component_import_not_exported',
    );
    expect(issue?.message).toContain('only the "require" condition');
  });

  it('names the conditions a types-only entry has', async () => {
    pkg(p => {
      p.exports['./components/AcmeWidget'] = {types: './a.d.ts'};
    });
    const issue = (await found()).find(
      i => i.code === 'component_import_not_exported',
    );
    expect(issue?.message).toContain('only the "types" condition');
    expect(issue?.message).not.toContain('require');
  });

  it('flags a bare-string exports field', async () => {
    pkg(p => {
      p.exports = './components/AcmeWidget.tsx';
    });
    const all = await codes();
    expect(all).toContain('component_import_not_exported');
    expect(all).toContain('template_import_not_exported');
  });

  it('flags a wildcard that does not match', async () => {
    pkg(p => {
      delete p.exports['./components/AcmeWidget'];
      p.exports['./widgets/*'] = './components/*.tsx';
    });
    expect(await codes()).toContain('component_import_not_exported');
  });

  it('points an undeclared import at the subpath already exported', async () => {
    write('components/AcmeWidget.doc.mjs', DOC('@acme/widgets/AcmeWidget'));
    const issue = (await found()).find(
      i => i.code === 'component_import_not_exported',
    );
    expect(issue?.message).toContain(
      "set import: '@acme/widgets/components/AcmeWidget' (already exported)",
    );
  });

  it('flags an import that names another package', async () => {
    write(
      'components/AcmeWidget.doc.mjs',
      DOC('@acme/other/components/AcmeWidget'),
    );
    const issue = (await found()).find(
      i => i.code === 'component_import_other_package',
    );
    expect(issue?.message).toContain(
      "set import: '@acme/widgets/components/AcmeWidget'",
    );
  });
});

describe('public imports: component examples', () => {
  it('flags a name the package does not export', async () => {
    write(
      'components/AcmeWidget.doc.mjs',
      DOC(
        undefined,
        "import {AcmeGadget} from '@acme/widgets/components/AcmeWidget';\\n<AcmeGadget />",
      ),
    );
    expect(await codes()).toEqual(['example_import_missing_name']);
  });

  it('flags a subpath exports does not declare', async () => {
    write(
      'components/AcmeWidget.doc.mjs',
      DOC(
        undefined,
        "import {AcmeWidget} from '@acme/widgets/src/AcmeWidget';\\n<AcmeWidget />",
      ),
    );
    expect(await codes()).toEqual(['example_import_not_exported']);
  });

  it('leaves a CommonJS target unjudged for names', async () => {
    write(
      'components/AcmeWidget.doc.mjs',
      DOC(
        undefined,
        "import {AcmeGadget} from '@acme/widgets/components/AcmeWidget';\\n<AcmeGadget />",
      ),
    );
    write(
      'components/AcmeWidget.tsx',
      'module.exports = {AcmeWidget: () => null, AcmeGadget: () => null};\n',
    );
    expect(await codes()).toEqual([]);
    pkg(p => {
      p.exports['./components/AcmeWidget'] = './components/AcmeWidget.cjs';
    });
    write('components/AcmeWidget.cjs', 'export const Other = 1;\n');
    expect(await codes()).toEqual([]);
  });

  it('accepts aliased, type-only and other-package imports', async () => {
    write(
      'components/AcmeWidget.doc.mjs',
      DOC(
        undefined,
        "import {AcmeWidget as W, type AcmeWidgetProps} from '@acme/widgets/components/AcmeWidget';\\nimport {Button} from '@astryxdesign/core/Button';\\nimport x from 'left-pad';\\n<W label=\\\"a\\\" />",
      ),
    );
    expect(await codes()).toEqual([]);
  });

  it('reads named, default, aliased, namespace and type-only imports', () => {
    const statements = readImports(
      "import D, {A as B, type T} from 'p/a';\nimport type {U} from 'p/b';\nimport * as N from 'p/c';\n...\n<D />",
    );
    expect(statements.map(s => s.source)).toEqual(['p/a', 'p/b', 'p/c']);
    expect(statements[0].names).toEqual([
      {imported: 'default', typeOnly: false},
      {imported: 'A', typeOnly: false},
      {imported: 'T', typeOnly: true},
    ]);
    expect(statements[1].names).toEqual([{imported: 'U', typeOnly: true}]);
    expect(statements[2].namespace).toBe(true);
  });
});

describe('public imports: template sources', () => {
  it('flags a relative import that leaves the templates root', async () => {
    write(
      'templates/account-card.tsx',
      'import {AcmeWidget} from \'../components/AcmeWidget\';\nexport default function A() {\n  return <AcmeWidget label="x" />;\n}\n',
    );
    expect(await codes()).toEqual(['template_import_outside_root']);
  });

  it('flags a Core path Core does not export, and accepts a public one', async () => {
    write(
      'templates/account-card.tsx',
      'import {Button} from \'@astryxdesign/core/src/Button/Button\';\nexport default function A() {\n  return <Button label="x" />;\n}\n',
    );
    const issue = (await found()).find(
      i => i.code === 'template_private_import',
    );
    expect(issue?.message).toContain("'@astryxdesign/core/Button'");
    write(
      'templates/account-card.tsx',
      'import {Button} from \'@astryxdesign/core/Button\';\nexport default function A() {\n  return <Button label="x" />;\n}\n',
    );
    expect(await codes()).toEqual([]);
  });

  it('flags a name its own package does not export', async () => {
    write(
      'templates/account-card.tsx',
      'import {AcmeGadget} from \'@acme/widgets/components/AcmeWidget\';\nexport default function A() {\n  return <AcmeGadget label="x" />;\n}\n',
    );
    expect(await codes()).toEqual(['template_import_missing_name']);
  });

  it('leaves a built CommonJS dist file reached through exports unjudged for names', async () => {
    pkg(p => {
      p.exports['./components/AcmeWidget'] = {
        types: './dist/AcmeWidget.d.ts',
        default: './dist/AcmeWidget.js',
      };
    });
    write(
      'dist/AcmeWidget.js',
      "'use strict';\nObject.defineProperty(exports, '__esModule', {value: true});\nexports.AcmeWidget = void 0;\nconst AcmeWidget = () => null;\nexports.AcmeWidget = AcmeWidget;\n",
    );
    write(
      'templates/account-card.tsx',
      'import {AcmeGadget} from \'@acme/widgets/components/AcmeWidget\';\nexport default function A() {\n  return <AcmeGadget label="x" />;\n}\n',
    );
    write(
      'components/AcmeWidget.doc.mjs',
      DOC(
        undefined,
        "import {AcmeGadget} from '@acme/widgets/components/AcmeWidget';\\n<AcmeGadget />",
      ),
    );
    expect(await codes()).toEqual([]);
  });

  it('leaves a module that also assigns exports.* unjudged for names', async () => {
    write(
      'components/AcmeWidget.tsx',
      'export function AcmeWidget() {\n  return null;\n}\nexports.AcmeGadget = AcmeWidget;\n',
    );
    write(
      'templates/account-card.tsx',
      'import {AcmeGadget} from \'@acme/widgets/components/AcmeWidget\';\nexport default function A() {\n  return <AcmeGadget label="x" />;\n}\n',
    );
    expect(await codes()).toEqual([]);
  });

  it('leaves a CommonJS target of a template import unjudged for names', async () => {
    write('components/AcmeWidget.tsx', 'exports.AcmeWidget = () => null;\n');
    write(
      'templates/account-card.tsx',
      'import {AcmeGadget} from \'@acme/widgets/components/AcmeWidget\';\nexport default function A() {\n  return <AcmeGadget label="x" />;\n}\n',
    );
    expect(await codes()).toEqual([]);
  });

  it('flags a template whose public import exports does not declare', async () => {
    pkg(p => delete p.exports['./templates/account-card']);
    const issue = (await found()).find(
      i => i.code === 'template_import_not_exported',
    );
    expect(issue?.message).toContain(
      '"./templates/account-card": "./templates/account-card.tsx"',
    );
  });
});

describe('template default export', () => {
  it('warns on a template source with no default export, naming the export to add', async () => {
    write(
      'templates/account-card.tsx',
      'export function AccountCard() {\n  return <div>Account</div>;\n}\n',
    );
    const issues = await found();
    expect(issues.map(i => [i.code, i.severity])).toEqual([
      ['template_no_default_export', 'warning'],
    ]);
    expect(issues[0].message).toContain('export default AccountCard;');
  });

  it('accepts a re-exported or type-annotated default', async () => {
    write(
      'templates/account-card.tsx',
      'function AccountCard() {\n  return <div>Account</div>;\n}\nexport {AccountCard as default};\n',
    );
    expect(await codes()).toEqual([]);
  });
});

describe('public imports: block component names', () => {
  it('flags exampleFor and componentsUsed naming no component', async () => {
    write(
      'templates/account-card.doc.mjs',
      BLOCK("\n  exampleFor: 'AcmeGizmo',\n  componentsUsed: ['AcmeGizmo'],"),
    );
    const issues = await found();
    expect(issues.map(i => i.code)).toEqual([
      'unknown_block_component',
      'unknown_block_component',
    ]);
  });

  it('accepts package, Core and imported names', async () => {
    write(
      'templates/account-card.doc.mjs',
      BLOCK(
        "\n  exampleFor: 'AcmeWidget',\n  componentsUsed: ['AcmeWidget', 'Button', 'Helper'],",
      ),
    );
    write(
      'templates/account-card.tsx',
      "import {AcmeWidget} from '@acme/widgets/components/AcmeWidget';\nimport {Helper} from 'some-lib';\nexport default function A() {\n  return <Helper><AcmeWidget label=\"x\" /></Helper>;\n}\n",
    );
    expect(await codes()).toEqual([]);
  });
});

describe('public imports: peer ranges', () => {
  it('lists a CLI peer range that excludes the running CLI in peerRanges, never counted', async () => {
    pkg(p => {
      p.peerDependencies['@astryxdesign/cli'] = '>=99.0.0';
    });
    const validated = await validateIntegration(undefined, {cwd: dir});
    expect(validated.data.issues).toEqual([]);
    expect(validated.data.peerRanges?.status).toBe('checked');
    const [finding] = validated.data.peerRanges?.findings ?? [];
    expect(finding).toMatchObject({
      code: 'cli_peer_excludes_cli',
      severity: 'info',
    });
    expect(finding.fix).toContain(`">=${CLI_VERSION}"`);
    const check = await integrationCheck({cwd: dir, strict: true});
    expect(check.data.failed).toBe(false);
    expect(check.data.warnings).toBe(0);
    expect(check.data.skipped).toEqual([]);
    expect(check.data.failures).toEqual([]);
    expect(check.data.checks[0].response.data.peerRanges).toEqual(
      validated.data.peerRanges,
    );
  });

  it('lists a Core peer range that excludes the installed Core in peerRanges, never counted', async () => {
    pkg(p => {
      p.peerDependencies['@astryxdesign/core'] = '^0.0.1';
    });
    const validated = await validateIntegration(undefined, {cwd: dir});
    expect(validated.data.issues).toEqual([]);
    expect(
      validated.data.peerRanges?.findings.map(f => [f.code, f.severity]),
    ).toEqual([['core_peer_excludes_core', 'info']]);
    const check = await integrationCheck({cwd: dir, strict: true});
    expect(check.data.failed).toBe(false);
    expect(check.data.errors).toBe(0);
    expect(check.data.warnings).toBe(0);
  });

  it("leaves the rest of validate's JSON as it was", async () => {
    const validated = await validateIntegration(undefined, {cwd: dir});
    expect(Object.keys(validated.data).sort()).toEqual([
      'docTypes',
      'issues',
      'name',
      'peerRanges',
      'validated',
      'version',
    ]);
    expect(validated.data.peerRanges).toEqual({
      status: 'checked',
      findings: [],
    });
  });

  it('lists an invalid range in peerRanges, never counted, and leaves protocol specs alone', async () => {
    pkg(p => {
      p.peerDependencies['@astryxdesign/core'] = 'latest-ish';
    });
    const validated = await validateIntegration(undefined, {cwd: dir});
    expect(validated.data.issues).toEqual([]);
    expect(
      validated.data.peerRanges?.findings.map(f => [f.code, f.severity]),
    ).toEqual([['invalid_peer_range', 'info']]);
    const check = await integrationCheck({cwd: dir, strict: true});
    expect(check.data.failed).toBe(false);
    expect(check.data.warnings).toBe(0);
    pkg(p => {
      p.peerDependencies['@astryxdesign/core'] = 'workspace:*';
    });
    expect(
      (await validateIntegration(undefined, {cwd: dir})).data.peerRanges,
    ).toEqual({status: 'checked', findings: []});
  });

  it('lists Core as a dependency in peerRanges, never counted', async () => {
    pkg(p => {
      delete p.peerDependencies['@astryxdesign/core'];
      p.dependencies = {'@astryxdesign/core': '^0.7.0'};
    });
    const validated = await validateIntegration(undefined, {cwd: dir});
    expect(validated.data.issues).toEqual([]);
    const [finding] = validated.data.peerRanges?.findings ?? [];
    expect(finding).toMatchObject({code: 'core_not_peer', severity: 'info'});
    expect(finding.fix).toContain(
      '"peerDependencies": {"@astryxdesign/core": "^0.7.0"}',
    );
    const check = await integrationCheck({cwd: dir, strict: true});
    expect(check.data.failed).toBe(false);
    expect(check.data.warnings).toBe(0);
  });

  it('reads the range grammar', () => {
    for (const range of [
      '',
      '*',
      '^0.7.0',
      '>=0.6.3 <0.7.0',
      '0.7.1',
      '1.x || >=2',
      '>= 1.2',
      '1.0.0 - 2.0.0',
      '~0.7',
    ]) {
      expect(validRange(range), range).toBe(true);
    }
    for (const range of ['latest-ish', 'latest', '>=a', '^']) {
      expect(validRange(range), range).toBe(false);
    }
    expect(validRange('npm:@x/y@1')).toBe(null);
  });
});

describe('subpathDeclaration', () => {
  it('reads each way exports can declare a subpath', () => {
    expect(subpathDeclaration(undefined, './a').state).toBe('no_exports');
    expect(subpathDeclaration('./i.js', './a').state).toBe('root_only');
    expect(subpathDeclaration({import: './i.js'}, './a').state).toBe(
      'root_only',
    );
    expect(subpathDeclaration({'./a': null}, './a').state).toBe('blocked');
    expect(subpathDeclaration({'./a': {require: './a.cjs'}}, './a').state).toBe(
      'not_importable',
    );
    expect(subpathDeclaration({'./*': './src/*.ts'}, './a').state).toBe(
      'declared',
    );
    expect(
      subpathDeclaration(
        {'./*': './src/*.ts', './private/*': null},
        './private/a',
      ).state,
    ).toBe('blocked');
  });
});

describe('integration add declares its public subpath', () => {
  beforeEach(() => {
    fs.rmSync(dir, {recursive: true, force: true});
    fs.mkdirSync(dir);
    write(
      'package.json',
      JSON.stringify({name: '@acme/fresh', version: '1.0.0', type: 'module'}),
    );
  });

  it('never creates exports; a fresh scaffold still passes', async () => {
    const before = fs.readFileSync(path.join(dir, 'package.json'), 'utf-8');
    await integrationAddComponent('AcmeThing', {cwd: dir});
    await integrationAddTemplate('acme-page', {cwd: dir});
    expect(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')).toBe(
      before,
    );
    expect(await codes()).toEqual([]);
  });

  it('adds the entry when the package already has an exports map', async () => {
    pkg(p => {
      p.exports = {'.': './index.js'};
    });
    await integrationAddComponent('AcmeThing', {cwd: dir});
    await integrationAddTemplate('acme-page', {cwd: dir});
    const p = JSON.parse(
      fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'),
    );
    expect(p.exports).toEqual({
      '.': './index.js',
      './components/AcmeThing': './components/AcmeThing.tsx',
      './templates/acme-page': './templates/acme-page.tsx',
    });
    expect(await codes()).toEqual([]);
  });

  it('adds nothing a wildcard already covers', async () => {
    pkg(p => {
      p.exports = {'./components/*': './components/*.tsx'};
    });
    await integrationAddComponent('AcmeThing', {cwd: dir});
    const p = JSON.parse(
      fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'),
    );
    expect(p.exports).toEqual({'./components/*': './components/*.tsx'});
  });
});

describe('integration add only inserts the missing exports entry', () => {
  const ORIGINAL =
    '{\n' +
    '    "version": "1.0.0",\n' +
    '    "name": "@acme/kept",\n' +
    '    "exports": {\n' +
    '        "./zeta": "./zeta.js",\n' +
    '        ".": {"types": "./index.d.ts",   "import": "./index.js"},\n' +
    '        "./alpha": [ "./alpha.js" ]\n' +
    '    },\n' +
    '    "type": "module"\n' +
    '}\n';

  beforeEach(() => {
    fs.rmSync(dir, {recursive: true, force: true});
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'package.json'), ORIGINAL);
  });

  it('keeps every existing byte of package.json for component and template add', async () => {
    await integrationAddComponent('AcmeThing', {cwd: dir});
    await integrationAddTemplate('acme-page', {cwd: dir});
    const after = fs.readFileSync(path.join(dir, 'package.json'), 'utf-8');
    expect(after).toBe(
      ORIGINAL.replace(
        '        "./alpha": [ "./alpha.js" ]\n',
        '        "./alpha": [ "./alpha.js" ],\n' +
          '        "./components/AcmeThing": "./components/AcmeThing.tsx",\n' +
          '        "./templates/acme-page": "./templates/acme-page.tsx"\n',
      ),
    );
  });

  it('keeps a one-line exports map on one line', async () => {
    const oneLine =
      '{"name": "@acme/kept", "exports": {".": "./i.js"}, "type": "module"}';
    fs.writeFileSync(path.join(dir, 'package.json'), oneLine);
    await integrationAddComponent('AcmeThing', {cwd: dir});
    expect(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')).toBe(
      '{"name": "@acme/kept", "exports": {".": "./i.js", "./components/AcmeThing": "./components/AcmeThing.tsx"}, "type": "module"}',
    );
  });

  it('keeps the JSON output shape of the add commands', async () => {
    for (const args of [
      ['integration', 'add', 'component', 'AcmeThing', '--json'],
      ['integration', 'add', 'template', 'acme-page', '--json'],
    ]) {
      const result = await runCli(args, dir);
      expect(result.status).toBe(0);
      const envelope = JSON.parse(result.stdout);
      expect(Object.keys(envelope).sort()).toEqual([
        'apiVersion',
        'data',
        'type',
      ]);
      expect(Object.keys(envelope.data).sort()).toEqual([
        'dryRun',
        'files',
        'kind',
        'manifest',
        'name',
        'root',
        'written',
      ]);
    }
  });
});

describe('block component names without Core installed', () => {
  it('judges no Core name when Core is not installed', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-no-core-'));
    try {
      const put = (/** @type {string} */ rel, /** @type {string} */ text) => {
        fs.mkdirSync(path.dirname(path.join(out, rel)), {recursive: true});
        fs.writeFileSync(path.join(out, rel), text);
      };
      put(
        'package.json',
        JSON.stringify({
          name: '@acme/widgets',
          version: '1.0.0',
          type: 'module',
          exports: {'./templates/account-card': './templates/account-card.tsx'},
        }),
      );
      put(
        'astryx.integration.mjs',
        "export default {templates: './templates'};\n",
      );
      put(
        'templates/account-card.doc.mjs',
        BLOCK("\n  exampleFor: 'Button',\n  componentsUsed: ['AcmeGizmo'],"),
      );
      put(
        'templates/account-card.tsx',
        'export default function A() {\n  return null;\n}\n',
      );
      const run = spawnSync(
        process.execPath,
        [
          path.join(CLI_ROOT, 'clients/cli/bin/astryx.mjs'),
          '--json',
          'doctor',
          'integration',
          'validate',
        ],
        {cwd: out, encoding: 'utf-8', timeout: 60_000},
      );
      const issues = JSON.parse(run.stdout).data.issues;
      expect(
        issues.filter(
          (/** @type {{code: string}} */ i) =>
            i.code === 'unknown_block_component',
        ),
      ).toEqual([]);
    } finally {
      fs.rmSync(out, {recursive: true, force: true});
    }
  }, 60_000);
});
