// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx icon map`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'icon map',
  displayName: 'astryx icon map',
  namespace: 'cli/commands',
  summary: 'Register which icon of your set draws an icon definition',
  description:
    "Run inside an icon-set package. Sets `map[<definition>] = <icon>` in the set's data file; `integration check` prints these commands for definitions your set already has a fitting icon for.",
  fn: 'iconMap',
  args: [
    {name: 'definition', param: 'definition', required: true},
    {name: 'icon', param: 'icon', required: false},
  ],
  options: [
    {
      flag: '--set <name>',
      param: 'options.set',
      description: 'The set to edit, when the package ships several',
    },
    {
      flag: '--remove',
      param: 'options.remove',
      description: "Remove the definition's entry; takes no icon",
    },
  ],
  examples: [
    {label: 'Map a definition', cli: 'astryx icon map delete trash'},
    {label: 'Remove an entry', cli: 'astryx icon map delete --remove'},
  ],
  exitCodes: [
    {code: 0, when: 'the entry is written, removed, or already as asked'},
    {
      code: 1,
      when: 'the definition is unknown, the set has no such icon, or no set is found',
    },
  ],
  related: ['icon add', 'integration add', 'integration check'],
};
