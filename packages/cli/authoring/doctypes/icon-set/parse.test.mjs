// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The icon-set descriptor and data-file parsers (AST-084 FR2, FR3).
 */

import {describe, it, expect} from 'vitest';
import {parseIconSet, parseIconSetData} from './parse.mjs';
import {parseDoc} from '../parse.mjs';
import {glyphsData} from '../../../test-utils/icon-set-fixture.mjs';

const DOC = {
  type: 'icon-set',
  name: 'outline',
  displayName: 'Acme Outline',
  description: 'Outline icons.',
  maintained: true,
  license: 'MIT',
};

/** @param {(data: any) => void} change */
function dataWith(change) {
  const data = /** @type {any} */ (glyphsData());
  change(data);
  return data;
}

describe('parseIconSet', () => {
  it('accepts a complete descriptor, also through parseDoc', () => {
    expect(parseIconSet(DOC)).toEqual(DOC);
    expect(parseDoc(DOC)).toEqual(DOC);
  });

  it('rejects an unknown field, a missing license, and a non-kebab name', () => {
    expect(() => parseIconSet({...DOC, icons: []})).toThrow(/Unrecognized key/);
    const {license: _license, ...noLicense} = DOC;
    expect(() => parseIconSet(noLicense)).toThrow(/license/);
    expect(() => parseIconSet({...DOC, name: 'Outline'})).toThrow(/kebab/);
  });
});

describe('parseIconSetData', () => {
  it('accepts the fixture data file', () => {
    expect(parseIconSetData(glyphsData()).icons).toHaveLength(4);
  });

  it.each([
    ['schemaVersion 2', d => (d.schemaVersion = 2), /schemaVersion/],
    ['an unknown field', d => (d.extra = true), /Unrecognized key/],
    ['a relative module', d => (d.module = './icons'), /module/],
    ['a duplicate id', d => (d.icons[1].id = 'x'), /duplicate id "x"/],
    [
      'an icon with no words',
      d => (d.icons[0].words = []),
      /at least one word/,
    ],
    ['an upper-case word', d => (d.icons[0].words = ['Close']), /lower-case/],
    [
      'a fill that is not an IconName',
      d => (d.icons[3].fills = ['house']),
      /"house" is not an IconName/,
    ],
    [
      'an IconName filled twice',
      d => (d.icons[3].fills = ['close']),
      /already filled by "x"/,
    ],
    [
      'a variant outside axes',
      d => (d.icons[2].variants[0].appearance = 'duotone'),
      /"duotone" is not in axes.appearances/,
    ],
    [
      'a variant size outside axes',
      d => (d.icons[2].variants[0].size = 20),
      /size 20 is not in axes.sizes/,
    ],
    [
      'a variant with no axis value',
      d => (d.icons[2].variants = [{export: 'TrashAltIcon'}]),
      /at least one axis value/,
    ],
    [
      'a default outside axes',
      d => (d.default.size = 16),
      /size 16 is not in axes.sizes/,
    ],
    [
      'a match with an unknown confidence',
      d =>
        (d.icons[0].matches = [
          {set: 'heroicons', export: 'XMarkIcon', confidence: 'maybe'},
        ]),
      /confidence/,
    ],
    [
      'a match listed twice',
      d =>
        (d.icons[0].matches = [
          {set: 'lucide', export: 'X', confidence: 'exact'},
          {set: 'lucide', export: 'X', confidence: 'likely'},
        ]),
      /listed twice/,
    ],
    [
      'a match with an unknown field',
      d =>
        (d.icons[0].matches = [
          {set: 'lucide', export: 'X', confidence: 'exact', note: 'x'},
        ]),
      /Unrecognized key/,
    ],
    [
      'an inverted weight range',
      d => (d.axes.weights = {range: {min: 3, max: 1}}),
      /range.min/,
    ],
  ])('rejects %s', (_label, change, message) => {
    expect(() => parseIconSetData(dataWith(change))).toThrow(message);
  });

  it('accepts reviewed matches with and without a variant', () => {
    const data = dataWith(d => {
      d.icons[0].matches = [
        {
          set: 'heroicons',
          export: 'XMarkIcon',
          variant: '24/outline',
          confidence: 'exact',
        },
        {set: 'lucide', export: 'X', confidence: 'likely'},
      ];
    });
    expect(parseIconSetData(data).icons[0].matches).toHaveLength(2);
  });

  it('accepts a weight inside a declared range', () => {
    const data = dataWith(d => {
      d.axes.weights = {range: {min: 0.5, max: 3}};
      d.default.weight = 2;
    });
    expect(parseIconSetData(data).default).toEqual({
      appearance: 'outline',
      size: 24,
      weight: 2,
    });
  });
});
