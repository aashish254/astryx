// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * `@astryxdesign/cli/host`: the programmatic host entry. A tool that carries
 * this CLI starts one run of it per process with explicit inputs
 * (`spec:AST-081` FR1).
 */

/** The inputs of one hosted run. Every option is optional. */
export interface HostedCliOptions {
  /** The arguments after `astryx`. Default: none. */
  argv?: readonly string[];
  /**
   * The working folder of the run. The run changes the process's working
   * folder to it, finds its project there, and writes where the command
   * writes from there. Default: the process's working folder.
   */
  cwd?: string;
  /**
   * The command the tool's users type to run the CLI, such as
   * `acme astryx`. Printed commands start with it unless the integrations
   * the run loads declare their own. A non-blank single line of at most 120
   * characters, with no surrounding spaces and no Astryx agent-docs marker
   * text. Default: none; printed commands use the package manager's name.
   */
  cliCommand?: string;
  /**
   * When the tool found the project's own CLI and did not run it, why, in the
   * tool's own words, such as `cannot-start` or `untrusted`: a non-blank
   * single line of at most 120 characters, with no surrounding spaces. The
   * run is then never handed to that CLI: this copy answers when it is that
   * CLI's release, and otherwise answers with one warning line naming the
   * reason and `meta.answeredBy.copy` set to `fallback`. Default: none; a
   * project's own CLI answers its project.
   */
  declinedProjectCli?: string;
}

/** The outcome of a hosted run that returned. */
export interface HostedCliResult {
  /** The run's exit status, as the `astryx` bin would exit. */
  status: number;
}

/**
 * Run the CLI once in this process, as the `astryx` bin would with the same
 * arguments in the same folder.
 *
 * The run owns the process's working folder, arguments, standard streams,
 * and exit: a run handed to another release, and some failures, end the
 * process with the run's exit status instead of returning.
 *
 * Rejects with a `TypeError`, before anything runs, for an unknown option or
 * an invalid value; and with an `Error`, before anything runs, when a run has
 * already started in this process.
 */
export declare function runHostedCli(
  options?: HostedCliOptions,
): Promise<HostedCliResult>;
