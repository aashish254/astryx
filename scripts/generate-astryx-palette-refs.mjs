#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.
/* global process */

/**
 * @file Generates Astryx's runtime-sized palette reference module from the
 * stops used by the committed core color mapping and the complete palette.
 * @input Astryx's core color mapping and committed full palette.
 * @output The selected private palette-reference module.
 * @position Repository maintenance command and core color drift guard.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  countSelectedRefs,
  createSelectedPaletteRefGenerator,
  syncOutputs,
} from './generate-selected-palette-refs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const MAPPING_SOURCE_REL =
  'packages/core/palette/astryxColorMappings.ts';
export const FULL_PALETTE_REL =
  'packages/core/palette/astryxPalettes.generated.ts';
export const SELECTED_REFS_REL =
  'packages/core/palette/astryxPaletteRefs.generated.ts';

const generator = createSelectedPaletteRefGenerator({
  themeDisplayName: 'Astryx',
  paletteRefsIdentifier: 'astryxPaletteRefs',
  themeSourceRel: MAPPING_SOURCE_REL,
  fullPaletteRel: FULL_PALETTE_REL,
  selectedRefsRel: SELECTED_REFS_REL,
  templateRefsRel: SELECTED_REFS_REL,
  regenerateCommand: 'pnpm generate:astryx-palette-refs',
});

export const parseFullPalette = generator.parseFullPalette;
export const discoverSelectedRefs = generator.discoverSelectedRefs;
export const renderSelectedRefs = generator.renderSelectedRefs;
export {countSelectedRefs, syncOutputs};

export function generateAstryxPaletteRefs({root = ROOT, check = false} = {}) {
  const source = fs.readFileSync(path.join(root, MAPPING_SOURCE_REL), 'utf-8');
  const palette = fs.readFileSync(path.join(root, FULL_PALETTE_REL), 'utf-8');
  const {content, selected} = renderSelectedRefs(source, palette);
  const outputs = [path.join(root, SELECTED_REFS_REL)];
  const problems = syncOutputs(content, outputs, {check});
  return {content, selected, outputs, problems};
}

function main() {
  const check = process.argv.includes('--check');
  const result = generateAstryxPaletteRefs({check});
  const count = countSelectedRefs(result.selected);

  if (check && result.problems.length > 0) {
    process.stderr.write(
      `\nAstryx selected palette refs are out of sync:\n` +
        result.problems
          .map(
            problem =>
              `  - ${path.relative(ROOT, problem.output)} ${problem.reason}`,
          )
          .join('\n') +
        `\nRun: pnpm generate:astryx-palette-refs\n\n`,
    );
    return 1;
  }

  if (check) {
    process.stdout.write(
      `Astryx selected palette refs are in sync (${count} stops).\n`,
    );
  } else {
    for (const output of result.outputs) {
      process.stdout.write(`Wrote ${path.relative(ROOT, output)}\n`);
    }
    process.stdout.write(`Selected ${count} referenced palette stops.\n`);
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  process.exit(main());
}
