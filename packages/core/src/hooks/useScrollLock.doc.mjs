// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useScrollLock.doc.mjs
 * @input Shared body-lock lifetime and background-layout preservation
 * @output Consumer guidance for scroll-lock composition and visible exits
 * @position Hook documentation; the private viewport compensation is not public API
 */

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useScrollLock',
  displayName: 'useScrollLock',
  keywords: [
    'scroll',
    'lock',
    'modal',
    'dialog',
    'body',
    'prevent',
    'background',
    'ios',
    'safari',
    'fixed',
    'scrollbar',
    'gutter',
    'layout shift',
    'reflow',
  ],
  params: [
    {
      name: 'isLocked',
      type: 'boolean',
      description: 'whether body scroll should be locked.',
      required: true,
    },
  ],
  returns: [],
  usage: {
    description:
      'Locks body scroll while active and restores the original scroll position when the final overlapping lock ends. Classic-scrollbar pages retain their background containing-block width and fixed chrome without reserving an unpaintable strip beside native modal surfaces. The body remains pinned for mobile scroll containment. Author-defined stable root gutters combined with viewport-unit-based background sizing remain a compatibility limitation.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use when opening full-screen modals or dialogs to prevent background content from scrolling.',
      },
      {
        guidance: true,
        description:
          'Keep the lock active while the modal is visible, including its exit animation; overlapping locks release the page only after the last one closes.',
      },
      {
        guidance: false,
        description:
          'Use for non-modal overlays like popovers or tooltips; users should be able to scroll away from those.',
      },
    ],
  },
  relatedComponents: ['Dialog'],
  relatedHooks: ['useFocusTrap'],
  importPath: '@astryxdesign/core/hooks',
  category: 'layout',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Pins body scroll while active; the final overlapping lock restores scroll and styles. Preserves background containing-block width and fixed chrome while native modals reach the window edge. Author-stable root gutters with viewport-unit background sizing remain a compatibility limitation.',
  paramDescriptions: {
    isLocked: 'whether body scroll should be locked.',
  },
  usage: {
    description:
      'Pins body scroll while active; the final overlapping lock restores scroll and styles. Preserves background containing-block width and fixed chrome while native modals reach the window edge. Author-stable root gutters with viewport-unit background sizing remain a compatibility limitation.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use when opening full-screen modals / dialogs to prevent background content from scrolling.',
      },
      {
        guidance: true,
        description:
          'Keep locked through the visible exit; overlapping locks release only after the last closes.',
      },
      {
        guidance: false,
        description:
          'Use for non-modal overlays like popovers / tooltips; users should be able to scroll away from those.',
      },
    ],
  },
};
