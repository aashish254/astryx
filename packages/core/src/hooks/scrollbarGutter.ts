// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scrollbarGutter.ts
 * @input The element being pinned and its document's pre-lock viewport geometry
 * @output Reference-counted holds for the background layout viewport
 * @position Shared scroll-lock geometry; native top-layer surfaces remain in the
 *   full window, while ordinary fixed and in-flow page content keep their width
 *
 * A native stable root gutter clips PAINT, including the top layer. Enlarging a
 * dialog's rectangle over that gutter does not paint its pixels there. Instead,
 * while the body is pinned, a viewport-height layout-contained root reproduces
 * the old fixed containing block without reserving a native scrollbar gutter.
 * Top-layer elements escape this containing block by browser definition.
 *
 * Only a space-taking scrollbar activates this temporary layout boundary.
 * Overlay-scrollbar and non-scrolling pages retain their original root styles.
 * The measured physical edges also handle left and both-edge reservations.
 *
 * SYNC: When modified, update scrollbarGutter tests and ScrollLock stories.
 */

export interface ScrollbarGutterHold {
  /** Whether this hold recreates a background viewport for classic scrollbars. */
  readonly hasReservation: boolean;
  /** Call once, immediately after pinning the body. */
  settle(): void;
  /** Release after undoing the pin. The last owner restores the root. */
  release(): void;
}

const NOOP: ScrollbarGutterHold = {
  hasReservation: false,
  settle() {},
  release() {},
};
interface RootHold {
  hasReservation: boolean;
  count: number;
  settle(): void;
  restore(): void;
}
const holds = new WeakMap<Document, RootHold>();

/** A manual popover measures the actual viewport, independent of page transforms. */
function viewportRect(doc: Document): DOMRect {
  const probe = doc.createElement('div');
  Object.assign(probe.style, {
    all: 'initial',
    position: 'fixed',
    inset: '0',
    margin: '0',
    padding: '0',
    border: '0',
    width: 'auto',
    height: '0',
    maxWidth: 'none',
    visibility: 'hidden',
    pointerEvents: 'none',
  });
  const topLayer = typeof probe.showPopover === 'function';
  if (topLayer) {
    probe.popover = 'manual';
  }
  doc.body.append(probe);
  try {
    if (topLayer) {
      probe.showPopover();
    }
    return probe.getBoundingClientRect();
  } finally {
    probe.remove();
  }
}

function acquireRoot(doc: Document, view: Window): RootHold {
  const existing = holds.get(doc);
  if (existing) {
    existing.count += 1;
    return existing;
  }
  const root = doc.documentElement;
  const computed = view.getComputedStyle(root);
  const hasReservation =
    view.innerWidth > root.clientWidth ||
    computed.getPropertyValue('scrollbar-gutter').includes('stable');
  const rect = hasReservation ? viewportRect(doc) : null;
  // Zero means no layout engine (for example jsdom), not a window-wide gutter.
  const left = rect && rect.width > 0 ? Math.max(0, rect.left) : 0;
  const right =
    rect && rect.width > 0 ? Math.max(0, view.innerWidth - rect.right) : 0;
  const border = {
    left: Number.parseFloat(computed.borderLeftWidth) || 0,
    right: Number.parseFloat(computed.borderRightWidth) || 0,
    top: Number.parseFloat(computed.borderTopWidth) || 0,
    bottom: Number.parseFloat(computed.borderBottomWidth) || 0,
  };
  const saved = new Map<string, {value: string; priority: string}>();
  let settled = false;
  const set = (name: string, value: string) => {
    saved.set(name, {
      value: root.style.getPropertyValue(name),
      priority: root.style.getPropertyPriority(name),
    });
    root.style.setProperty(name, value, 'important');
  };
  const hold: RootHold = {
    hasReservation: left + right > 0,
    count: 1,
    settle() {
      if (settled || left + right === 0) {
        return;
      }
      settled = true;
      const contain = computed.contain;
      set('scrollbar-gutter', 'auto');
      set(
        'contain',
        !contain || contain === 'none'
          ? 'layout'
          : /\b(layout|content|strict)\b/.test(contain)
            ? contain
            : `${contain} layout`,
      );
      set('box-sizing', 'border-box');
      // A fixed descendant uses the root's padding box. Offset its border box
      // so that padding box is exactly the old viewport, even with root borders.
      set('position', 'fixed');
      set('top', `${-border.top}px`);
      set('left', `${left - border.left}px`);
      set('right', `${right - border.right}px`);
      set('width', 'auto');
      set('min-width', '0');
      set('max-width', 'none');
      set(
        'height',
        border.top + border.bottom === 0
          ? '100dvh'
          : `calc(100dvh + ${border.top + border.bottom}px)`,
      );
      set('min-height', '0');
      set('max-height', 'none');
      // Snapshot all four before writing the shorthand; a shorthand write can
      // otherwise erase independently authored longhands and priorities.
      for (const name of [
        'margin-top',
        'margin-right',
        'margin-bottom',
        'margin-left',
      ]) {
        saved.set(name, {
          value: root.style.getPropertyValue(name),
          priority: root.style.getPropertyPriority(name),
        });
      }
      set('margin', '0');
    },
    restore() {
      hold.count -= 1;
      if (hold.count > 0) {
        return;
      }
      // Clear the shorthand first, then restore it and any originally authored
      // sides. Removing it after restoring the sides would erase those sides.
      const margin = saved.get('margin');
      if (margin) {
        root.style.removeProperty('margin');
        if (margin.value) {
          root.style.setProperty('margin', margin.value, margin.priority);
        }
      }
      for (const [name, previous] of saved) {
        if (name === 'margin') {
          continue;
        }
        if (previous.value) {
          root.style.setProperty(name, previous.value, previous.priority);
        } else {
          root.style.removeProperty(name);
        }
      }
      holds.delete(doc);
    },
  };
  holds.set(doc, hold);
  return hold;
}

/** Acquire before pinning, settle synchronously after pinning, then release once. */
export function holdScrollbarGutter(element: HTMLElement): ScrollbarGutterHold {
  const doc = element.ownerDocument;
  if (!doc.defaultView || doc.documentElement.clientWidth === 0) {
    return NOOP;
  }
  const hold = acquireRoot(doc, doc.defaultView);
  let released = false;
  return {
    hasReservation: hold.hasReservation,
    settle() {
      if (!released) {
        hold.settle();
      }
    },
    release() {
      if (!released) {
        released = true;
        hold.restore();
      }
    },
  };
}
