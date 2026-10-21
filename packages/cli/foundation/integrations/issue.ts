// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The integration validation issue type.
 *
 * Surfaced by both the foundation-level project loader
 * (`foundation/config/project.mjs`, during `Project.load`) and the api-level
 * `validateIntegration`, so it lives in the shared foundation layer. It is NOT
 * part of the authoring surface — an integration author never writes one; it is
 * an internal diagnostic the CLI produces about a loaded integration.
 */

/** An issue surfaced while loading or validating an integration. */
export interface AstryxIntegrationIssue {
  code: string;
  /** `info` is reported and never fails or counts as a warning. */
  severity: 'info' | 'warning' | 'error';
  message: string;
  /**
   * For an icon definition an icon set does not map: the icon the set's
   * lookup suggests, as `map[map] = icon`.
   */
  suggestion?: {map: string; icon: string};
  /** What to change, ready to paste, when the check knows it. */
  fix?: string;
  /** The file the issue is in, relative to the package. */
  file?: string;
  /** The 1-based line in `file`, when the check can locate it. */
  line?: number;
}
