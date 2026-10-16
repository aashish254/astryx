// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollLockGutter.stylex.ts
 * @input The `--astryx-scroll-lock-gutter` custom property useScrollLock
 *   publishes on the root while it hides a space-taking scrollbar
 * @output Exports the one StyleX-readable reference to that width
 * @position Hook-adjacent geometry; read by chrome that is positioned against
 *   the viewport's right edge and must not move when a scroll lock widens
 *   the viewport (the toast viewport)
 *
 * `defineConsts`, not a plain exported string: StyleX inlines a cross-file
 * value only through `defineVars`/`defineConsts` from a `.stylex.ts` file.
 * The property name is spelled out here rather than imported from
 * useScrollLock.ts for the same reason; useScrollLock.test.ts holds the two
 * together.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/hooks/useScrollLock.ts
 * - /packages/core/src/hooks/useScrollLock.test.ts
 * - /packages/core/src/Toast/ToastViewport.tsx
 */

import * as stylex from '@stylexjs/stylex';

export const scrollLockGutter = stylex.defineConsts({
  /**
   * Width the hidden document scrollbar took at the viewport's right edge,
   * `0px` whenever nothing is locked or the scrollbar takes no space. Add it
   * to a right inset inside a `calc()`.
   */
  width: 'var(--astryx-scroll-lock-gutter, 0px)',
});
