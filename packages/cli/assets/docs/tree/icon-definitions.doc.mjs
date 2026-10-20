// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs icon-definitions`: every icon definition, Astryx's and each
 * installed icon set's own.
 *
 * It never lists its children: it adopts every icon definition doc from every
 * package, so a new definition file appears here with no edit to this file.
 */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'icon-definitions',
  title: 'Icon definitions',
  summary:
    'Every icon definition: what an icon stands for, and the shared name icon sets map their icons to.',
  keywords: [
    'icon definition',
    'icon definitions',
    'icon names',
    'which icon',
    'icon map',
  ],
  slots: {
    definitions: {title: 'Definitions', accepts: {kinds: ['icon-definition']}},
  },
  adopts: [
    {
      source: {
        group: 'icon-definitions',
        kinds: ['icon-definition'],
        packages: 'all',
      },
      into: 'definitions',
    },
  ],
  blocks: [
    {
      type: 'prose',
      text: "An icon definition is one thing an icon stands for, such as `close` or `delete`. Every icon set registers its icons against definitions in its data file's `map`, and templates are written against definitions, so a project that switches icon sets gets the same definition from the new set. Built-in definitions are the shared names Core renders; every set maps them. A set may add its own definitions; they are listed here with the package that ships them. `astryx icon <definition>` finds the icon each installed set draws for it.",
    },
  ],
};
