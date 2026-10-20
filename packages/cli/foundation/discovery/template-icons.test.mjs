// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Template icon mapping (AST-084 FR11, FR12): fills, id, and word
 * matches, a kept icon, a solid variant, a name collision, and no set.
 */

import {describe, expect, it} from 'vitest';
import {
  mapTemplateIcons,
  matchIcon,
  templateLibraryIcon,
} from './template-icons.mjs';
import {glyphsData} from '../../test-utils/icon-set-fixture.mjs';

const SET = /** @type {any} */ ({
  name: 'glyphs',
  package: '@acme/glyphs',
  data: {...glyphsData(), module: '@acme/glyphs'},
});

/** @type {any} */
const SELECTED = {status: 'selected', set: SET, reason: 'only set'};

/** @param {string} source @param {any} [choice] */
const map = (source, choice = SELECTED) =>
  mapTemplateIcons(source, {sets: [SET], choice});

describe('templateLibraryIcon', () => {
  it('derives id, words, appearance, and fills from a template-library export', () => {
    expect(
      templateLibraryIcon('@heroicons/react/24/solid', 'XMarkIcon'),
    ).toEqual({
      setName: 'heroicons',
      export: 'XMarkIcon',
      variant: '24/solid',
      id: 'x-mark',
      words: ['x', 'mark'],
      fills: ['close'],
      appearance: 'solid',
    });
    expect(templateLibraryIcon('lucide-react', 'ArrowUpDown')).toMatchObject({
      id: 'arrow-up-down',
      fills: ['arrowsUpDown'],
    });
    expect(templateLibraryIcon('@acme/other', 'XIcon')).toBeNull();
  });
});

describe('matchIcon', () => {
  it('prefers a shared IconName, then the id, then shared words', () => {
    expect(
      matchIcon(
        {
          setName: 'lib',
          export: 'A',
          id: 'x-mark',
          words: ['x', 'mark'],
          fills: ['close'],
        },
        SET,
      ),
    ).toMatchObject({by: 'fills', icon: {id: 'x'}});
    expect(
      matchIcon(
        {setName: 'lib', export: 'A', id: 'home', words: ['home'], fills: []},
        SET,
      ),
    ).toMatchObject({by: 'id', icon: {id: 'home'}});
    expect(
      matchIcon(
        {
          setName: 'lib',
          export: 'A',
          id: 'bin-can',
          words: ['bin', 'garbage'],
          fills: [],
        },
        SET,
      ),
    ).toMatchObject({by: 'words', icon: {id: 'trash'}});
    expect(
      matchIcon(
        {
          setName: 'lib',
          export: 'A',
          id: 'pencil',
          words: ['pencil', 'edit'],
          fills: [],
        },
        SET,
      ),
    ).toBeNull();
  });
});

describe('mapTemplateIcons', () => {
  const SOURCE = [
    "import React from 'react';",
    "import {XMarkIcon, PencilIcon, HomeIcon as House} from '@heroicons/react/24/outline';",
    "import {TrashIcon} from '@heroicons/react/24/solid';",
    '',
    'export default function Page() {',
    '  const icons = {XMarkIcon};',
    '  return <div><XMarkIcon className="x" /><PencilIcon /><House /><TrashIcon />{icons.XMarkIcon}</div>;',
    '}',
    '',
  ].join('\n');

  it('rewrites the import and every reference, and keeps an unmatched icon', () => {
    const {source, icons} = map(SOURCE);
    expect(source).toContain(
      "import {XIcon, HomeIcon, TrashSolidIcon} from '@acme/glyphs';",
    );
    expect(source).toContain(
      "import {PencilIcon} from '@heroicons/react/24/outline';",
    );
    expect(source).not.toContain('@heroicons/react/24/solid');
    expect(source).toContain('<XIcon className="x" />');
    expect(source).toContain('<HomeIcon />');
    expect(source).toContain('<PencilIcon />');
    // A property name keeps its text; a shorthand property keeps its key.
    expect(source).toContain('const icons = {XMarkIcon: XIcon};');
    expect(source).toContain('{icons.XMarkIcon}');
    expect(icons.status).toBe('selected');
    expect(
      icons.mapped.map(each => [
        each.source.export,
        each.target.export,
        each.by,
      ]),
    ).toEqual([
      ['XMarkIcon', 'XIcon', 'fills'],
      ['HomeIcon', 'HomeIcon', 'id'],
      ['TrashIcon', 'TrashSolidIcon', 'id'],
    ]);
    expect(icons.kept).toEqual([
      expect.objectContaining({
        module: '@heroicons/react/24/outline',
        export: 'PencilIcon',
      }),
    ]);
  });

  it('a solid icon uses the solid variant; an outline one uses the default', () => {
    const {source} = map(
      "import {TrashIcon} from '@heroicons/react/24/outline';\nexport const A = () => <TrashIcon />;\n",
    );
    expect(source).toContain("import {TrashIcon} from '@acme/glyphs';");
  });

  it('imports under an alias when the mapped name is taken', () => {
    const {source} = map(
      "import {XMarkIcon} from '@heroicons/react/24/outline';\nconst XIcon = 1;\nexport const A = () => <XMarkIcon />;\n",
    );
    expect(source).toContain("import {XIcon as XIcon2} from '@acme/glyphs';");
    expect(source).toContain('<XIcon2 />');
    expect(source).toContain('const XIcon = 1;');
  });

  it('without a project icon set the source is unchanged and the report says why', () => {
    for (const status of ['none', 'ambiguous']) {
      const {source, icons} = map(SOURCE, {status, reason: 'why'});
      expect(source).toBe(SOURCE);
      expect(icons).toEqual({
        status,
        set: null,
        reason: 'why',
        mapped: [],
        kept: [],
      });
    }
  });

  it('leaves imports from the project set and unknown modules alone', () => {
    const source =
      "import {XIcon} from '@acme/glyphs';\nimport {Thing} from '@acme/other';\nexport const A = () => <><XIcon /><Thing /></>;\n";
    expect(map(source)).toEqual({
      source,
      icons: expect.objectContaining({mapped: [], kept: []}),
    });
  });
});

describe('reviewed matches', () => {
  /** A set whose icons carry reviewed matches for the template libraries. */
  const REVIEWED = /** @type {any} */ ({
    ...SET,
    data: {
      ...SET.data,
      icons: SET.data.icons.map((/** @type {any} */ icon) =>
        icon.id === 'home'
          ? {
              ...icon,
              // An exact match beats the shared-name rule that would pick x.
              matches: [
                {
                  set: 'heroicons',
                  export: 'XMarkIcon',
                  variant: '24/outline',
                  confidence: 'exact',
                },
                {set: 'lucide', export: 'Building', confidence: 'likely'},
              ],
            }
          : icon.id === 'trash'
            ? {
                ...icon,
                matches: [
                  {
                    set: 'heroicons',
                    export: 'ArchiveBoxXMarkIcon',
                    confidence: 'strong',
                  },
                  {
                    set: 'heroicons',
                    export: 'PencilIcon',
                    variant: '24/solid',
                    confidence: 'exact',
                  },
                ],
              }
            : icon,
      ),
    },
  });
  /** @param {string} source */
  const mapReviewed = source =>
    mapTemplateIcons(source, {
      sets: [REVIEWED],
      choice: {status: 'selected', set: REVIEWED, reason: 'only set'},
    });

  it('an exact or strong match is applied before the shared name, id, and words', () => {
    const {source, icons} = mapReviewed(
      "import {XMarkIcon, ArchiveBoxXMarkIcon} from '@heroicons/react/24/outline';\nexport const A = () => <><XMarkIcon /><ArchiveBoxXMarkIcon /></>;\n",
    );
    expect(source).toContain(
      "import {HomeIcon, TrashIcon} from '@acme/glyphs';",
    );
    expect(
      icons.mapped.map(each => [each.source.export, each.target.id, each.by]),
    ).toEqual([
      ['XMarkIcon', 'home', 'match'],
      ['ArchiveBoxXMarkIcon', 'trash', 'match'],
    ]);
  });

  it('a match with a variant names only that variant', () => {
    const {source, icons} = mapReviewed(
      "import {XMarkIcon} from '@heroicons/react/20/solid';\nexport const A = () => <XMarkIcon />;\n",
    );
    // 20/solid is not the reviewed 24/outline variant: the shared name maps it.
    expect(icons.mapped[0]).toMatchObject({target: {id: 'x'}, by: 'fills'});
    expect(source).toContain('<XIcon />');
  });

  it('a likely match is never applied; a kept icon names it as a suggestion', () => {
    const {source, icons} = mapReviewed(
      "import {Building} from 'lucide-react';\nexport const A = () => <Building />;\n",
    );
    expect(source).toContain("import {Building} from 'lucide-react';");
    expect(icons.mapped).toEqual([]);
    expect(icons.kept).toEqual([
      expect.objectContaining({
        module: 'lucide-react',
        export: 'Building',
        suggestion: {
          set: 'glyphs',
          id: 'home',
          module: '@acme/glyphs',
          export: 'HomeIcon',
          confidence: 'likely',
        },
      }),
    ]);
  });

  it('a variant-specific match applies to that variant only', () => {
    const solid = mapReviewed(
      "import {PencilIcon} from '@heroicons/react/24/solid';\nexport const A = () => <PencilIcon />;\n",
    );
    expect(solid.icons.mapped[0]).toMatchObject({
      target: {id: 'trash', export: 'TrashSolidIcon'},
      by: 'match',
    });
    const outline = mapReviewed(
      "import {PencilIcon} from '@heroicons/react/24/outline';\nexport const A = () => <PencilIcon />;\n",
    );
    expect(outline.icons.kept).toHaveLength(1);
  });
});
