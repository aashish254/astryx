// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';

import {runnerCommandsIn} from './runner-commands.mjs';

describe('runnerCommandsIn', () => {
  it('finds an Astryx command after a project runner, with the bare command', () => {
    expect(runnerCommandsIn('Run `pnpm exec astryx docs theme`.')).toEqual([
      {written: 'pnpm exec astryx docs', bare: 'astryx docs', download: false},
    ]);
    expect(runnerCommandsIn('yarn astryx component Button')).toEqual([
      {
        written: 'yarn astryx component',
        bare: 'astryx component',
        download: false,
      },
    ]);
  });

  it('always flags the unscoped name after a download runner, even alone', () => {
    expect(runnerCommandsIn('npx astryx doctor; or `bunx astryx`')).toEqual([
      {written: 'npx astryx doctor', bare: 'astryx doctor', download: true},
      {written: 'bunx astryx', bare: 'astryx', download: true},
    ]);
  });

  it('leaves the scoped package, a project runner named alone, and other tools', () => {
    expect(
      runnerCommandsIn(
        'Install with `npx @astryxdesign/cli init`. Run it through Yarn (`yarn astryx`). Format with `npx prettier --write`. `npx astryx-tools init`.',
      ),
    ).toEqual([]);
  });
});
