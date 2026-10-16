// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useScrollLock',
  displayName: 'useScrollLock',
  keywords: ['scroll', 'lock', 'modal', 'dialog', 'body', 'prevent', 'background', 'ios', 'safari', 'fixed', 'scrollbar', 'gutter', 'layout shift', 'reflow'],
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
      'Locks body scroll when active by pinning the body with position: fixed. This prevents background scrolling behind modals and dialogs, which is necessary for iOS Safari where overscroll-behavior: contain does not work. Restores the original scroll position when unlocked. Pinning hides the document scrollbar. Where that scrollbar takes layout space (desktop), the viewport grows by its width so modal surfaces and their backdrops reach the window edge, and the pinned body is inset from the right edge by the same width so the page behind does not shift sideways. That width is published on the root as --astryx-scroll-lock-gutter for the duration of the lock; position: fixed or top-layer chrome aligned to the viewport\'s right edge adds var(--astryx-scroll-lock-gutter, 0px) to its right inset to stay put, as the toast viewport does.',
    bestPractices: [
      { guidance: true, description: 'Use when opening full-screen modals or dialogs to prevent background content from scrolling.' },
      { guidance: true, description: 'Pass the same boolean that controls dialog visibility (e.g., isOpen) as the isLocked parameter.' },
      { guidance: false, description: 'Use for non-modal overlays like popovers or tooltips; users should be able to scroll away from those.' },
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
    'Locks body scroll when active by pinning body w/ position: fixed. Prevents background scrolling behind modals + dialogs, necessary for iOS Safari where overscroll-behavior: contain does not work. Restores original scroll position when unlocked. Hiding a space-taking scrollbar widens the viewport so modal surfaces reach the window edge; the body is inset by that width so the page does not shift. Width published as --astryx-scroll-lock-gutter; right-edge fixed/top-layer chrome adds var(--astryx-scroll-lock-gutter, 0px) to its right inset to stay put.',
  paramDescriptions: {
    isLocked: 'whether body scroll should be locked.',
  },
  usage: {
    description:
      'Locks body scroll when active by pinning body w/ position: fixed. Prevents background scrolling behind modals + dialogs, necessary for iOS Safari where overscroll-behavior: contain does not work. Restores original scroll position when unlocked. Hiding a space-taking scrollbar widens the viewport so modal surfaces reach the window edge; the body is inset by that width so the page does not shift. Width published as --astryx-scroll-lock-gutter; right-edge fixed/top-layer chrome adds var(--astryx-scroll-lock-gutter, 0px) to its right inset to stay put.',
    bestPractices: [
      { guidance: true, description: 'Use when opening full-screen modals / dialogs to prevent background content from scrolling.' },
      { guidance: true, description: 'Pass same boolean that controls dialog visibility (e.g. isOpen) as isLocked parameter.' },
      { guidance: false, description: 'Use for non-modal overlays like popovers / tooltips; users should be able to scroll away from those.' },
    ],
  },
};
