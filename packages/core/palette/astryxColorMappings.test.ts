// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Guards the relationship between core color defaults and named palette stops.
 * @input Committed core color defaults and the private Astryx color mapping.
 * @output Proof that every core color role resolves to its reviewed Light/Dark stops.
 * @position Regression coverage for the default Astryx color system.
 */

import {describe, expect, it} from 'vitest';
import {astryxColorMappings} from './astryxColorMappings';
import {colorDefaults} from './tokens.stylex';

describe('Astryx core color mappings', () => {
  it('maps every core color role and no unrelated tokens', () => {
    expect(Object.keys(astryxColorMappings)).toEqual(
      Object.keys(colorDefaults),
    );
  });

  it('keeps StyleX defaults synchronized with the reviewed palette stops', () => {
    for (const [token, [light, dark]] of Object.entries(astryxColorMappings)) {
      expect(
        colorDefaults[token as keyof typeof colorDefaults].toLowerCase(),
        token,
      ).toBe(`light-dark(${light}, ${dark})`);
    }
  });
});
