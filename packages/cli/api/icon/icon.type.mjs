// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated types for the `icon` command (AST-084 FR6, FR7): the source
 * of truth for its response shapes.
 *
 * @position api/icon — typedefs for api/icon/{icon,search,detail,list}
 */

/**
 * One point on a set's axes: which appearance, size, and weight.
 * @typedef {object} IconAxisValues
 * @property {string} [appearance]
 * @property {number} [size]
 * @property {number} [weight]
 */

/**
 * The axes a set supplies.
 * @typedef {object} IconAxes
 * @property {string[]} [appearances]
 * @property {number[]} [sizes]
 * @property {{values: number[]} | {range: {min: number, max: number}}} [weights]
 */

/**
 * One variant of an icon.
 * @typedef {object} IconVariantEntry
 * @property {string} [appearance]
 * @property {number} [size]
 * @property {number} [weight]
 * @property {string} module - The import specifier the variant is read from.
 * @property {string} export - The named export that draws the variant.
 */

/**
 * One variant of an icon, with its import line.
 * @typedef {IconVariantEntry & {import: string}} IconDetailVariantEntry
 */

/**
 * One icon, as every icon read names it.
 * @typedef {object} IconRecord
 * @property {string} set - The set's name.
 * @property {string} id - The icon's id, unique in its set.
 * @property {string} package - The integration package that ships the set.
 * @property {string} module - The import specifier of the icon's default export.
 * @property {string} export - The named export that draws the default variant.
 * @property {string} import - The import line for the default variant.
 * @property {string[]} words - Terms a person might search for.
 * @property {string[]} fills - Shared icon names (`IconName`) the icon draws.
 * @property {IconVariantEntry[]} variants - Other variants.
 */

/**
 * One ranked icon match.
 * @typedef {IconRecord & {reason: string, score: number}} IconMatchEntry
 */

/**
 * `astryx --json icon <words>`.
 * @typedef {object} IconSearchResponse
 * @property {'icon.search'} type
 * @property {object} data
 * @property {string} data.query
 * @property {number} data.matchCount - Every match, before `limit`.
 * @property {IconMatchEntry[]} data.matches - The ranked matches, at most `limit`.
 */

/**
 * `astryx --json icon <set>/<id>`.
 * @typedef {object} IconDetailResponse
 * @property {'icon.detail'} type
 * @property {string} package - The integration package that ships the set.
 * @property {Omit<IconRecord, 'variants'> & {variants: IconDetailVariantEntry[]}} data
 */

/**
 * One installed set.
 * @typedef {object} IconSetEntry
 * @property {string} name
 * @property {string} displayName
 * @property {string} description
 * @property {string} package
 * @property {string} license
 * @property {number} iconCount
 * @property {IconAxisValues | null} default
 * @property {IconAxes | null} axes
 * @property {string[]} fills - Shared icon names the set fills.
 * @property {string[]} unfilled - Shared icon names the set does not fill.
 * @property {boolean} project - Whether this is the project's icon set.
 */

/**
 * A set that answers nothing, and why.
 * @typedef {object} IconWithdrawnEntry
 * @property {string} name
 * @property {string} package
 * @property {string} reason
 */

/**
 * `astryx --json icon --list`.
 * @typedef {object} IconListResponse
 * @property {'icon.list'} type
 * @property {object} data
 * @property {'selected' | 'none' | 'ambiguous' | 'missing'} data.status - The project's icon-set state.
 * @property {string | null} data.projectSet - The project's set, as `<package>/<set>`, when selected.
 * @property {string} data.reason - Why the project has that set, or none.
 * @property {IconSetEntry[]} data.sets - Installed sets, the project's first.
 * @property {IconWithdrawnEntry[]} data.withdrawn - Sets found but withdrawn.
 */

/**
 * Options for `icon()`.
 * @typedef {object} IconOptions
 * @property {string} [cwd]
 * @property {boolean} [list] - List the installed sets.
 * @property {string} [set] - Keep one set, by name or `<package>/<set>`.
 * @property {number} [limit] - Max matches (default 10).
 */

export {};
