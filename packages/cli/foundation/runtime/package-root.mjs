// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The active hosted run (architecture:cli-surface INV30, spec AST-081
 * FR1): the package sets, approved integrations, and discover sources a host
 * passed through `@astryxdesign/cli/host`, the root that holds the copy that
 * started the run, and the packages the run resolved.
 *
 * Only the host entry activates a hosted run, once per process. With none
 * active, every lookup that consults it behaves as it does without a host.
 *
 * @input What the host entry passes to `activateHostedRun`.
 * @output `hostedRun()` for the lookups that consult it; the resolved-package
 *   record the host entry returns.
 * @position foundation/runtime — read by the release choice, Core lookups,
 *   computer-level integrations, and discover; written by host/index.mjs.
 */

import * as fs from 'node:fs';
import {relativeWithin, samePath} from '../fs/path-compare.mjs';

/**
 * @typedef {object} HostedRun
 * @property {readonly string[]} roots the host's package sets, in its order
 * @property {readonly string[]} integrations the integrations it approves for
 *   use outside a project
 * @property {readonly Function[]} discoverSources its own discover sources
 * @property {string | null} startingRoot the root that holds the copy that
 *   started the run
 */

/** @type {HostedRun | null} */
let active = null;

/** @type {Map<string, {name: string, version: string | null, dir: string | null}>} */
const resolved = new Map();

/**
 * @param {string} p
 * @returns {string}
 */
function real(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * Start the hosted run of this process.
 * @param {{roots?: readonly string[], integrations?: readonly string[], discoverSources?: readonly Function[], startingRoot?: string | null}} inputs
 * @returns {HostedRun}
 */
export function activateHostedRun({
  roots = [],
  integrations = [],
  discoverSources = [],
  startingRoot = null,
}) {
  if (active)
    throw new Error('A hosted run is already active in this process.');
  active = Object.freeze({
    roots: Object.freeze([...roots]),
    integrations: Object.freeze([...integrations]),
    discoverSources: Object.freeze([...discoverSources]),
    startingRoot,
  });
  return active;
}

/**
 * The hosted run of this process, or null when no host started it.
 * @returns {HostedRun | null}
 */
export function hostedRun() {
  return active;
}

/**
 * Note one package the run resolved. The first record of a name stands. Does
 * nothing outside a hosted run.
 * @param {string} name
 * @param {unknown} version
 * @param {string | null | undefined} dir
 */
export function recordResolved(name, version, dir) {
  if (!active || typeof name !== 'string' || resolved.has(name)) return;
  resolved.set(name, {
    name,
    version: typeof version === 'string' ? version : null,
    dir: dir ?? null,
  });
}

/**
 * Note every integration a project load resolved.
 * @param {ReadonlyArray<{name: string, version?: string, __packageDir?: string}>} integrations
 */
export function recordResolvedIntegrations(integrations) {
  if (!active) return;
  for (const integration of integrations) {
    recordResolved(
      integration.name,
      integration.version,
      integration.__packageDir,
    );
  }
}

/**
 * Whether `dir` lies in one of the hosted run's package sets: the root that
 * holds the starting copy, or a root the host passed.
 * @param {string | null} dir
 * @returns {boolean}
 */
export function inPackageSet(dir) {
  if (!active || !dir) return false;
  const target = real(dir);
  return [active.startingRoot, ...active.roots].some(root => {
    if (!root) return false;
    const base = real(root);
    return samePath(base, target) || relativeWithin(base, target) != null;
  });
}

/**
 * Each package the run resolved: its name, version, and whether it came from
 * the project or a package set (INV30).
 * @returns {Array<{name: string, version: string | null, source: 'project' | 'package-set'}>}
 */
export function resolvedPackages() {
  return [...resolved.values()].map(({name, version, dir}) => ({
    name,
    version,
    source: inPackageSet(dir) ? 'package-set' : 'project',
  }));
}

/** Forget the hosted run. Tests only. */
export function _resetHostedRun() {
  active = null;
  resolved.clear();
}
