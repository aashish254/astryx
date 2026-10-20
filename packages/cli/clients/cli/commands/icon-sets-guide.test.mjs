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

  it('covers adding a set, its data file, generating it, checks, and how apps use it', async () => {
    const {status, stdout} = await runCli(['docs', GUIDE, '--full']);
    expect(status).toBe(0);
    for (const phrase of [
      'npx astryx integration add icon-set outline',
      '`matches`',
      '`confidence`',
      'tags.json',
      'invalid_icon_set',
      'icon_export_missing',
      'icon_theme_map_mismatch',
      'icon_source_version_drift',
      'icon_license_notice_missing',
      'npx astryx search delete --type icon',
      '`iconSet`',
    ]) {
      expect(stdout).toContain(phrase);
    }
  });
});
