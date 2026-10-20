// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `icon.list` leaf (AST-084 FR7): every installed icon set, the
 * project's set, and the sets withdrawn with why.
 *
 * @output the `icon.list` envelope
 * @position api/icon/list — dispatched by ../icon.mjs
 */

import {ICON_NAMES} from '../../../authoring/doctypes/icon-set/icon-names.mjs';
import {loadIconSets} from '../_adapter.mjs';

/**
 * List the installed icon sets.
 * @param {{cwd: string}} options
 * @returns {Promise<import('../icon.type.mjs').IconListResponse>}
 */
export async function iconList({cwd}) {
  const {sets, withdrawn, choice} = await loadIconSets(cwd);
  return {
    type: 'icon.list',
    data: {
      status: choice.status,
      projectSet: choice.set
        ? `${choice.set.package}/${choice.set.name}`
        : null,
      reason: choice.reason,
      sets: sets.map(set => {
        const filled = new Set(
          set.data.icons.flatMap(icon => icon.fills ?? []),
        );
        return {
          name: set.name,
          displayName: set.displayName,
          description: set.description,
          package: set.package,
          license: set.license,
          iconCount: set.data.icons.length,
          default: set.data.default ?? null,
          axes: set.data.axes ?? null,
          fills: ICON_NAMES.filter(name => filled.has(name)),
          unfilled: ICON_NAMES.filter(name => !filled.has(name)),
          project: set === choice.set,
        };
      }),
      withdrawn: withdrawn.map(each => ({
        name: each.name,
        package: each.package,
        reason: each.reason,
      })),
    },
  };
}
