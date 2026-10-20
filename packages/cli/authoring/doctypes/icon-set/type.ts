// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Icon-set contribution descriptor and data-file types (AST-084).
 *
 * An icon set is one integration item: a lower-kebab directory under the
 * manifest's `iconSets` root holding a strongly typed `<name>.doc.mjs`
 * descriptor and one `<name>.icons.json` data file. The descriptor holds what
 * a person writes about the set; the data file says what every icon means.
 * Every icon surface (search, `astryx icon`, template icon mapping, the theme
 * map check, Doctor) reads the data file and nothing else.
 *
 * @input metadata authored beside one icon set
 * @output the public IconSetDoc and IconSetData contracts
 * @position packages/cli/authoring/doctypes/icon-set — icon-set vocabulary
 */

/**
 * The descriptor for one icon set an integration contributes.
 *
 * @example
 * ```
 * /** @type {import('@astryxdesign/cli/authoring').IconSetDoc} *\/
 * export default {
 *   type: 'icon-set',
 *   name: 'outline',
 *   displayName: 'Acme Outline',
 *   description: 'Outline icons with rounded strokes.',
 *   maintained: true,
 *   license: 'MIT',
 * };
 * ```
 */
export interface IconSetDoc {
  /** Doc-kind discriminant. */
  type: 'icon-set';
  /** Stable CLI identity. Must be lower-kebab and match the parent directory. */
  name: string;
  /** Human-readable name shown by icon-set listings. */
  displayName: string;
  /** One-line summary shown by icon-set listings. */
  description: string;
  /** Whether the owning package actively maintains this set. */
  maintained: boolean;
  /** SPDX license expression for the artwork. */
  license: string;
}

/** The weights a set supplies: a list of values, or a continuous range. */
export type IconSetWeights =
  {values: number[]} | {range: {min: number; max: number}};

/** The appearances, sizes, and weights an icon set supplies. */
export interface IconSetAxes {
  /** Appearance names, such as `outline` or `solid`. */
  appearances?: string[];
  /** Sizes in pixels. */
  sizes?: number[];
  /** Stroke or optical weights. */
  weights?: IconSetWeights;
}

/** One point on a set's axes: which appearance, size, and weight. */
export interface IconSetAxisValues {
  appearance?: string;
  size?: number;
  weight?: number;
}

/** A variant of one icon, drawn by its own export. */
export interface IconSetVariant extends IconSetAxisValues {
  /** The named export that draws this variant. */
  export: string;
  /** The import specifier, when it differs from the icon's module. */
  module?: string;
}

/** One icon of a set. */
export interface IconSetIcon {
  /** Lower-kebab identity, unique in the set. */
  id: string;
  /** The named export that draws the icon's default variant. */
  export: string;
  /** The import specifier, when it differs from the set's module. */
  module?: string;
  /** Lower-case terms a person might search for; at least one. */
  words: string[];
  /** Shared semantic icon names (`IconName`) this icon draws. */
  fills?: string[];
  /** Other variants, each naming its axis values and its own export. */
  variants?: IconSetVariant[];
}

/** The upstream library and version the data file was generated from. */
export interface IconSetSource {
  package: string;
  version: string;
}

/** The `<name>.icons.json` data file of one icon set. */
export interface IconSetData {
  /** Data-file format version. */
  schemaVersion: 1;
  /** The import specifier every `export` is read from. */
  module: string;
  /** The upstream library, absent for a set with no upstream. */
  source?: IconSetSource;
  /** The axes the set varies on; absent when it varies on nothing. */
  axes?: IconSetAxes;
  /** The variant an icon's own `export` draws. */
  default?: IconSetAxisValues;
  /** The export that maps each filled `IconName` to its artwork. */
  themeMap?: string;
  /** Every icon in the set. */
  icons: IconSetIcon[];
}
