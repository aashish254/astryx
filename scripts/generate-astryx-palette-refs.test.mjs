// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Focused tests for Astryx's core selected palette-reference wrapper.
 * @input Core color mapping references, palette config, and full-palette literals.
 * @output Proof that generation is reproducible and selected refs stay synchronized.
 * @position Regression coverage for generate-astryx-palette-refs.mjs.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {themePaletteGenerate} from '../packages/cli/api/theme/palette/generate/generate.mjs';
import {assertPaletteReceiptsMatch} from './palette-receipt-test-utils.mjs';
import {
  FULL_PALETTE_REL,
  MAPPING_SOURCE_REL,
  SELECTED_REFS_REL,
  countSelectedRefs,
  generateAstryxPaletteRefs,
} from './generate-astryx-palette-refs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FULL_PALETTE = `export const palette = {
  blue: {
    name: 'Blue',
    light: {25: '#112233', 80: '#445566'},
    dark: {25: '#778899', 80: '#aabbcc'},
  },
  neutral: {
    name: 'Neutral',
    light: {100: '#ffffff'},
    dark: {15: '#222222'},
  },
} as const;
`;

const MAPPING_SOURCE = `
const {blue, neutral} = astryxPaletteRefs;
export const mappings = {
  first: [blue.light[25], blue.dark[80]],
  repeated: [blue.light[25], blue.dark[80]],
  surface: [neutral.light[100], neutral.dark[15]],
};
`;

describe('Astryx selected palette ref generation', () => {
  it('reproduces the committed full palette and receipt from its config', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-core-palette-'));
    try {
      fs.copyFileSync(
        path.join(ROOT, 'packages/core/palette.config.json'),
        path.join(temp, 'palette.config.json'),
      );
      themePaletteGenerate(
        'palette.config.json',
        {
          out: 'astryxPalettes.generated.ts',
          preview: 'astryx-palette-preview.html',
        },
        {cwd: temp},
      );

      const generated = fs.readFileSync(
        path.join(temp, 'astryxPalettes.generated.ts'),
        'utf8',
      );
      const committed = fs
        .readFileSync(path.join(ROOT, FULL_PALETTE_REL), 'utf8')
        .replace(
          '// Copyright (c) Meta Platforms, Inc. and affiliates.\n\n',
          '',
        );
      expect(generated).toBe(committed);
      assertPaletteReceiptsMatch(
        JSON.parse(
          fs.readFileSync(
            path.join(temp, 'astryxPalettes.generated.receipt.json'),
            'utf8',
          ),
        ),
        JSON.parse(
          fs.readFileSync(
            path.join(
              ROOT,
              'packages/core/palette/astryxPalettes.generated.receipt.json',
            ),
            'utf8',
          ),
        ),
      );
    } finally {
      fs.rmSync(temp, {recursive: true, force: true});
    }
  });

  it('projects only referenced stops and detects stale output', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-core-refs-'));
    try {
      const mappingSource = path.join(root, MAPPING_SOURCE_REL);
      const fullPalette = path.join(root, FULL_PALETTE_REL);
      fs.mkdirSync(path.dirname(mappingSource), {recursive: true});
      fs.writeFileSync(mappingSource, MAPPING_SOURCE);
      fs.writeFileSync(fullPalette, FULL_PALETTE);

      const generated = generateAstryxPaletteRefs({root});
      expect(countSelectedRefs(generated.selected)).toBe(4);
      expect(generated.outputs).toEqual([path.join(root, SELECTED_REFS_REL)]);
      expect(generated.content).toContain(
        "// Generated from the committed full palette for the stops used by Astryx's",
      );
      expect(generated.content).toContain(
        '// theme source. Regenerate with `pnpm generate:astryx-palette-refs`.',
      );
      expect(generated.content).toContain('export const astryxPaletteRefs = {');
      expect(fs.readFileSync(generated.outputs[0], 'utf-8')).toBe(
        generated.content,
      );
      expect(generateAstryxPaletteRefs({root, check: true}).problems).toEqual(
        [],
      );

      fs.appendFileSync(generated.outputs[0], '// stale\n');
      expect(generateAstryxPaletteRefs({root, check: true}).problems).toEqual([
        {output: generated.outputs[0], reason: 'differs'},
      ]);
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

  it('keeps the committed selected projection synchronized', () => {
    const result = generateAstryxPaletteRefs({root: ROOT, check: true});
    expect(result.problems).toEqual([]);
    expect(countSelectedRefs(result.selected)).toBe(93);
  });
});
