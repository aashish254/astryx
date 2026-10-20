// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file FunctionDoc for `iconMap()` / `astryx icon map` (AST-084 FR3). */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'iconMap',
  namespace: 'cli/api',
  displayName: 'iconMap()',
  summary:
    'Register which icon of the set being authored draws an icon definition.',
  description:
    "Run inside an icon-set package. Sets `map[definition] = icon` in the set's data file, or removes the entry. The definition must be Astryx's or one the set declares, and the icon an id in the file. The file is written in one fixed shape, `map` keys sorted. `integration check` suggests these commands for definitions the set has a fitting icon for.",
  importPath: '@astryxdesign/cli/api',
  signature:
    'iconMap(definition: string, icon?: string, options?: IconMapOptions): Promise<IconMapResponse>',
  keywords: ['icon', 'icon set', 'map', 'icon definition', 'register'],
  params: [
    {
      name: 'definition',
      type: 'string',
      description: 'The icon definition.',
      required: true,
    },
    {
      name: 'icon',
      type: 'string',
      description: 'An icon id in the set. Omit with `remove`.',
    },
    {
      name: 'options.cwd',
      type: 'string',
      description: 'A directory inside the icon-set package.',
    },
    {
      name: 'options.set',
      type: 'string',
      description: 'The set, when the package ships several.',
    },
    {
      name: 'options.remove',
      type: 'boolean',
      description: "Remove the definition's entry.",
      default: 'false',
    },
  ],
  returns: [
    {
      type: 'icon.map',
      description:
        'The set, the data file, the definition, the icon now mapped, the icon it replaced, and whether the file changed.',
    },
  ],
  throws: [
    {
      code: 'ERR_NOT_FOUND',
      when: 'the definition is unknown, or the set has no such icon',
    },
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: 'the package ships several sets and none is named',
    },
  ],
  examples: [
    {label: 'Map a definition', code: "await iconMap('delete', 'trash');"},
    {
      label: 'Remove an entry',
      code: "await iconMap('delete', undefined, {remove: true});",
    },
  ],
  command: 'icon map',
  related: ['iconAdd', 'integrationAddIconDefinition', 'validateIntegration'],
};
