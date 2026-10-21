// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tooltip.a11y.known-failures.ts
 * @input The exact tooltip-contract failures the shipped Tooltip and useTooltip produce today
 * @output TOOLTIP_KNOWN_FAILURES — records both lanes reconcile against, so a fix shows up as an unexpected pass and any other failure stays a failure
 * @position Known-failure ledger for the Tooltip and useTooltip binding
 */

import type {KnownFailure} from '@astryxdesign/a11y-spec';
import {TOOLTIP_BINDING_STATES} from './Tooltip.a11y.states';

/**
 * Every attachment shares useTooltip's hover handling, so the one defect
 * fails the same row in every state. One record per state keeps each record
 * pinned to exactly one result.
 */
export const TOOLTIP_KNOWN_FAILURES: ReadonlyArray<KnownFailure> =
  TOOLTIP_BINDING_STATES.map(state => ({
    expectation: 'tooltip.hover.stays-while-hovered',
    binding: 'Tooltip',
    state: state.id,
    evidenceLayer: 'real-browser',
    failureEquals:
      'the tooltip disappeared when the pointer moved from the trigger onto the tooltip',
    standardsReference:
      'WCAG 2.2 1.4.13 Content on Hover or Focus (AA), Hoverable: "If pointer hover can trigger the additional content, then the pointer can be moved over the additional content without the additional content disappearing"; APG Tooltip: "it remains open as long as the cursor is over the trigger or the tooltip"',
    userImpact:
      'A mouse user who moves straight from the trigger onto the tooltip — one pointer step across the small gap, as a quick hand does — sees the tooltip vanish about a tenth of a second after the pointer arrives on it, so they cannot rest on it to read or magnify it. A slow move that pauses in the gap keeps it open.',
    reason:
      "useTooltip cancels its pending hide in the surface's React onMouseEnter, which React dispatches from the browser's mouseout, before the trigger's native mouseleave schedules that hide; when the pointer crosses in one step the hide is scheduled after the cancel and runs. Fixing it changes runtime behavior, so it ships as its own spec-backed patch; this test-only binding records it and changes nothing.",
  }));
