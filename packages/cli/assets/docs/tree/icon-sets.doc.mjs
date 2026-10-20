// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs cli/integrations/building-blocks/icon-sets`: add an icon
 * set to an integration, generate its data file, check it, and know how apps
 * find its icons and how templates follow it.
 */

/** @type {import('@astryxdesign/cli/authoring').ReferenceDoc} */
export const docs = {
  type: 'generic',
  name: 'icon-sets',
  placement: {parent: 'namespace:building-blocks', slot: 'guides', order: 35},
  title: 'Icon sets',
  category: 'guide',
  keywords: [
    'icon set',
    'add icons',
    'ship icons',
    'icon library',
    'icons.json',
    'integration icons',
  ],
  description:
    'Ship an icon set: one data file says what every icon means, so apps find icons by meaning and templates use your icons.',
  sections: [
    {
      id: 'add-an-icon-set',
      title: 'Add an icon set',
      content: [
        {
          type: 'prose',
          text: 'An icon set is a package of icon components plus one data file that says what each icon means. Run `integration add icon-set` with a lowercase kebab-case name.',
        },
        {
          type: 'code',
          lang: 'bash',
          code: 'npx astryx integration add icon-set outline',
        },
        {
          type: 'code',
          lang: 'text',
          code: `icon-set contribution added

[ok] outline

Declare icon-set root ./icon-sets in astryx.integration.mjs.

- icon-sets/outline/outline.doc.mjs
- icon-sets/outline/outline.icons.json
- package.json
- astryx.integration.mjs`,
        },
        {
          type: 'prose',
          text: "`outline.doc.mjs` is the set's descriptor: its name, display name, description, and `license`, the SPDX license of the artwork (it starts as your package's own license). `outline.icons.json` starts with no icons, and its `module` is your package name. The set's folder also holds any license or notice files for the artwork. Every field is in {@link schema:icon-set-doc} and {@link schema:icon-set-data}.",
        },
      ],
    },
    {
      id: 'the-data-file',
      title: 'The data file',
      content: [
        {
          type: 'prose',
          text: 'Every icon surface reads `<name>.icons.json` and nothing else. Each icon has:',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            '`id`: a lowercase kebab-case name, unique in the set.',
            "`export`: the named export that draws it, imported from the file's `module`. An icon or a variant can set its own `module` when your package splits icons across subpaths.",
            "`words`: the lowercase terms people search for. List the icon's own name first, then its tags, the most telling tag first.",
            "`fills` (optional): the shared Astryx icon names it draws, such as `close` or `search`. A theme uses your set's theme map (named by `themeMap`) to point those names at your artwork.",
            '`variants` (optional): other appearances, sizes, or weights, each with its own `export`. The values must be ones `axes` lists.',
            '`matches` (optional): reviewed equivalents in another set, each with a `confidence` of `exact`, `strong`, or `likely`. Templates use `exact` and `strong` matches; a `likely` one is only suggested.',
          ],
        },
        {
          type: 'code',
          lang: 'json',
          code: `{
  "schemaVersion": 1,
  "module": "@acme/icons",
  "axes": {"appearances": ["outline", "solid"], "sizes": [24]},
  "default": {"appearance": "outline", "size": 24},
  "themeMap": "themeIcons",
  "icons": [
    {
      "id": "x",
      "export": "XIcon",
      "words": ["x", "close", "cancel", "dismiss"],
      "fills": ["close"],
      "matches": [
        {"set": "heroicons", "export": "XMarkIcon", "confidence": "exact"}
      ]
    },
    {
      "id": "trash",
      "export": "TrashIcon",
      "words": ["trash", "delete", "remove", "bin"],
      "variants": [{"appearance": "solid", "export": "TrashSolidIcon"}]
    }
  ]
}`,
        },
      ],
    },
    {
      id: 'generate-the-data-file',
      title: 'Generate it from the library',
      content: [
        {
          type: 'prose',
          text: 'When the icon library publishes names or tags for its icons, generate the data file from them instead of writing it by hand, so it stays in step with each release. Keep the words the library does not publish in your own source, and sort the output, so generating it twice from the same version writes the same file.',
        },
        {
          type: 'code',
          lang: 'js',
          code: `// scripts/icons.mjs: node scripts/icons.mjs
import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
// The library's own metadata: {"trash": ["delete", "remove", "bin"], ...}
const tags = require('@acme/glyph-library/tags.json');
const {version} = require('@acme/glyph-library/package.json');
// Words the library does not publish, kept here once.
const extra = {x: ['close'], trash: ['garbage']};

const pascal = id => id.replace(/(^|-)(\\w)/g, (_, _s, c) => c.toUpperCase());
const icons = Object.keys(tags)
  .sort()
  .map(id => ({
    id,
    export: \`\${pascal(id)}Icon\`,
    words: [...new Set([...id.split('-'), ...tags[id], ...(extra[id] ?? [])])],
  }));

const file = 'icon-sets/outline/outline.icons.json';
const data = JSON.parse(readFileSync(file, 'utf-8'));
writeFileSync(
  file,
  JSON.stringify(
    {...data, source: {package: '@acme/glyph-library', version}, icons},
    null,
    2,
  ) + '\\n',
);`,
        },
        {
          type: 'prose',
          text: "Your package re-exports each icon from the library under its `export` name and keeps `sideEffects: false`, so an app that imports one icon gets only that icon. Ship the library's license and notice text unchanged in the set's folder.",
        },
      ],
    },
    {
      id: 'check-the-set',
      title: 'Check the set',
      content: [
        {
          type: 'prose',
          text: '`astryx integration check` reads the data file against what your package really exports. It never runs your icon module. Its icon-set codes:',
        },
        {
          type: 'list',
          style: 'unordered',
          items: [
            '`invalid_icon_set` (error): the descriptor or data file is invalid, for example a repeated `id`, an icon with no words, a `fills` value that is not a shared icon name or a name filled twice, or a variant whose values `axes` does not list. The set is withdrawn: apps do not see it.',
            '`icon_export_missing` (error): an `export` the named module does not export.',
            "`icon_theme_map_mismatch` (error): the theme map's keys or artwork disagree with `fills`.",
            '`icon_source_version_drift` (warning): the file was generated from a different library version than the one your package depends on. Generate it again.',
            '`icon_license_notice_missing` (warning): a set generated from a library ships no license or notice file.',
          ],
        },
        {
          type: 'prose',
          text: 'Warnings fail only with `--strict`, which every integration runs in its build ({@link generic:checks}). `doctor integration validate` also checks each descriptor against its authoring type.',
        },
      ],
    },
    {
      id: 'how-apps-use-it',
      title: 'How apps use it',
      content: [
        {
          type: 'prose',
          text: 'Once an app installs your package, its agents and engineers find icons by meaning and get the import line:',
        },
        {
          type: 'code',
          lang: 'bash',
          code: `npx astryx icon delete              # ranked matches with import lines
npx astryx icon outline/trash       # one icon and every variant
npx astryx icon --list              # installed sets and the names each fills
npx astryx search delete --type icon
npx astryx discover @acme/icons/outline`,
        },
        {
          type: 'prose',
          text: 'Templates and blocks an app copies use the project\'s icon set instead of the icons they were written with. The project\'s set is the one `iconSet` names in `astryx.config` (`"outline"` or `"@acme/icons/outline"`), or the only set installed. An icon with no match keeps its original import, and the copy reports every icon as mapped or kept.',
        },
      ],
    },
  ],
};
