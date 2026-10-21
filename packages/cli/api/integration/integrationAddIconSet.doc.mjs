// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'integrationAddIconSet',
  namespace: 'cli/api',
  displayName: 'integrationAddIconSet()',
  summary: 'Add an icon set to an integration package.',
  description:
    "Creates an integration manifest when the package has none, writes the set directory with its strongly typed same-stem IconSetDoc and a starter data file (schemaVersion 1, module set to the package name, no icons and an empty map yet), and the set's generated module with its declaration file and an empty themeIcons theme map; with from, it wraps a library's icons into them. It declares the iconSets root on first use, and includes the manifest and root in package.json files when the package already uses an allowlist. Every path is confined to the package and existing files are never overwritten.",
  importPath: '@astryxdesign/cli/api',
  signature:
    'integrationAddIconSet(name: string, options?: IntegrationAddIconSetOptions): Promise<IntegrationAddResponse>',
  keywords: ['integration', 'add', 'icon', 'icon-set', 'author', 'scaffold'],
  params: [
    {
      name: 'name',
      type: 'string',
      description: 'Lowercase kebab-case icon set name and directory name.',
      required: true,
    },
    {
      name: 'options.cwd',
      type: 'string',
      description: 'Directory inside the integration package.',
    },
    {
      name: 'options.dryRun',
      type: 'boolean',
      description:
        'Validate and return the same receipt without writing; data.written is false and data.dryRun is true.',
      default: 'false',
    },
  ],
  returns: [
    {
      type: 'integration.add',
      description: 'The shared typed authoring receipt.',
    },
  ],
  throws: [
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: 'the name is not lowercase kebab-case, or package.json has no name',
    },
    {
      code: 'ERR_FILE_EXISTS',
      when: 'the set descriptor or data file already exists',
    },
    {
      code: 'ERR_PATH_TRAVERSAL',
      when: 'a declared iconSets root escapes the package',
    },
    {
      code: 'ERR_INTEGRATION_ROOT_CONFLICT',
      when: 'the manifest root changed to another path while the command was writing',
    },
    {
      code: 'ERR_WRITE_FAILED',
      when: 'a staged write fails and prior writes are rolled back',
    },
  ],
  examples: [
    {
      label: 'Add an icon set',
      code: "await integrationAddIconSet('outline');",
    },
    {
      label: 'Preview writes',
      code: "await integrationAddIconSet('outline', {dryRun: true});",
    },
  ],
  command: 'integration add icon-set',
  related: ['integrationAdd', 'icon', 'validateIntegration'],
};
