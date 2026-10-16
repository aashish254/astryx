// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollbarGutter.ts
 * @input The locked element and its document's pre-lock fixed viewport geometry
 * @output A background layout reservation independent of the modal paint viewport
 * @position Private geometry resource owned by the shared scroll-lock lifetime
 *
 * A root scrollbar-gutter clips PAINT and hit testing, including the top layer.
 * Negative overlay offsets can enlarge a dialog's rect but cannot paint into
 * that gutter. Instead, while locked, a viewport-height layout containment on
 * the root retains the background's old containing block. Native top-layer
 * dialogs escape that containment and use the full window. Nothing is added on
 * platforms whose scrollbars take no space.
 *
 * The physical margins follow the platform scrollbar, not text direction.
 * CSS percentages keep the reserved width responsive without resize observers.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/hooks/scrollLock.ts
 * - /packages/core/src/hooks/scrollbarGutter.test.ts
 * - /packages/core/src/Toast/ToastViewport.tsx
 * - /.github/scripts/scroll-lock-gutter.mjs
 */

export interface ScrollbarGutterHold {
  /** Root layout containment needs the body pinned to preserve its scroll offset. */
  readonly requiresBodyPin: boolean;
  /** Apply after the caller's scroll lock; no frame may paint between them. */
  settle(): void;
  /** Restore every owned root declaration after the final scroll lock. */
  release(): void;
}

const NOOP: ScrollbarGutterHold = {
  requiresBodyPin: false,
  settle() {},
  release() {},
};

const ROOT_PROPERTIES = [
  'scrollbar-gutter',
  'contain',
  'width',
  'height',
  'min-height',
  'margin-left',
  'margin-right',
  'box-sizing',
  '--_astryx-scroll-lock-left',
  '--_astryx-scroll-lock-right',
] as const;

/** Measure the fixed containing block, not html.clientWidth's special viewport value. */
function fixedViewport(document: Document): DOMRect {
  const probe = document.createElement('div');
  probe.style.cssText =
    'all:initial;position:fixed;inset:0;width:auto;height:auto;' +
    'min-width:0;min-height:0;max-width:none;max-height:none;' +
    'margin:0;padding:0;border:0;visibility:hidden;pointer-events:none;';
  document.documentElement.appendChild(probe);
  const rect = probe.getBoundingClientRect();
  probe.remove();
  return rect;
}

/**
 * Preserve the page's original fixed-position containing block without leaving
 * an unpaintable gutter in the window. The shared lock calls this only once.
 */
export function holdScrollbarGutter(element: HTMLElement): ScrollbarGutterHold {
  const document = element.ownerDocument;
  const window = document.defaultView;
  const root = document.documentElement;
  if (!window || root.clientWidth === 0) {
    return NOOP;
  }

  const viewport = fixedViewport(document);
  if (viewport.width === 0) {
    return NOOP;
  }
  const left = Math.max(0, viewport.left);
  const right = Math.max(0, window.innerWidth - viewport.right);
  if (left + right === 0) {
    return NOOP;
  }

  const saved = ROOT_PROPERTIES.map(property => ({
    property,
    value: root.style.getPropertyValue(property),
    priority: root.style.getPropertyPriority(property),
  }));
  const contain = window.getComputedStyle(root).contain || '';
  const layoutContain =
    contain === 'strict' || contain === 'content' || contain.includes('layout')
      ? contain
      : contain === 'none' || !contain
        ? 'layout'
        : `${contain} layout`;
  const bottom = Math.max(0, window.innerHeight - viewport.bottom);
  let settled = false;
  let released = false;

  return {
    requiresBodyPin: true,
    settle() {
      if (settled || released) {
        return;
      }
      settled = true;
      // Layout containment, not paint containment: only the background keeps
      // the old width. The native top layer retains its actual window bounds.
      const values = {
        'scrollbar-gutter': 'auto',
        contain: layoutContain,
        width: `calc(100% - ${left + right}px)`,
        height: `calc(100dvh - ${bottom}px)`,
        'min-height': '0',
        'margin-left': `${left}px`,
        'margin-right': `${right}px`,
        'box-sizing': 'border-box',
        // A background ToastViewport is itself in the top layer. It escapes
        // root layout containment and explicitly keeps the background budget.
        '--_astryx-scroll-lock-left': `${left}px`,
        '--_astryx-scroll-lock-right': `${right}px`,
      };
      for (const property of ROOT_PROPERTIES) {
        root.style.setProperty(property, values[property], 'important');
      }
    },
    release() {
      if (released) {
        return;
      }
      released = true;
      if (!settled) {
        return;
      }
      for (const {property, value, priority} of saved) {
        if (value) {
          root.style.setProperty(property, value, priority);
        } else {
          root.style.removeProperty(property);
        }
      }
    },
  };
}
