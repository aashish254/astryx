// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The Astryx peer ranges of an integration package against the CLI and
 * Core in use: a report, listed and never counted or failed on.
 *
 * @input A package directory.
 * @output `{status: 'checked', findings}`, each an `info` finding with its
 *   code, message and fix: an `@astryxdesign/*` peer range that is not a
 *   semver range (`invalid_peer_range`); Core in `dependencies` instead of
 *   `peerDependencies` (`core_not_peer`); a `@astryxdesign/cli` peer range
 *   that excludes the running CLI (`cli_peer_excludes_cli`); a
 *   `@astryxdesign/core` peer range that excludes the installed Core
 *   (`core_peer_excludes_core`).
 * @position foundation/integrations; read by `doctor integration validate`
 *   into its additive `peerRanges` field. Nothing about peers fails a check
 *   (a package that pins its peers exactly while it builds on a newer release
 *   is correct), so these are reported only.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {CLI_ROOT, findCoreDir} from '../fs/paths.mjs';
import {satisfiesRange} from '../env/semver.mjs';

const CORE = '@astryxdesign/core';
const CLI = '@astryxdesign/cli';

const PARTIAL = String.raw`v?(?:\d+|[xX*])(?:\.(?:\d+|[xX*])){0,2}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?`;
const COMPARATOR_RE = new RegExp(`^(?:<=|>=|<|>|=|~>|~|\\^)?${PARTIAL}$`);
const HYPHEN_RE = new RegExp(`^${PARTIAL}\\s+-\\s+${PARTIAL}$`);

/**
 * Whether a dependency range is a semver range a package manager can match.
 * A protocol spec (`workspace:`, `npm:`, `file:`, a URL) is not judged.
 * @param {string} range
 * @returns {boolean | null} null when not judged
 */
export function validRange(range) {
  if (typeof range !== 'string') return false;
  const text = range.trim();
  if (text.includes(':')) return null;
  if (text === '') return true;
  return text.split('||').every(alternative => {
    const set = alternative.trim().replace(/(<=|>=|<|>|=|~>|~|\^)\s+/g, '$1');
    if (set === '') return true;
    if (HYPHEN_RE.test(set)) return true;
    return set.split(/\s+/).every(token => COMPARATOR_RE.test(token));
  });
}

/**
 * The version a package directory's package.json declares, or null.
 * @param {string} dir
 * @returns {string | null}
 */
export function versionAt(dir) {
  try {
    const version = JSON.parse(
      fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'),
    )?.version;
    return typeof version === 'string' ? version : null;
  } catch {
    return null;
  }
}

/**
 * The lower bound to suggest: the range's own floor when it is below the
 * running version (only an upper bound excluded it), else the running version.
 * @param {string} range
 * @param {string} version
 */
function floorFor(range, version) {
  const m = /(?:>=|\^|~|=)?\s*v?(\d+\.\d+\.\d+)/.exec(range);
  return m && satisfiesRange(m[1], `<=${version}`) ? m[1] : version;
}

/**
 * @typedef {object} PeerRangeFinding
 * @property {'invalid_peer_range' | 'core_not_peer' | 'cli_peer_excludes_cli' | 'core_peer_excludes_core'} code
 * @property {'info'} severity reported, never counted or failed on
 * @property {string} message
 * @property {string} fix
 */

/**
 * @typedef {object} PeerRangeReport
 * @property {'checked'} status
 * @property {PeerRangeFinding[]} findings
 */

/**
 * The package's Astryx peer ranges against the CLI running and the Core
 * installed beside the package.
 * @param {string} packageDir
 * @returns {PeerRangeReport}
 */
export function peerRangeReport(packageDir) {
  /** @type {PeerRangeFinding[]} */
  const findings = [];
  let pkg;
  try {
    pkg = JSON.parse(
      fs.readFileSync(path.join(packageDir, 'package.json'), 'utf-8'),
    );
  } catch {
    return {status: 'checked', findings};
  }
  const peers =
    pkg?.peerDependencies && typeof pkg.peerDependencies === 'object'
      ? pkg.peerDependencies
      : {};
  const deps =
    pkg?.dependencies && typeof pkg.dependencies === 'object'
      ? pkg.dependencies
      : {};

  for (const [name, range] of Object.entries(peers)) {
    if (!name.startsWith('@astryxdesign/')) continue;
    if (validRange(/** @type {string} */ (range)) !== false) continue;
    findings.push({
      code: 'invalid_peer_range',
      severity: 'info',
      message: `peerDependencies["${name}"] is "${String(range)}", which is not a semver range, so a package manager cannot match any ${name} version to it.`,
      fix: `Use a range such as ">=${name === CLI ? (versionAt(CLI_ROOT) ?? '0.7.0') : '0.7.0'}" or "^0.7.0".`,
    });
  }

  if (pkg?.name !== CORE && Object.hasOwn(deps, CORE)) {
    const range = Object.hasOwn(peers, CORE)
      ? String(peers[CORE])
      : String(deps[CORE]);
    findings.push({
      code: 'core_not_peer',
      severity: 'info',
      message: `package.json lists ${CORE} in "dependencies", so an app that installs this package can get a second copy of Core beside its own: two theme contexts and duplicated styles.`,
      fix: `Move it to "peerDependencies": {"${CORE}": ${JSON.stringify(range)}} (and to "devDependencies" for local development).`,
    });
  }

  const cliRange = peers[CLI];
  const cliVersion = versionAt(CLI_ROOT);
  if (
    typeof cliRange === 'string' &&
    cliVersion &&
    validRange(cliRange) === true &&
    !satisfiesRange(cliVersion, cliRange)
  ) {
    findings.push({
      code: 'cli_peer_excludes_cli',
      severity: 'info',
      message: `peerDependencies["${CLI}"] is "${cliRange}", which excludes the running CLI ${cliVersion}, so installing this package beside it reports a peer conflict.`,
      fix: `Use a range that admits ${cliVersion}, e.g. "${CLI}": ">=${floorFor(cliRange, cliVersion)}".`,
    });
  }

  const coreRange = peers[CORE];
  const coreDir = pkg?.name === CORE ? null : findCoreDir(packageDir);
  const coreVersion = coreDir ? versionAt(coreDir) : null;
  if (
    typeof coreRange === 'string' &&
    coreVersion &&
    validRange(coreRange) === true &&
    !satisfiesRange(coreVersion, coreRange)
  ) {
    findings.push({
      code: 'core_peer_excludes_core',
      severity: 'info',
      message: `peerDependencies["${CORE}"] is "${coreRange}", which excludes the installed Core ${coreVersion}: the package is built and checked against a Core its range rejects, and apps on that Core get a peer conflict.`,
      fix: `Set it to a range that includes ${coreVersion}, e.g. "${CORE}": "^${coreVersion}", or install a Core the range admits.`,
    });
  }
  return {status: 'checked', findings};
}
