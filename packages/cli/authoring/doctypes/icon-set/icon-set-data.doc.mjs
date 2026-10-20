// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SchemaDoc for an icon set's `<name>.icons.json` data file
 * (AST-084 FR3).
 * @position packages/cli/authoring/doctypes/icon-set — data-file documentation
 */

/** @type {import('@astryxdesign/cli/authoring').SchemaDoc} */
export const doc = {
  type: 'schema',
  name: 'icon-set-data',
  displayName: 'IconSetData',
  namespace: 'authoring',
  description:
    "An icon set's data file: which icons exist, the export that draws each one, the words a person might search for, and the shared icon names (`IconName`) each one fills. `astryx icon`, `astryx search`, template icon mapping, and the checks read this file and nothing else.",
  appliesTo: '<iconSetsRoot>/<name>/<name>.icons.json',
  fields: [
    {
      name: 'schemaVersion',
      type: '1',
      description: 'Data-file format version.',
      required: true,
    },
    {
      name: 'module',
      type: 'string',
      description:
        'The import specifier every `export` is read from. A package name or a package subpath, never a relative path.',
      required: true,
      example: "'@acme/outline-icons'",
    },
    {
      name: 'source',
      type: '{package: string, version: string}',
      description:
        'The upstream library and version the file was generated from. Omit it for a set with no upstream.',
    },
    {
      name: 'axes',
      type: '{appearances?: string[], sizes?: number[], weights?: {values: number[]} | {range: {min: number, max: number}}}',
      description:
        'The appearances, sizes (in pixels), and weights the set supplies. Every axis is optional; omit `axes` when the set varies on nothing.',
    },
    {
      name: 'default',
      type: '{appearance?: string, size?: number, weight?: number}',
      description:
        "The variant each icon's own `export` draws. Its values must be in `axes`.",
    },
    {
      name: 'themeMap',
      type: 'string',
      description:
        'The export that maps each filled `IconName` to its artwork, keyed by exactly the filled names. Omit it when no icon fills a name.',
      example: "'themeIcons'",
    },
    {
      name: 'icons',
      type: 'IconSetIcon[]',
      description: 'Every icon in the set.',
      required: true,
      fields: [
        {
          name: 'icons[].id',
          type: 'string',
          description: 'Lower-kebab identity, unique in the set.',
          required: true,
          example: "'trash'",
        },
        {
          name: 'icons[].export',
          type: 'string',
          description:
            "The named export that draws the icon's default variant.",
          required: true,
          example: "'TrashIcon'",
        },
        {
          name: 'icons[].module',
          type: 'string',
          description:
            "The import specifier, when it differs from the set's `module`.",
        },
        {
          name: 'icons[].words',
          type: 'string[]',
          description:
            'Lower-case terms a person might search for; at least one.',
          required: true,
          example: "['delete', 'remove', 'bin']",
        },
        {
          name: 'icons[].fills',
          type: 'IconName[]',
          description:
            'The shared icon names this icon draws. Each name is filled by at most one icon in a set.',
          example: "['close']",
        },
        {
          name: 'icons[].variants',
          type: '{appearance?, size?, weight?, export, module?}[]',
          description:
            'Other variants, each naming its axis values (all in `axes`) and its own export.',
        },
        {
          name: 'icons[].matches',
          type: "{set, export, variant?, confidence: 'exact' | 'strong' | 'likely'}[]",
          description:
            "Reviewed equivalents of this icon in other icon sets or libraries, such as `{set: 'heroicons', export: 'XMarkIcon', variant: '24/outline', confidence: 'exact'}`. When a copied template imports a matched icon, `exact` and `strong` matches are used before any other rule; a `likely` match is only suggested. A match never names this set itself.",
        },
      ],
    },
  ],
  examples: [
    {
      label: 'A data file at icons/outline/outline.icons.json',
      code: `{
  "schemaVersion": 1,
  "module": "@acme/outline-icons",
  "axes": {"appearances": ["outline", "solid"], "sizes": [24]},
  "default": {"appearance": "outline", "size": 24},
  "themeMap": "themeIcons",
  "icons": [
    {"id": "x", "export": "XIcon", "words": ["close", "cancel", "dismiss"], "fills": ["close"]},
    {
      "id": "trash",
      "export": "TrashIcon",
      "words": ["delete", "remove", "bin"],
      "variants": [{"appearance": "solid", "export": "TrashSolidIcon"}]
    }
  ]
}`,
    },
  ],
  notes: [
    {
      type: 'prose',
      text: 'A file that fails this schema, repeats an id, gives an icon no words, fills a name that is not an `IconName` or fills one name twice, or names an axis value `axes` does not list is invalid, and its set is withdrawn from every surface until it is fixed. `astryx doctor` names the reason.',
    },
    {
      type: 'prose',
      text: "A template's icon maps to the project set's icon whose `matches` name it with `exact` or `strong` confidence, else to the icon that fills the same shared icon name, else to the icon with the same id, else to the icon that shares the most words with it. The CLI's own templates import heroicons (`set: 'heroicons'`, `variant` such as `24/outline`) and lucide (`set: 'lucide'`).",
    },
    {
      type: 'prose',
      text: 'When the upstream library publishes per-icon names or tags, generate this file from them, so regenerating from the same upstream version writes the same file.',
    },
  ],
};
