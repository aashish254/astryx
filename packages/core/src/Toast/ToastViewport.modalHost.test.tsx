// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ToastViewport.modalHost.test.tsx
 * @input Uses vitest, @testing-library/react, ToastViewport, useToast,
 *   Dialog, BottomSheet
 * @output Tests that a top-layer ToastViewport moves into the latest open
 *   native modal and back without remounting its toasts, and re-enters the
 *   top layer above a non-modal sheet shown after it
 * @position Testing; validates ToastViewport.tsx with Layer/modalOutlet.ts
 *
 * SYNC: When ToastViewport hosting or Layer/modalOutlet.ts changes, update
 *   these tests. jsdom has no top layer: paint order and hit testing above the
 *   modal need a real browser (see the Core/Toast AppToastOverDialog story).
 */

import {useState, type ReactNode} from 'react';
import {describe, it, expect, vi, afterEach, beforeEach} from 'vitest';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {ToastViewport} from './ToastViewport';
import {useToast} from './useToast';
import {Dialog} from '../Dialog';
import {BottomSheet} from '../BottomSheet';
import type {ToastDismissReason} from './types';

// jsdom does not implement the native modal methods.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function ToastButton({label = 'Show toast'}: {label?: string}) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast({body: 'Saved'})}>
      {label}
    </button>
  );
}

function DialogFixture({
  label,
  children,
}: {
  label: string;
  children?: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(open => !open)}>
        {`Toggle ${label}`}
      </button>
      <Dialog isOpen={isOpen} onOpenChange={setIsOpen} aria-label={label}>
        <button type="button" onClick={() => setIsOpen(false)}>
          {`Close ${label}`}
        </button>
        {children}
      </Dialog>
    </>
  );
}

function NonModalSheetFixture({label}: {label: string}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(open => !open)}>
        {`Toggle ${label}`}
      </button>
      <BottomSheet
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        hasScrim={false}
        label={label}>
        <ToastButton label={`Show toast in ${label}`} />
      </BottomSheet>
    </>
  );
}

function getDialog(label: string): HTMLDialogElement {
  return document.querySelector<HTMLDialogElement>(
    `dialog[aria-label="${label}"]`,
  )!;
}

function getViewport(): HTMLElement {
  // A non-modal BottomSheet is a manual popover too; the viewport is the one
  // that is not a dialog.
  return document.querySelector<HTMLElement>('[popover="manual"]:not(dialog)')!;
}

function TimedToastButton({
  onHide,
}: {
  onHide: (reason: ToastDismissReason) => void;
}) {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() => toast({body: 'Saved', autoHideDuration: 5000, onHide})}>
      Show timed toast
    </button>
  );
}

function UnmountFixture() {
  const [isMounted, setIsMounted] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setIsMounted(false)}>
        Unmount
      </button>
      {isMounted ? (
        <Dialog isOpen onOpenChange={() => {}} aria-label="Edit">
          <ToastButton />
        </Dialog>
      ) : null}
    </>
  );
}

describe('ToastViewport modal hosting', () => {
  it('moves into an open Dialog and back when it closes, keeping the toast', () => {
    const {container} = render(
      <ToastViewport>
        <ToastButton />
        <DialogFixture label="Edit" />
      </ToastViewport>,
    );

    fireEvent.click(screen.getByRole('button', {name: 'Show toast'}));
    const toast = screen.getByText('Saved');
    expect(container.contains(getViewport())).toBe(true);

    fireEvent.click(screen.getByRole('button', {name: 'Toggle Edit'}));
    expect(getDialog('Edit').contains(getViewport())).toBe(true);
    // Same node: the rows were moved, not remounted, so their auto-hide
    // timers and gesture state carry on.
    expect(screen.getByText('Saved')).toBe(toast);

    fireEvent.click(screen.getByRole('button', {name: 'Close Edit'}));
    expect(getDialog('Edit').contains(getViewport())).toBe(false);
    expect(container.contains(getViewport())).toBe(true);
    expect(screen.getByText('Saved')).toBe(toast);
  });

  it('shows the viewport popover again after each move', () => {
    const showPopover = vi.spyOn(HTMLElement.prototype, 'showPopover');
    render(
      <ToastViewport>
        <DialogFixture label="Edit" />
      </ToastViewport>,
    );
    const viewport = getViewport();
    const showsOnViewport = () =>
      showPopover.mock.contexts.filter(context => context === viewport).length;
    expect(showsOnViewport()).toBe(1);

    fireEvent.click(screen.getByRole('button', {name: 'Toggle Edit'}));
    expect(showsOnViewport()).toBe(2);

    fireEvent.click(screen.getByRole('button', {name: 'Close Edit'}));
    expect(showsOnViewport()).toBe(3);
  });

  /**
   * jsdom's Popover stand-ins keep no state and `:popover-open` never
   * matches; these keep a showing set so the viewport can tell it is already
   * in the top layer, as a browser does.
   */
  function trackPopoverState() {
    const showing = new WeakSet<Element>();
    const showPopover = vi
      .spyOn(HTMLElement.prototype, 'showPopover')
      .mockImplementation(function (this: HTMLElement) {
        showing.add(this);
      });
    const hidePopover = vi
      .spyOn(HTMLElement.prototype, 'hidePopover')
      .mockImplementation(function (this: HTMLElement) {
        showing.delete(this);
      });
    const matches = Element.prototype.matches;
    vi.spyOn(Element.prototype, 'matches').mockImplementation(function (
      this: Element,
      selector: string,
    ) {
      if (selector === ':popover-open') {
        return showing.has(this);
      }
      return matches.call(this, selector);
    });
    return {showPopover, hidePopover};
  }

  it('re-enters the top layer in place when a non-modal sheet is shown after it', () => {
    // A `hasScrim={false}` sheet is a manual popover: it enters the top
    // layer above the viewport and blocks nothing, so the viewport stays
    // where it is and leaves and re-enters to paint above the sheet again.
    const {showPopover, hidePopover} = trackPopoverState();
    render(
      <ToastViewport>
        <ToastButton />
        <NonModalSheetFixture label="Filters" />
      </ToastViewport>,
    );
    const viewport = getViewport();
    const onViewport = (spy: typeof showPopover) =>
      spy.mock.contexts.filter(context => context === viewport).length;
    fireEvent.click(screen.getByRole('button', {name: 'Show toast'}));
    expect(onViewport(showPopover)).toBe(1);
    const root = viewport.parentNode;

    fireEvent.click(screen.getByRole('button', {name: 'Toggle Filters'}));
    expect(getDialog('Filters')).toHaveAttribute('popover', 'manual');
    // Re-entered (hide, then show) after the sheet's own showPopover, and
    // not moved: the sheet is not an outlet.
    expect(onViewport(hidePopover)).toBe(1);
    expect(onViewport(showPopover)).toBe(2);
    const sheetShow = showPopover.mock.contexts.indexOf(getDialog('Filters'));
    const viewportReshow = showPopover.mock.contexts.lastIndexOf(viewport);
    expect(sheetShow).toBeGreaterThan(-1);
    expect(viewportReshow).toBeGreaterThan(sheetShow);
    expect(viewport.parentNode).toBe(root);
    expect(screen.getByText('Saved')).toBeInTheDocument();

    // A toast raised while the sheet is open lands in the same viewport.
    fireEvent.click(
      screen.getByRole('button', {name: 'Show toast in Filters'}),
    );
    expect(screen.getAllByText('Saved')).toHaveLength(2);

    // Closing the sheet moves nothing and re-enters nothing.
    fireEvent.click(screen.getByRole('button', {name: 'Toggle Filters'}));
    expect(onViewport(hidePopover)).toBe(1);
    expect(onViewport(showPopover)).toBe(2);
  });

  it('keeps focus inside the viewport across a re-entry', () => {
    trackPopoverState();
    render(
      <ToastViewport>
        <ToastButton />
        <NonModalSheetFixture label="Filters" />
      </ToastViewport>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Show toast'}));
    const viewport = getViewport();
    const dismiss = viewport.querySelector('button');
    expect(dismiss).not.toBeNull();
    dismiss!.focus();
    fireEvent.click(screen.getByRole('button', {name: 'Toggle Filters'}));
    expect(document.activeElement).toBe(dismiss);
  });

  it("keeps each toast's auto-hide timer running across a move", () => {
    vi.useFakeTimers();
    try {
      const onHide = vi.fn();
      render(
        <ToastViewport>
          <TimedToastButton onHide={onHide} />
          <DialogFixture label="Edit" />
        </ToastViewport>,
      );

      fireEvent.click(screen.getByRole('button', {name: 'Show timed toast'}));
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      fireEvent.click(screen.getByRole('button', {name: 'Toggle Edit'}));
      expect(getDialog('Edit').contains(getViewport())).toBe(true);
      act(() => {
        vi.advanceTimersByTime(2500);
      });
      // A remount would have restarted the 5s timer at the move.
      expect(onHide).toHaveBeenCalledWith('auto');
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns when the dialog closes natively while React holds it open', () => {
    const {container} = render(
      <ToastViewport>
        <DialogFixture label="Edit" />
      </ToastViewport>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Toggle Edit'}));
    const dialog = getDialog('Edit');
    expect(dialog.contains(getViewport())).toBe(true);

    act(() => {
      dialog.removeAttribute('open');
      dialog.dispatchEvent(new Event('close'));
    });
    expect(container.contains(getViewport())).toBe(true);
  });

  it('follows the latest open modal through nested dialogs', () => {
    render(
      <ToastViewport>
        <DialogFixture label="Outer">
          <DialogFixture label="Inner" />
        </DialogFixture>
      </ToastViewport>,
    );

    fireEvent.click(screen.getByRole('button', {name: 'Toggle Outer'}));
    fireEvent.click(screen.getByRole('button', {name: 'Toggle Inner'}));
    expect(getDialog('Inner').contains(getViewport())).toBe(true);

    fireEvent.click(screen.getByRole('button', {name: 'Close Inner'}));
    expect(getDialog('Inner').contains(getViewport())).toBe(false);
    expect(getDialog('Outer').contains(getViewport())).toBe(true);
  });

  it('returns to its place when the open Dialog unmounts', () => {
    const {container} = render(
      <ToastViewport>
        <UnmountFixture />
      </ToastViewport>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Show toast'}));
    const toast = screen.getByText('Saved');
    const dismiss = getViewport().querySelector('button')!;
    dismiss.focus();

    act(() => {
      fireEvent.click(screen.getByRole('button', {name: 'Unmount'}));
    });
    expect(container.contains(getViewport())).toBe(true);
    expect(screen.getByText('Saved')).toBe(toast);
    // jsdom does not blur a moved node, so this guards only the end state;
    // the browser blur is handled by ToastViewport's focus restore.
    expect(document.activeElement).toBe(dismiss);
  });

  it('stays in place when the caller renders it in place', () => {
    render(
      <DialogFixture label="Edit">
        <ToastViewport isTopLayer={false}>
          <ToastButton />
        </ToastViewport>
      </DialogFixture>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Toggle Edit'}));
    fireEvent.click(screen.getByRole('button', {name: 'Show toast'}));
    expect(getDialog('Edit').contains(screen.getByText('Saved'))).toBe(true);
    expect(document.querySelector('[popover="manual"]')).toBeNull();
  });

  it('does not move into an inline Dialog', () => {
    const {container} = render(
      <ToastViewport>
        <Dialog isOpen isInline onOpenChange={() => {}} aria-label="Preview">
          <ToastButton />
        </Dialog>
      </ToastViewport>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Show toast'}));
    const viewport = getViewport();
    expect(viewport.closest('[aria-label="Preview"]')).toBeNull();
    expect(container.contains(viewport)).toBe(true);
  });
});
