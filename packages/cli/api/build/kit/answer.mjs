// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The build.kit response, from a request's signals (signals.mjs) and the
 * blocks to name. With build's own blocks it is the kit build has always
 * given; another list changes only the blocks, never their count.
 * @input {@link import('./signals.mjs').KitSignals} and block names
 * @output the build.kit response
 * @position api/build/kit, beside signals.mjs; the main searcher in tree.mjs
 *   calls it with the block picker's list.
 */

import {FOUNDATION, FRAME} from './signals.mjs';

/**
 * Fewer offerable results than this and the kit says how to look further.
 *
 * Three is the point below which a kit stops being a starting point. An agent
 * that reads a near-empty kit does not conclude "my wording was wrong" — it
 * concludes the package has nothing and falls back on its own memory of what
 * Astryx contains, which is exactly the failure `build` exists to prevent.
 */
const THIN_KIT = 3;

/** The reason a block search did not return carries. */
const PICKED = 'fits the words of the idea';

/**
 * @typedef {import('../../search/search.type.mjs').SearchResultEntry} SearchResultEntry
 */

/**
 * A block search did not return, named the way search names a block.
 * @param {import('../_adapter.mjs').BlockTemplate} b
 * @returns {SearchResultEntry}
 */
const asBlock = b => ({
  domain: 'template',
  name: b.name,
  package: b.package,
  score: 0,
  reason: PICKED,
  description: b.description,
  displayName: b.displayName,
  kind: 'block',
  command: b.command,
});

/**
 * The kit for a request. `blocks` names the blocks to list, best first: at
 * most as many as build names itself are kept, and a name that is not a block
 * the project can scaffold is dropped. A block in the slot build gave it
 * keeps build's entry; another block search returned keeps search's.
 *
 * @param {import('./signals.mjs').KitSignals} signals
 * @param {string[]} [blocks] block names; build's own when omitted
 * @returns {import('../build.type.mjs').BuildKitResponse}
 */
export function kitAnswer(signals, blocks = signals.kitBlocks) {
  const named = blocks.slice(0, signals.blocks.length).flatMap((name, k) => {
    // A block in the slot build gave it keeps build's own entry.
    if (signals.blocks[k]?.name === name) return [signals.blocks[k]];
    const found = signals.searchedEntries.get(name);
    if (found) return [found];
    const b = signals.blockCatalog.find(t => t.name === name);
    return b ? [asBlock(b)] : [];
  });

  // What to try when the kit comes back thin. Keyword search over a design
  // system misses in a predictable way — the reader's words and the package's
  // often do not overlap — so name the two commands that browse rather than
  // search, and say plainly that this is not semantic matching.
  //
  // STRUCTURED, not prose: `commands` are bare subcommands, because the API
  // cannot know how the caller invokes the CLI. Baking `astryx component
  // --list` into the text hands a pnpm-workspace reader a command that does
  // not resolve — the same defect `getCliInvocation` exists to prevent, and
  // the renderer applies it. A JSON caller gets the parts, not a sentence.
  const hint =
    signals.pages.length + named.length + signals.domain.length < THIN_KIT
      ? {
          reason:
            'Few matches. This is keyword search, not semantic — try other wordings.',
          commands: ['component --list', 'template --list'],
        }
      : undefined;

  return {
    type: 'build.kit',
    data: {
      query: signals.query,
      // Distinguishes "search found nothing" from a weak-but-non-empty result
      // set. Either way the kit still names a template to start from.
      hasResults: signals.matchCount > 0,
      matchCount: signals.matchCount,
      directMatch: signals.directMatch,
      start: signals.start,
      pages: signals.pages,
      blocks: named,
      domain: signals.domain,
      frame: FRAME,
      foundation: FOUNDATION,
      hint,
    },
  };
}
