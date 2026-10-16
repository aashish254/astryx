// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useScrollLock',
  displayName: 'useScrollLock',
  keywords: ['scroll', 'lock', 'modal', 'dialog', 'body', 'prevent', 'background', 'ios', 'safari', 'fixed', 'scrollbar', 'gutter', 'layout shift', 'reflow', 'astryx-scrollbar-gutter'],
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
      'Locks body scroll when active by pinning the body with position: fixed. This prevents background scrolling behind modals and dialogs, which is necessary for iOS Safari where overscroll-behavior: contain does not work. Restores the original scroll position when unlocked. Pinning hides the document scrollbar. Where that scrollbar takes layout space (desktop), the hook pads the body by the width the page grew so content does not shift sideways, and publishes that width on <html> as --astryx-scrollbar-gutter for the duration of the lock. The viewport keeps the full window width, so a modal surface and its scrim reach the window edge. position: fixed chrome anchored to the window\'s right edge stays still by adding the property to its offset: right: calc(16px + var(--astryx-scrollbar-gutter, 0px)). Astryx\'s own ToastViewport and ChatLayout dock already do.',
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
    'Locks body scroll when active by pinning body w/ position: fixed. Prevents background scrolling behind modals + dialogs, necessary for iOS Safari where overscroll-behavior: contain does not work. Restores original scroll position when unlocked. Where the hidden scrollbar took layout space, pads body by the measured growth (page does not shift) + publishes it on <html> as --astryx-scrollbar-gutter; viewport keeps full window width so modal surfaces + scrims reach the window edge. position: fixed chrome anchored to the window\'s right edge stays still via right: calc(16px + var(--astryx-scrollbar-gutter, 0px)); ToastViewport + ChatLayout dock already do.',
  paramDescriptions: {
    isLocked: 'whether body scroll should be locked.',
  },
  usage: {
    description:
      'Locks body scroll when active by pinning body w/ position: fixed. Prevents background scrolling behind modals + dialogs, necessary for iOS Safari where overscroll-behavior: contain does not work. Restores original scroll position when unlocked. Where the hidden scrollbar took layout space, pads body by the measured growth (page does not shift) + publishes it on <html> as --astryx-scrollbar-gutter; viewport keeps full window width so modal surfaces + scrims reach the window edge. position: fixed chrome anchored to the window\'s right edge stays still via right: calc(16px + var(--astryx-scrollbar-gutter, 0px)); ToastViewport + ChatLayout dock already do.',
    bestPractices: [
      { guidance: true, description: 'Use when opening full-screen modals / dialogs to prevent background content from scrolling.' },
      { guidance: true, description: 'Pass same boolean that controls dialog visibility (e.g. isOpen) as isLocked parameter.' },
      { guidance: false, description: 'Use for non-modal overlays like popovers / tooltips; users should be able to scroll away from those.' },
    ],
  },
};
