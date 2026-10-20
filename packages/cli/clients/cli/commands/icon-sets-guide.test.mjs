// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The icon-set authoring guide is findable and readable: a search for
 * the words an author types opens it first, and each section reads on its own.
 */

import {describe, expect, it} from 'vitest';
import {runCli} from '../../../test-utils/run-cli.mjs';

const GUIDE = 'cli/integrations/building-blocks/icon-sets';

describe('icon-set authoring guide', () => {
  it.each(['icon set', 'add icons', 'ship icons'])(
    'search "%s" finds the guide first',
    async query => {
      const {status, stdout} = await runCli([
        'search',
        query,
        '--type',
        'doc',
        '--json',
      ]);
      expect(status).toBe(0);
      expect(JSON.parse(stdout).data.results[0].name).toBe(GUIDE);
    },
  );

  it('covers adding a set, adding icons, the export contract, library shapes, checks, and how apps use it', async () => {
    const {status, stdout} = await runCli(['docs', GUIDE, '--full']);
    expect(status).toBe(0);
    for (const phrase of [
      'npx astryx integration add icon-set outline',
      'npx astryx icon add Bin --from @acme/glyph-library --definition delete',
      '--new-definition',
      'astryx docs icon-definitions',
      'icon_builtin_definition_missing',
      'icon_definition_missing',
      'icon_module_not_public',
      'icon_not_component',
      'icon_theme_map_unchecked',
      'adapter',
      '`iconSet`',
    ]) {
      expect(stdout).toContain(phrase);
    }
  });
});
