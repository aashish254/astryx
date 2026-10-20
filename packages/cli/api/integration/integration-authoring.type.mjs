// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Typed requests and responses for integration authoring commands.
 */

/**
 * @typedef {'theme'|'component'|'doc'|'template'|'codemod'|'agent-doc'|'icon-set'|'icon-definition'} IntegrationAddKind
 */

/**
 * @typedef {object} IntegrationAddBaseOptions
 * @property {string} [cwd]
 * @property {boolean} [dryRun]
 */

/** @typedef {IntegrationAddBaseOptions} IntegrationAddComponentOptions */

/**
 * @typedef {IntegrationAddBaseOptions & {
 *   replaces?: string,
 *   extends?: string,
 *   parent?: string,
 * }} IntegrationAddDocOptions
 */

/**
 * @typedef {IntegrationAddBaseOptions & {
 *   type?: 'page'|'block',
 * }} IntegrationAddTemplateOptions
 */

/**
 * @typedef {IntegrationAddBaseOptions & {
 *   to: string,
 * }} IntegrationAddCodemodOptions
 */

/** @typedef {IntegrationAddBaseOptions} IntegrationAddAgentDocOptions */
/**
 * @typedef {IntegrationAddBaseOptions & {
 *   from?: string,
 * }} IntegrationAddIconSetOptions
 * `from`: a module whose every icon component the set wraps: a package, a
 * package subpath, or a ./ path in the package.
 */

/**
 * @typedef {IntegrationAddBaseOptions & {
 *   set?: string,
 *   description?: string,
 *   words?: string[] | string,
 *   icon?: string,
 * }} IntegrationAddIconDefinitionOptions
 */
/**
 * @typedef {IntegrationAddBaseOptions & {
 *   from?: string,
 * }} IntegrationAddThemeOptions
 */

/**
 * Options for the generic `integrationAdd` dispatcher. Prefer a per-kind API
 * when the contribution kind is known so the accepted options stay narrow.
 *
 * @typedef {object} IntegrationAddOptions
 * @property {string} [cwd]
 * @property {boolean} [dryRun]
 * @property {'page'|'block'} [templateType]
 * @property {string} [replaces]
 * @property {string} [extends]
 * @property {string} [parent]
 * @property {string} [to]
 * @property {string} [from]
 * @property {string} [set]
 * @property {string} [description]
 * @property {string[] | string} [words]
 * @property {string} [icon]
 */

/**
 * A contribution writer receipt. `files` contains every project-relative path
 * written by this call, or every path that would be written under `dryRun`.
 * `root` is null for contribution kinds that modify a manifest field rather
 * than declaring a directory root (e.g. agent-doc).
 *
 * @typedef {object} IntegrationAddResponse
 * @property {'integration.add'} type
 * @property {IntegrationAddData} data
 */

/**
 * @typedef {object} IntegrationAddData
 * @property {'theme'|'component'|'doc'|'template'|'codemod'|'agent-doc'|'icon-set'|'icon-definition'} kind
 * @property {string} name
 * @property {{path: string, created: boolean}|null} root
 * @property {string} manifest
 * @property {string[]} files
 * @property {boolean} written
 * @property {boolean} dryRun
 * @property {string} [from]
 * @property {number} [icons] For icon-set with `from`: how many icons it wrote.
 * @property {string[]} [notes] What the author does next.
 */

export {};
