// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Runner commands in docs: an Astryx command written with a package runner in
 * front. Docs write the bare `astryx <command>` and the CLI shows it with the
 * reader's runner, so a written runner is wrong for every reader on another
 * package manager.
 *
 * - A download runner (`npx`, `pnpm dlx`, `yarn dlx`, `bunx`, `npm exec`)
 *   with the unscoped name `astryx` always counts, even with nothing after
 *   it: it fetches an unrelated package of that name.
 * - A project runner (`pnpm exec`, `pnpm`, `yarn`) counts when an Astryx
 *   command follows (`pnpm exec astryx docs`). Named alone, as when a guide
 *   explains the runners, it is left alone.
 * - The scoped package (`npx @astryxdesign/cli init`) never counts: it is the
 *   one form that runs before the CLI is installed, for install steps.
 * - Other tools' commands (`npx prettier`) never count.
 */

import fs from 'node:fs';

import {loadTopicModule} from './docs-discovery.mjs';

/**
 * @param {string} file
 * @returns {Promise<any>} the doc, or null for one that does not load (the
 *   load problem is reported elsewhere)
 */
async function loadQuietly(file) {
  try {
    return await loadTopicModule(file);
  } catch {
    return null;
  }
}

const DOWNLOAD_RUNNERS = [
  'pnpm dlx',
  'yarn dlx',
  'npm exec --',
  'npm exec',
  'npx',
  'bunx',
];
const PROJECT_RUNNERS = ['pnpm exec', 'pnpm', 'yarn'];

/** @param {string[]} runners */
const alternatives = runners =>
  runners.map(each => each.replace(/ /g, '\\s+')).join('|');

const DOWNLOAD_COMMAND = new RegExp(
  `(?<![\\w@/.-])(?:${alternatives(DOWNLOAD_RUNNERS)})\\s+astryx(?![\\w@/.-])(?:\\s+([a-z][\\w-]*))?`,
  'g',
);
const PROJECT_COMMAND = new RegExp(
  `(?<![\\w@/.-])(?:${alternatives(PROJECT_RUNNERS)})\\s+astryx\\s+([a-z][\\w-]*)`,
  'g',
);

/**
 * Each runner command in a text, as written, with the bare command to write
 * instead, in order.
 *
 * @param {string} text
 * @returns {{written: string, bare: string, download: boolean}[]}
 */
export function runnerCommandsIn(text) {
  const found = [
    ...[...String(text).matchAll(DOWNLOAD_COMMAND)].map(match => ({
      match,
      download: true,
    })),
    ...[...String(text).matchAll(PROJECT_COMMAND)].map(match => ({
      match,
      download: false,
    })),
  ];
  /** @type {{at: number, written: string, bare: string, download: boolean}[]} */
  const unique = [];
  for (const {match, download} of found) {
    if (unique.some(each => each.at === match.index)) continue;
    unique.push({
      at: match.index,
      written: match[0],
      bare: match[1] ? `astryx ${match[1]}` : 'astryx',
      download,
    });
  }
  return unique
    .sort((a, b) => a.at - b.at)
    .map(({written, bare, download}) => ({written, bare, download}));
}

/**
 * Every string in a doc, with the title of the section it is in. Code counts:
 * most commands sit in code blocks.
 *
 * @param {unknown} doc
 * @returns {{text: string, section: string | null}[]}
 */
function allStrings(doc) {
  /** @type {{text: string, section: string | null}[]} */
  const strings = [];
  /**
   * @param {unknown} value
   * @param {string | null} section
   */
  const walk = (value, section) => {
    if (typeof value === 'string') {
      strings.push({text: value, section});
    } else if (Array.isArray(value)) {
      for (const item of value) walk(item, section);
    } else if (value != null && typeof value === 'object') {
      const record = /** @type {Record<string, unknown>} */ (value);
      for (const [key, field] of Object.entries(record)) {
        if (key === 'sections' && Array.isArray(field)) {
          for (const each of field) {
            walk(each, typeof each?.title === 'string' ? each.title : section);
          }
        } else {
          walk(field, section);
        }
      }
    }
  };
  walk(doc, null);
  return strings;
}

/**
 * The 1-based line of a file that holds the text, or null.
 *
 * @param {string[]} lines
 * @param {string} written
 * @returns {number | null}
 */
function lineOf(lines, written) {
  const at = lines.findIndex(line => line.includes(written));
  return at < 0 ? null : at + 1;
}

/**
 * Runner commands in a package's topics.
 *
 * @param {{records: {name: string, path: string}[], guides?: {name: string, ref?: {topicFile?: string}}[]}} discovered
 *   the package's docs, as discoverIntegrationDocs returns them
 * @returns {Promise<import('../../api/integration/authoring-checks.type.mjs').RunnerCommand[]>}
 */
export async function findRunnerCommands(discovered) {
  const topics = [
    ...discovered.records.map(record => ({
      name: record.name,
      file: record.path,
    })),
    ...(discovered.guides ?? []).map(guide => ({
      name: guide.name,
      file: guide.ref?.topicFile,
    })),
  ];
  /** @type {import('../../api/integration/authoring-checks.type.mjs').RunnerCommand[]} */
  const found = [];
  for (const {name, file} of topics) {
    const doc = file ? await loadQuietly(file) : null;
    if (!doc || !file) continue;
    /** @type {string[]} */
    let lines = [];
    try {
      lines = fs.readFileSync(file, 'utf8').split('\n');
    } catch {
      // The doc loaded, so only the line number is lost.
    }
    for (const {text, section} of allStrings(doc)) {
      for (const {written, bare, download} of runnerCommandsIn(text)) {
        const line = lineOf(lines, written);
        const where = section ? ` (section "${section}")` : '';
        found.push({
          topic: name,
          section,
          file,
          line,
          command: written,
          message:
            `"${name}"${where} writes \`${written}\`${line == null ? '' : ` (line ${line})`}. ` +
            `Write \`${bare}\`; the CLI shows it with your project's runner` +
            (download
              ? ', and a download runner with the bare name fetches an unrelated package called astryx.'
              : '.'),
        });
      }
    }
  }
  return found;
}
