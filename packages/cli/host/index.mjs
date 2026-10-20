// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `@astryxdesign/cli/host`, the programmatic host entry (spec AST-081
 * FR1). A tool that carries this CLI starts one run of it with explicit
 * inputs: the arguments, the working folder, the command name its users type,
 * and, when it found the project's own CLI and did not run it, the reason.
 *
 * @input `runHostedCli` options (see host/index.d.ts for the contract).
 * @output The run's exit status. The run owns the process's working folder,
 *   arguments, standard streams, and exit, exactly as a run of the `astryx`
 *   bin does.
 * @position host — the package's `./host` export; calls clients/cli/run.mjs.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

const CLI_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const BIN = path.join(CLI_ROOT, 'clients', 'cli', 'bin', 'astryx.mjs');

/**
 * The process, seen as the holder of one mark: whether a hosted run started in
 * it, whichever copy of the CLI started it.
 */
const processMarks = /** @type {{__astryxHostRunStarted?: boolean}} */ (
  /** @type {unknown} */ (process)
);

/** The longest reason a host may give for not running the project's CLI. */
const MAX_REASON_LENGTH = 120;

const OPTION_NAMES = new Set([
  'argv',
  'cwd',
  'cliCommand',
  'declinedProjectCli',
]);

/**
 * @param {string} message
 * @returns {TypeError}
 */
function invalid(message) {
  return new TypeError(`runHostedCli: ${message}`);
}

/**
 * Check every input before anything runs.
 * @param {unknown} options
 * @returns {Promise<{argv: string[], cwd: string, cliCommand: string | undefined, declinedProjectCli: string | undefined}>}
 */
async function readOptions(options) {
  if (options === undefined) options = {};
  if (
    options === null ||
    typeof options !== 'object' ||
    Array.isArray(options)
  ) {
    throw invalid('options must be an object');
  }
  const record = /** @type {Record<string, unknown>} */ (options);
  for (const key of Object.keys(record)) {
    if (!OPTION_NAMES.has(key)) {
      throw invalid(
        `unknown option "${key}"; the options are ${[...OPTION_NAMES].join(', ')}`,
      );
    }
  }

  const argv = record.argv ?? [];
  if (!Array.isArray(argv) || !argv.every(arg => typeof arg === 'string')) {
    throw invalid('argv must be an array of strings');
  }

  const cwdInput = record.cwd ?? process.cwd();
  if (typeof cwdInput !== 'string' || cwdInput === '') {
    throw invalid('cwd must be a folder path');
  }
  const cwd = path.resolve(cwdInput);
  let isFolder = false;
  try {
    isFolder = fs.statSync(cwd).isDirectory();
  } catch {
    isFolder = false;
  }
  if (!isFolder) throw invalid(`cwd is not a folder: ${cwd}`);

  let cliCommand;
  if (record.cliCommand !== undefined) {
    const {parseCliCommandField} =
      await import('../authoring/integration/schema.mjs');
    try {
      cliCommand = parseCliCommandField(record.cliCommand, 'cliCommand');
    } catch (err) {
      throw invalid(err instanceof Error ? err.message : String(err));
    }
  }

  const declinedProjectCli = record.declinedProjectCli;
  if (
    declinedProjectCli !== undefined &&
    (typeof declinedProjectCli !== 'string' ||
      declinedProjectCli === '' ||
      declinedProjectCli !== declinedProjectCli.trim() ||
      /[\r\n]/u.test(declinedProjectCli) ||
      declinedProjectCli.length > MAX_REASON_LENGTH)
  ) {
    throw invalid(
      `declinedProjectCli must be a non-blank single line of at most ${MAX_REASON_LENGTH} characters, with no surrounding spaces`,
    );
  }

  return {
    argv: [...argv],
    cwd,
    cliCommand,
    declinedProjectCli:
      /** @type {'cannot-start' | 'untrusted' | undefined} */ (
        declinedProjectCli
      ),
  };
}

/**
 * The bin's Node version gate, for a host process: same message, same exit
 * status, same JSON envelope.
 * @param {string[]} argv
 * @returns {Promise<boolean>} whether the run may go on
 */
async function nodeVersionGate(argv) {
  const {isNodeVersionSupported, unsupportedNodeMessage} =
    await import('../foundation/env/node-version.mjs');
  if (isNodeVersionSupported(process.versions.node)) return true;
  const msg = unsupportedNodeMessage(process.versions.node);
  if (argv.includes('--json')) {
    process.stdout.write(
      `${JSON.stringify({apiVersion: 1, error: msg, code: 'ERR_NODE_VERSION'}, null, 2)}\n`,
    );
  } else {
    process.stderr.write(`${msg}\n`);
  }
  process.exitCode = 1;
  return false;
}

/**
 * Run the CLI once in this process, as the `astryx` bin would run with the
 * same arguments in the same folder, for a tool that carries this CLI.
 *
 * @param {import('./index.js').HostedCliOptions} [options]
 * @returns {Promise<import('./index.js').HostedCliResult>}
 */
export async function runHostedCli(options) {
  const input = await readOptions(options);
  if (processMarks.__astryxHostRunStarted) {
    throw new Error(
      'runHostedCli: a run already started in this process; start each run in a new process',
    );
  }
  processMarks.__astryxHostRunStarted = true;

  process.chdir(input.cwd);
  process.argv = [process.argv[0] ?? process.execPath, BIN, ...input.argv];
  if (!(await nodeVersionGate(input.argv))) return {status: 1};

  const {runCli} = await import('../clients/cli/run.mjs');
  const run = () =>
    runCli({
      cliRoot: CLI_ROOT,
      argv: [...input.argv],
      declinedProjectCli: input.declinedProjectCli,
    });
  if (input.cliCommand === undefined) {
    await run();
  } else {
    const {runWithCliDoor} = await import('../foundation/env/cli-command.mjs');
    await runWithCliDoor(input.cliCommand, run);
  }
  const code = process.exitCode;
  return {status: typeof code === 'number' ? code : Number(code ?? 0) || 0};
}
