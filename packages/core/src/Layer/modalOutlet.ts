// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file modalOutlet.ts
 * @input The open Dialog `<dialog>` elements
 * @output Exports useModalOutlet (a modal supplies its outlet),
 *   getActiveModalOutlet, subscribeModalOutlets (a global host follows the
 *   latest one), and notifyTopLayerEntry (a non-modal surface entered the
 *   top layer above the hosts)
 * @position Private layer infrastructure; spec:AST-003 FR18
 *
 * A native modal makes everything outside it inert and paints over every
 * earlier top-layer element. A passive global host (ToastViewport) therefore
 * has to live in the DOM of the latest open modal to stay visible and
 * operable. The registry is module-level because the top layer is
 * document-wide: a host rendered in a separate React root (the useToast
 * fallback) must see modals rendered by the app. Listeners run synchronously,
 * so a host can leave a modal before React removes it from the document.
 *
 * A non-modal top-layer surface (a `popover="manual"` host shown by
 * `showPopover()`, such as a `hasScrim={false}` BottomSheet) blocks nothing,
 * so it is not an outlet, but it still enters the top layer above the hosts
 * shown before it. It announces the entry here, and a host re-enters the top
 * layer in place so it paints above the surface again.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Toast/ToastViewport.modalHost.test.tsx
 * - /docs/architecture/layer-runtime.md
 */

import {useEffect, useLayoutEffect, type RefObject} from 'react';

const outlets: HTMLDialogElement[] = [];

/**
 * Why a host is told to place itself: `outlet` when the latest open modal
 * may have changed (the host moves into it or back out), `entry` when a
 * non-modal surface entered the top layer above the host (the host stays
 * where it is and re-enters the top layer).
 */
export type ModalOutletChange = 'outlet' | 'entry';

const listeners = new Set<(change: ModalOutletChange) => void>();

function notify(change: ModalOutletChange): void {
  for (const listener of listeners) {
    listener(change);
  }
}

function addOutlet(element: HTMLDialogElement): void {
  const index = outlets.indexOf(element);
  if (index !== -1) {
    outlets.splice(index, 1);
  }
  outlets.push(element);
  notify('outlet');
}

function removeOutlet(element: HTMLDialogElement): void {
  const index = outlets.indexOf(element);
  if (index === -1) {
    return;
  }
  outlets.splice(index, 1);
  notify('outlet');
}

/** The latest open native modal, or null when none is open. */
export function getActiveModalOutlet(): HTMLDialogElement | null {
  return outlets[outlets.length - 1] ?? null;
}

/**
 * Call `listener` whenever the latest open native modal may have changed
 * (`'outlet'`), or a non-modal surface entered the top layer (`'entry'`).
 */
export function subscribeModalOutlets(
  listener: (change: ModalOutletChange) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * A non-modal surface was just shown into the top layer (`showPopover()` on
 * a `popover="manual"` host). Global hosts re-enter the top layer so they
 * paint above it, as they do above a modal that just opened.
 */
export function notifyTopLayerEntry(): void {
  notify('entry');
}

/**
 * Supply `ref`'s `<dialog>` as the passive global outlet while it is an open
 * modal. Call it after the effect that runs `showModal()`, so the modal is
 * already in the top layer when global hosts move into it.
 */
export function useModalOutlet(
  ref: RefObject<HTMLDialogElement | null>,
  isActive: boolean,
): void {
  useEffect(() => {
    const element = ref.current;
    if (!isActive || element == null) {
      return;
    }
    // A native close (a `method="dialog"` form) ends the modal without a
    // render.
    const handleClose = () => {
      removeOutlet(element);
    };
    element.addEventListener('close', handleClose);
    addOutlet(element);
    return () => {
      element.removeEventListener('close', handleClose);
      removeOutlet(element);
    };
  }, [ref, isActive]);

  // Unmounting removes the dialog without a close event, and a passive
  // cleanup runs after React has detached it. A layout cleanup runs before,
  // so hosts leave while still in the document and keep their focus.
  useLayoutEffect(() => {
    const element = ref.current;
    return () => {
      if (element != null) {
        removeOutlet(element);
      }
    };
  }, [ref]);
}
