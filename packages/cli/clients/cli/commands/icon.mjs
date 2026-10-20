// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file icon command — find an icon by meaning in the installed icon sets
 * (AST-084 FR6, FR7).
 *
 * The command surface comes from the colocated `icon.doc.mjs` CommandDoc via
 * `defineCommand`; this file parses flags, calls `icon()`, and renders.
 *
 * Usage:
 *   astryx icon delete              Ranked matches with import lines
 *   astryx icon outline/trash       One icon and every variant's import
 *   astryx icon --list              Installed sets and the names they fill
 *   astryx icon arrow --set outline --limit 3
 */

import {
  formatCliCommand,
  getCliInvocation,
} from '../../../foundation/env/package-manager.mjs';
import {jsonOut} from '../../../foundation/response/json.mjs';
import {resultSet} from '../../../foundation/debug/index.mjs';
import {
  emit,
  section,
  text,
  record,
  records,
  list,
} from '../formatters/index.mjs';
import {cliError} from '../lib/cli-error.mjs';
import {defineCommand} from '../lib/define-command.mjs';
import {icon as iconApi} from '../../../api/icon/icon.mjs';
import {iconAdd} from '../../../api/icon/add/add.mjs';
import {iconMap} from '../../../api/icon/map/map.mjs';
import {iconUse} from '../../../api/icon/use/use.mjs';
import {doc as iconCommand} from './icon.doc.mjs';
import {doc as iconUseCommand} from './icon-use.doc.mjs';
import {doc as iconMapCommand} from './icon-map.doc.mjs';
import {doc as iconAddCommand} from './icon-add.doc.mjs';
import {doc as iconFn} from '../../../api/icon/icon.doc.mjs';
import {doc as iconUseFn} from '../../../api/icon/iconUse.doc.mjs';
import {doc as iconMapFn} from '../../../api/icon/iconMap.doc.mjs';
import {doc as iconAddFn} from '../../../api/icon/iconAdd.doc.mjs';
import {NO_RESULT_SET} from '../../../foundation/debug/index.mjs';

/** @typedef {import('../../../api/icon/icon.type.mjs').IconVariantEntry} IconVariantEntry */

/**
 * A variant's axis values, as one short label: `solid 20 2`.
 * @param {IconVariantEntry} variant
 */
function axisLabel(variant) {
  return [variant.appearance, variant.size, variant.weight]
    .filter(value => value != null)
    .join(' ');
}

/** @param {unknown} value */
const axisValuesText = value =>
  value == null
    ? ''
    : Object.entries(/** @type {Record<string, unknown>} */ (value))
        .map(([key, each]) => `${key} ${each}`)
        .join(', ');

/** @param {unknown} value */
const axesText = value => {
  if (value == null) return '';
  const axes =
    /** @type {import('../../../api/icon/icon.type.mjs').IconAxes} */ (value);
  const parts = [];
  if (axes.appearances) parts.push(`appearances ${axes.appearances.join('/')}`);
  if (axes.sizes) parts.push(`sizes ${axes.sizes.join('/')}`);
  if (axes.weights) {
    parts.push(
      'values' in axes.weights
        ? `weights ${axes.weights.values.join('/')}`
        : `weights ${axes.weights.range.min}-${axes.weights.range.max}`,
    );
  }
  return parts.join(', ');
};

/**
 * @param {import('commander').Command} program
 */

/**
 * The variant axes `icon add` takes, as numbers where they are numeric.
 * @param {Record<string, unknown>} options
 */
function axisOptions(options) {
  const appearance = /** @type {string | undefined} */ (options.appearance);
  const size = options.size != null ? Number(options.size) : undefined;
  const weight = options.weight != null ? Number(options.weight) : undefined;
  return {appearance, size, weight};
}

export function registerIcon(program) {
  const iconCli = defineCommand(program, iconCommand, {
    fn: iconFn,
    action: async (
      /** @type {string[] | string | undefined} */ words,
      /** @type {{list?: boolean, set?: string, limit?: string}} */ options,
    ) => {
      const json = program.opts().json || false;
      const query = Array.isArray(words) ? words.join(' ') : words;
      // Number(), not parseInt(): the API refuses `1.5` and `5abc`.
      const limit = options.limit != null ? Number(options.limit) : undefined;

      /** @type {Awaited<ReturnType<typeof iconApi>>} */
      let result;
      try {
        result = await iconApi(query, {
          cwd: process.cwd(),
          list: options.list ?? false,
          set: options.set,
          limit,
        });
      } catch (e) {
        const err =
          /** @type {import('../../../api/error.mjs').AstryxError} */ (e);
        return cliError(err.message, {
          suggestions: err.suggestions,
          code: err.code,
        });
      }

      const answered =
        result.type === 'icon.search'
          ? resultSet({
              count: result.data.matchCount,
              resultKind: 'mixed',
              empty: result.data.matchCount === 0,
            })
          : result.type === 'icon.list'
            ? resultSet({
                count: result.data.sets.length,
                resultKind: 'mixed',
                empty: result.data.sets.length === 0,
              })
            : resultSet({count: 1, resultKind: 'mixed', directMatch: true});

      if (json) {
        jsonOut(result);
        return answered;
      }

      const run = getCliInvocation();
      if (result.type === 'icon.search') {
        const {query: q, matchCount, matches} = result.data;
        if (matches.length === 0) {
          emit(
            text(`No icons match "${q}".`),
            text(`See the installed sets: ${run} icon --list`),
          );
          return answered;
        }
        emit(
          section(
            matchCount > matches.length
              ? `Icons for "${q}" (${matches.length} of ${matchCount})`
              : `Icons for "${q}" (${matches.length})`,
          ),
          // A match's variants are read with `icon <set>/<id>`; each match
          // with any says how many.
          records(
            matches.map(({variants, ...match}) => ({
              ...match,
              ...(variants.length > 0
                ? {appearance: variants.map(axisLabel).join(', ')}
                : {}),
            })),
            {
              fields: [
                'set',
                'id',
                'package',
                'import',
                'words',
                'definitions',
                'appearance',
                'reason',
              ],
            },
          ),
          text(`Read one with its variants: ${run} icon <set>/<id>`),
        );
        return answered;
      }

      if (result.type === 'icon.detail') {
        const {variants, ...rest} = result.data;
        emit(
          record(rest, {
            fields: [
              'set',
              'id',
              'package',
              'module',
              'export',
              'import',
              'words',
              'definitions',
            ],
          }),
          ...(variants.length > 0
            ? [
                section('Variants'),
                records(variants, {
                  fields: [
                    'appearance',
                    'size',
                    'weight',
                    'module',
                    'export',
                    'import',
                  ],
                }),
              ]
            : []),
          text(
            `More icons: ${formatCliCommand(`astryx icon ${rest.words[0]}`)}`,
          ),
        );
        return answered;
      }

      const {status, projectSet, reason, sets, withdrawn} = result.data;
      emit(
        section('Icon sets'),
        record({status, projectSet, reason}),
        ...(sets.length > 0
          ? [
              records(
                sets.map(({coverage, ...set}) => ({
                  ...set,
                  builtIn: `${coverage.builtIn.mapped}/${coverage.builtIn.total}`,
                  definitions: `${coverage.astryx.mapped}/${coverage.astryx.total}`,
                  own: coverage.own,
                  missing: coverage.builtIn.missing,
                })),
                {
                  fields: [
                    'name',
                    'displayName',
                    'package',
                    'license',
                    'iconCount',
                    'default',
                    'axes',
                    'builtIn',
                    'definitions',
                    'own',
                    'missing',
                    'project',
                    'description',
                  ],
                  format: {default: axisValuesText, axes: axesText},
                },
              ),
            ]
          : []),
        ...(withdrawn.length > 0
          ? [
              section('Withdrawn'),
              list(
                withdrawn.map(
                  each => `${each.package}/${each.name}: ${each.reason}`,
                ),
              ),
            ]
          : []),
        text(`Find one: ${run} icon <words>`),
      );
      return answered;
    },
  });

  /**
   * Run one authoring call and print its receipt, or its error.
   * @param {() => Promise<any>} call
   * @param {(result: any) => void} print
   */
  const run = async (call, print) => {
    let result;
    try {
      result = await call();
    } catch (e) {
      const err = /** @type {import('../../../api/error.mjs').AstryxError} */ (
        e
      );
      return cliError(err.message, {
        suggestions: err.suggestions ?? [],
        code: err.code,
      });
    }
    if (program.opts().json) jsonOut(result);
    else print(result);
    return NO_RESULT_SET;
  };

  defineCommand(iconCli, iconUseCommand, {
    fn: iconUseFn,
    action: (/** @type {string} */ set) =>
      run(
        () => iconUse(set, {cwd: process.cwd()}),
        ({data}) =>
          emit(
            text(
              data.changed
                ? `[ok] iconSet is now "${data.iconSet}" (${data.set}) in ${data.config}${data.created ? ', created' : ''}.`
                : `[ok] iconSet already names "${data.iconSet}" in ${data.config}.`,
            ),
            ...(data.previous && data.changed
              ? [text(`It was "${data.previous}".`)]
              : []),
          ),
      ),
  });

  defineCommand(iconCli, iconMapCommand, {
    fn: iconMapFn,
    action: (
      /** @type {string} */ definition,
      /** @type {string | undefined} */ iconId,
      /** @type {{set?: string, remove?: boolean}} */ options,
    ) =>
      run(
        () =>
          iconMap(definition, iconId, {
            cwd: process.cwd(),
            set: options.set,
            remove: options.remove ?? false,
          }),
        ({data}) =>
          emit(
            text(
              data.icon == null
                ? data.changed
                  ? `[ok] Removed map.${data.definition} (was "${data.previous}") from ${data.file}.`
                  : `[ok] ${data.file} has no map.${data.definition}.`
                : data.changed
                  ? `[ok] map.${data.definition} = "${data.icon}" in ${data.file}${data.previous ? ` (was "${data.previous}")` : ''}.`
                  : `[ok] map.${data.definition} is already "${data.icon}".`,
            ),
          ),
      ),
  });

  defineCommand(iconCli, iconAddCommand, {
    fn: iconAddFn,
    action: (
      /** @type {string} */ exportName,
      /** @type {Record<string, string | boolean | undefined>} */ options,
    ) =>
      run(
        () =>
          iconAdd(exportName, {
            cwd: process.cwd(),
            from: /** @type {string} */ (options.from),
            set: /** @type {string | undefined} */ (options.set),
            definition: /** @type {string | undefined} */ (options.definition),
            newDefinition: /** @type {string | undefined} */ (
              options.newDefinition
            ),
            description: /** @type {string | undefined} */ (
              options.description
            ),
            words:
              typeof options.words === 'string'
                ? options.words.split(',')
                : undefined,
            useDefault: options.default === true,
            ...axisOptions(options),
            id: /** @type {string | undefined} */ (options.id),
          }),
        result => {
          const cli = getCliInvocation();
          if (result.type === 'icon.definitionMatches') {
            const {matches, newDefinition} = result.data;
            emit(
              section(
                `Icon definitions for ${result.data.export} (${matches.length})`,
              ),
              ...(matches.length > 0
                ? [
                    records(matches, {
                      fields: [
                        'name',
                        'source',
                        'score',
                        'reason',
                        'description',
                        'command',
                      ],
                      format: {
                        command: (/** @type {string} */ value) =>
                          formatCliCommand(value),
                      },
                    }),
                  ]
                : [text('No icon definition fits it.')]),
              ...(newDefinition
                ? [
                    text(
                      `None fits well? Add your own: ${formatCliCommand(newDefinition)}`,
                    ),
                  ]
                : []),
              text(`All icon definitions: ${cli} docs icon-definitions`),
            );
            return;
          }
          const {data} = result;
          emit(
            text(
              data.changed
                ? `[ok] Added ${data.icon.export} as "${data.icon.id}"${data.variant ? ` (variant ${Object.values(data.variant).join(' ')})` : ''}${data.definition ? `, map.${data.definition} = "${data.icon.id}"` : ''}.`
                : `[ok] ${data.icon.export} is already "${data.icon.id}"${data.definition ? ` and map.${data.definition} names it` : ''}.`,
            ),
            ...(data.files.length > 0 ? [list(data.files)] : []),
            ...(data.note ? [text(`[next] ${data.note}`)] : []),
          );
        },
      ),
  });
}
