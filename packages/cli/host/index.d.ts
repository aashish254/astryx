// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * `@astryxdesign/cli/host`: the programmatic host entry. A tool that carries
 * this CLI starts one run of it per process with explicit inputs
 * (`spec:AST-081` FR1).
 */

import type {DiscoverSource} from '../authoring/discover/type.js';

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
  /**
   * The tool's package sets, in its order of preference: folders whose
   * `node_modules` each hold a CLI, the Core equal to it, and the
   * integrations installed with them. Inside a project, a set fills only the
   * `@astryxdesign/*` packages the project leaves uninstalled that are not
   * integrations. When a release other than this copy answers the folder,
   * the first set whose CLI and Core are that release and that holds what the
   * project would install for those packages serves the run. A run never
   * installs a release: with no such set, this copy answers with one warning
   * line. Default: none.
   */
  roots?: readonly string[];
  /**
   * Integrations the tool approves for use outside a project, by package
   * name. Each loads from the package set that serves the run, as an
   * integration installed for the computer does, and a name that set does not
   * hold is left out. Default: none.
   */
  integrations?: readonly string[];
  /**
   * The tool's own discover sources. `astryx discover` calls them after every
   * integration's source and before the official list, and reports each as
   * the host's. A run handed to another release's CLI does not get them.
   * Default: none.
   */
  discoverSources?: readonly DiscoverSource[];
}

/** One package a hosted run resolved. */
export interface HostedPackage {
  /** The package name. */
  name: string;
  /** Its version, or null when its package.json gives none. */
  version: string | null;
  /** Whether it came from the project or from a package set. */
  source: 'project' | 'package-set';
}

/** The outcome of a hosted run that returned. */
export interface HostedCliResult {
  /** The run's exit status, as the `astryx` bin would exit. */
  status: number;
  /** Each package the run resolved: the CLI, its Core, and its integrations. */
  packages: HostedPackage[];
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
