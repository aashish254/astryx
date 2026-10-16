// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useScrollLock.doc.mjs
 * @input The public useScrollLock boolean and shared modal lock lifetime
 * @output Consumer guidance for stable background scrolling and modal coverage
 * @position Hook documentation, including its compact CLI projection
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
      'Locks body scroll when active by pinning the body with position: fixed, including on iOS Safari. On platforms with space-taking scrollbars, the background content and viewport-fixed chrome keep their geometry while native modal surfaces can cover the full window. Concurrent locks share one scroll snapshot; the original styles and scroll position are restored after the final lock ends.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use when opening full-screen modals or dialogs to prevent background content from scrolling.',
      },
      {
        guidance: true,
        description:
          'Keep isLocked true while the modal is visibly present, including its exit transition.',
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
    'Pins body scroll, including on iOS Safari. Preserves background content and fixed chrome on classic-scrollbar platforms while modals cover the full window. Concurrent locks share one snapshot; the final release restores styles and scroll position.',
  paramDescriptions: {
    isLocked: 'whether body scroll should be locked.',
  },
  usage: {
    description:
      'Pins body scroll, including on iOS Safari. Preserves background content and fixed chrome on classic-scrollbar platforms while modals cover the full window. Concurrent locks share one snapshot; the final release restores styles and scroll position.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use when opening full-screen modals / dialogs to prevent background content from scrolling.',
      },
      {
        guidance: true,
        description: 'Keep isLocked true through the visible modal exit.',
      },
      {
        guidance: false,
        description:
          'Use for non-modal overlays like popovers / tooltips; users should be able to scroll away from those.',
      },
    ],
  },
};
