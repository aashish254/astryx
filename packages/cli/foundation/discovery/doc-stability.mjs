// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Integration descriptors that set `stability` where an older CLI
 * refuses it (spec:AST-017 FR21, FR27).
 *
 * Published CLIs before {@link STABILITY_CLI} refuse an unknown field on a
 * page or block template, which they drop, and on a namespace doc, which
 * hides every doc topic the package ships. Component docs and guides keep
 * loading there and ignore the field. So a template or namespace doc that
 * sets `stability` is reported, unless the package's `@astryxdesign/cli` peer range
 * admits only CLIs that read it.
 *
 * @input A loaded integration and its package.json.
 * @output One `stability_needs_cli` finding per descriptor, at `info`: reported, and
 *   never a failure, even under `--strict`, so no build that passed starts
 *   failing.
 * @position foundation/discovery; read by `integration check` (through
 *   `doctor integration validate`) and `integration verify`.
 */

import * as path from 'node:path';
import {discoverIntegrationDocs, loadTopicModule} from './docs-discovery.mjs';
import {discoverIntegrationTemplatesForOne} from './template-adapter.mjs';
import {
  STABILITY_CLI,
  stabilityCliProblem,
} from '../integrations/cli-requirement.mjs';

/**
 * @param {any} loaded a loaded integration (absolute roots)
 * @param {any} pkg its package.json
 * @param {string} packageDir
 * @returns {Promise<Array<{code: string, severity: 'info', message: string, fix: string, file: string}>>}
 */
export async function docStabilityIssues(loaded, pkg, packageDir) {
  if (stabilityCliProblem(pkg) == null) return [];
  /** @type {Array<{file: string, namespace: boolean}>} */
  const files = [];
  if (loaded.docs) {
    const {namespaces} = await discoverIntegrationDocs(loaded).catch(() => ({
      namespaces: [],
    }));
    for (const namespace of namespaces) {
      if (/** @type {any} */ (namespace.doc)?.stability != null) {
        // A namespace's source is `<package>/<path in the docs root>`.
        const inRoot = String(namespace.source).slice(
          String(loaded.name).length + 1,
        );
        files.push({file: path.join(loaded.docs, inRoot), namespace: true});
      }
    }
  }
  if (loaded.templates) {
    const {templates} = await discoverIntegrationTemplatesForOne(loaded).catch(
      () => ({templates: []}),
    );
    for (const template of templates) {
      if (!template.docPath) continue;
      const doc = /** @type {any} */ (
        await loadTopicModule(template.docPath).catch(() => null)
      );
      if (doc?.stability != null) {
        files.push({file: template.docPath, namespace: false});
      }
    }
  }
  return files.map(({file, namespace}) => {
    const relative = path.relative(packageDir, file).split(path.sep).join('/');
    return {
      code: 'stability_needs_cli',
      severity: /** @type {const} */ ('info'),
      message: `${relative} sets \`stability\`: CLIs before ${STABILITY_CLI} drop this descriptor${namespace ? " and hide the package's doc topics" : ''}, and the package's @astryxdesign/cli peer range admits them.`,
      fix: `Declare "@astryxdesign/cli": ">=${STABILITY_CLI}" in peerDependencies (optional in peerDependenciesMeta), or remove \`stability\` from the descriptor.`,
      file: relative,
    };
  });
}
