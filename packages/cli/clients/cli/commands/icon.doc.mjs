// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx icon` (AST-084 FR6, FR7). The terminal binding
 * of the `icon()` function (referenced via `fn`).
 * @position packages/cli/clients/cli/commands — command documentation
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'icon',
  displayName: 'astryx icon',
  namespace: 'cli/commands',
  summary:
    'Find an icon by meaning in the installed icon sets, with its import line',
  description:
    "Terminal front-end to icon(): searches every installed icon set's data file by meaning and prints each match's import line. `<set>/<id>` reads one icon with every variant's import line; --list lists the installed sets and which shared icon names each one fills.",
  fn: 'icon',
  // Every word after `icon` is the query: `astryx icon arrow up` searches for
  // "arrow up", with no quotes needed.
  args: [{name: 'query', param: 'query', required: false, variadic: true}],
  options: [
    {
      flag: '--list',
      param: 'options.list',
      description:
        'List the installed icon sets and do nothing else; a query is refused',
    },
    {
      flag: '--set <name>',
      param: 'options.set',
      description: 'Search one set, by name or <package>/<set>',
    },
    {
      flag: '--limit <n>',
      param: 'options.limit',
      description: 'Max number of matches, a positive integer (default 10)',
    },
  ],
  examples: [
    {label: 'Find by meaning', cli: 'astryx icon delete'},
    {label: 'One icon and its variants', cli: 'astryx icon outline/trash'},
    {label: 'Installed sets', cli: 'astryx icon --list --json'},
    {label: 'One set, top 3', cli: 'astryx icon arrow --set outline --limit 3'},
  ],
  exitCodes: [
    {code: 0, when: 'success (including zero matches)'},
    {
      code: 1,
      when: 'no query and no --list, a query with --list, a --limit that is not a positive integer, or a set or icon that is not installed',
    },
  ],
  related: ['search', 'template'],
};
