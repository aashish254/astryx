// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for `icon()` / `astryx icon` (AST-084 FR6, FR7).
 * @position packages/cli/api/icon — function documentation
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'icon',
  namespace: 'cli/api',
  displayName: 'icon()',
  summary:
    'Find an icon by meaning in the installed icon sets, read one icon, or list the sets.',
  description:
    "Reads every installed icon set's data file, never the icon modules. With words it ranks icons by meaning: a shared icon name the icon fills, then its id, then one of its words, then a word that starts with the query, then partial matches; ties keep the project's set first, then integration load order, then id order. With `<set>/<id>` it reads one icon with every variant's import line. With `list` it lists the installed sets, which shared icon names each one fills, and any set withdrawn and why.",
  importPath: '@astryxdesign/cli/api',
  signature:
    'icon(query?: string, options?: IconOptions): Promise<IconSearchResponse | IconDetailResponse | IconListResponse>',
  keywords: ['icon', 'icons', 'icon set', 'glyph', 'import', 'svg'],
  params: [
    {
      name: 'query',
      type: 'string',
      description:
        'Words to search for, or `<set>/<id>` (`<package>/<set>/<id>` when two packages ship a set with one name). Omit with `list`.',
    },
    {
      name: 'options.list',
      type: 'boolean',
      description: 'List the installed icon sets instead of searching.',
    },
    {
      name: 'options.set',
      type: 'string',
      description: 'Search one set, by name or `<package>/<set>`.',
    },
    {
      name: 'options.limit',
      type: 'number',
      description:
        'Max matches, a positive integer (default 10). `matchCount` counts every match.',
    },
    {
      name: 'options.cwd',
      type: 'string',
      description: 'Project directory (default: the current directory).',
    },
  ],
  returns: [
    {
      type: 'icon.search',
      description:
        'The query, how many icons matched, and the ranked matches, each with its set, id, package, module, export, import line, words, filled names, variants, reason, and score. No match is an empty list.',
    },
    {
      type: 'icon.detail',
      description:
        "One icon's fields, as a match names them, with every variant's import line. The envelope names the set's package.",
    },
    {
      type: 'icon.list',
      description:
        "The project's icon-set state, each installed set with its package, license, icon count, default variant, axes, and which shared icon names it fills and does not fill, and each withdrawn set with its reason.",
    },
  ],
  throws: [
    {
      code: 'ERR_MISSING_ARGUMENT',
      when: 'no query is given and `list` is not set',
    },
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: 'a query is given with `list`, `limit` is not a positive integer, or a set name two packages share is not qualified with its package',
    },
    {
      code: 'ERR_NOT_FOUND',
      when: 'the set named by `<set>/<id>` or `options.set` is not installed, or the set has no such icon; suggestions name the closest',
    },
  ],
  examples: [
    {label: 'Find by meaning', code: "const {data} = await icon('delete');"},
    {label: 'One icon', code: "await icon('outline/trash');"},
    {label: 'Installed sets', code: 'await icon(undefined, {list: true});'},
  ],
  command: 'icon',
  related: ['search', 'template'],
};
