// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `integration check` reports a template or namespace doc that sets
 * `stability`, which a CLI before 0.7.2 refuses and drops (spec:AST-017
 * FR27), unless the package's CLI peer range admits only CLIs that read it.
 * A component doc or guide that sets it is not reported: older CLIs ignore
 * the field there.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {validateLocalIntegration} from './validate-integration.mjs';

/** @type {string} */
let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-doc-stability-'));
});
afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/**
 * @param {Record<string, unknown>} pkgExtra
 * @param {string} stability the field, or '' for none
 */
function writePackage(pkgExtra, stability) {
  /** @param {string} rel @param {string} text */
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), {recursive: true});
    fs.writeFileSync(path.join(dir, rel), text);
  };
  write(
    'package.json',
    JSON.stringify({name: '@acme/stab', version: '1.0.0', ...pkgExtra}),
  );
  write(
    'astryx.integration.mjs',
    "export default {templates: './templates', docs: './docs', components: './components'};\n",
  );
  write(
    'templates/stab-hero.tsx',
    'export default function StabHero() { return null; }\n',
  );
  write(
    'templates/stab-hero.doc.mjs',
    `export default {type: 'block', name: 'Stab hero', description: 'A hero block.', aspectRatio: 2, componentsUsed: []${stability}};\n`,
  );
  write(
    'docs/stabns.doc.mjs',
    `export default {type: 'namespace', name: 'stabns', title: 'Stab', summary: 'Stab docs.'${stability}, slots: {guides: {title: 'Guides', accepts: {kinds: ['generic']}}}};\n`,
  );
  write(
    'components/StabWidget.tsx',
    'export function StabWidget() { return null; }\n',
  );
  write(
    'components/StabWidget.doc.mjs',
    `/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */\nexport default {type: 'component', name: 'StabWidget', displayName: 'Stab Widget', category: 'Layout', usage: {description: 'A widget.', bestPractices: []}, props: []${stability}};\n`,
  );
}

/** @returns {Promise<any[]>} */
async function stabilityFindings() {
  const result = await validateLocalIntegration(dir);
  return result.issues.filter(issue => issue.code === 'stability_needs_cli');
}

describe('stability_needs_cli', () => {
  it('reports each template and namespace doc that sets stability, never failing', async () => {
    writePackage({}, ", stability: 'experimental'");
    const found = await stabilityFindings();
    expect(found.map(issue => issue.file).sort()).toEqual([
      'docs/stabns.doc.mjs',
      'templates/stab-hero.doc.mjs',
    ]);
    for (const issue of found) {
      expect(issue.severity).toBe('info');
      expect(issue.message).toContain('CLIs before 0.7.2 drop this descriptor');
      expect(issue.fix).toContain('">=0.7.2"');
    }
    expect(
      found.find(issue => issue.file === 'docs/stabns.doc.mjs').message,
    ).toContain("hide the package's doc topics");
  });

  it('says nothing when the CLI peer range starts at 0.7.2', async () => {
    writePackage(
      {peerDependencies: {'@astryxdesign/cli': '>=0.7.2'}},
      ", stability: 'experimental'",
    );
    expect(await stabilityFindings()).toEqual([]);
  });

  it('says nothing when no descriptor sets stability', async () => {
    writePackage({}, '');
    expect(await stabilityFindings()).toEqual([]);
  });
});
