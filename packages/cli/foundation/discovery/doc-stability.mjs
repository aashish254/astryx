// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Integration descriptors that set `stability` where an older CLI
 * refuses it (spec:AST-017 FR21, FR27).
 *
 * Published CLIs before {@link STABILITY_CLI} refuse an unknown field on a
 * page or block template, which they drop, and on a namespace doc, which
 * hides every doc topic the package ships. Component docs and guides keep
 * loading there and ignore the field. So each template or namespace doc that
 * sets `stability` gets a note, unless the package's `@astryxdesign/cli` peer
 * range admits only CLIs that read it.
 *
 * @input A loaded integration and its package.json.
 * @output One note per descriptor. A note is not an issue: it is never an
 *   error or a warning, and never fails a check, even under `--strict`.
 * @position foundation/discovery; read by `doctor integration validate`
 *   (and so `integration check`) for the package being authored.
 */

import * as path from 'node:path';
import {discoverIntegrationDocs, loadTopicModule} from './docs-discovery.mjs';
import {discoverIntegrationTemplatesForOne} from './template-adapter.mjs';
import {
  STABILITY_CLI,
  stabilityCliProblem,
} from '../integrations/cli-requirement.mjs';

/**
 * @typedef {object} OlderCliNote
 * @property {string} file the descriptor, relative to the package
 * @property {'template' | 'namespace'} kind
 * @property {string} message what an older CLI does with it, and the fix
 */

/**
 * @param {any} loaded a loaded integration (absolute roots)
 * @param {any} pkg its package.json
 * @param {string} packageDir
 * @returns {Promise<OlderCliNote[]>}
 */
export async function olderCliNotes(loaded, pkg, packageDir) {
  if (stabilityCliProblem(pkg) == null) return [];
  /** @type {Array<{file: string, kind: 'template' | 'namespace'}>} */
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
        files.push({file: path.join(loaded.docs, inRoot), kind: 'namespace'});
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
        files.push({file: template.docPath, kind: 'template'});
      }
    }
  }
  return files.map(({file, kind}) => {
    const relative = path.relative(packageDir, file).split(path.sep).join('/');
    return {
      file: relative,
      kind,
      message: `${relative} sets \`stability\`: CLIs before ${STABILITY_CLI} drop this descriptor${kind === 'namespace' ? " and hide the package's doc topics" : ''}, and the package's @astryxdesign/cli peer range admits them. Declare "@astryxdesign/cli": ">=${STABILITY_CLI}" in peerDependencies (optional in peerDependenciesMeta), or remove \`stability\`.`,
    };
  });
}
