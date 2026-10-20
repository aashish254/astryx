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
import {doc as iconCommand} from './icon.doc.mjs';
import {doc as iconFn} from '../../../api/icon/icon.doc.mjs';

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
export function registerIcon(program) {
  defineCommand(program, iconCommand, {
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
                'fills',
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
              'fills',
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
              records(sets, {
                fields: [
                  'name',
                  'displayName',
                  'package',
                  'license',
                  'iconCount',
                  'default',
                  'axes',
                  'fills',
                  'unfilled',
                  'project',
                  'description',
                ],
                format: {default: axisValuesText, axes: axesText},
              }),
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
}
