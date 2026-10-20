// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx icon use`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'icon use',
  displayName: 'astryx icon use',
  namespace: 'cli/commands',
  summary: "Choose the project's icon set",
  description:
    "Writes `iconSet` in astryx.config, so copied templates and blocks use that set's icons. The set must be installed.",
  fn: 'iconUse',
  args: [{name: 'set', param: 'set', required: true}],
  examples: [
    {label: 'Use a set', cli: 'astryx icon use outline'},
    {label: 'Name its package', cli: 'astryx icon use @acme/icons/outline'},
  ],
  exitCodes: [
    {code: 0, when: 'iconSet is written, or already names the set'},
    {
      code: 1,
      when: 'the set is not installed, two packages ship it, or the config cannot be updated',
    },
  ],
  related: ['icon', 'template'],
};
