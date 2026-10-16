// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ScrollLock.stories.tsx
 * @input Real overlay families, a scrollable page, and fixed/in-flow landmarks
 * @output Storybook fixtures for scroll-lock viewport geometry and stacking
 * @position Browser regression stories; use classic scrollbars to expose gutters
 *
 * The modal surface must cover the window without moving either page landmark.
 * The non-modal controls deliberately leave the document scrollbar in place.
 */

import {useState, type ReactNode} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {Button} from '@astryxdesign/core/Button';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {BottomSheet, BottomSheetSwitcher} from '@astryxdesign/core/BottomSheet';
import {Lightbox} from '@astryxdesign/core/Lightbox';
import {MobileNav} from '@astryxdesign/core/MobileNav';
import {Layout, LayoutContent, LayoutFooter} from '@astryxdesign/core/Layout';
import {Section} from '@astryxdesign/core/Section';
import {VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {Drawer, DrawerHeader} from '@astryxdesign/lab';

type Surface =
  'dialog' | 'fullscreen' | 'drawer' | 'sheet' | 'flow' | 'nav' | 'lightbox';
interface FixtureProps {
  surface: Surface;
  side?: 'start' | 'end';
  hasScrim?: boolean;
  secondary?: Surface;
  isFullWidthOnMobile?: boolean;
  dialogPosition?: {top?: number; start?: number; end?: number};
  navigationWidth?: number;
}

const styles = stylex.create({
  page: {minBlockSize: '200dvh', paddingBlockStart: 80},
  landmark: {
    inlineSize: 'min(640px, 80%)',
    marginInline: 'auto',
    backgroundColor: 'var(--color-background-muted)',
  },
  fixed: {
    position: 'fixed',
    insetBlockStart: 0,
    insetInline: 0,
    padding: 16,
    display: 'flex',
    justifyContent: 'center',
    backgroundColor: 'var(--color-background-surface)',
    borderBlockEnd: '1px solid var(--color-border)',
  },
});

const media = {
  src:
    'data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="#477b87"/><circle cx="460" cy="110" r="48" fill="#e8d6a6"/><path d="M0 400 180 140 360 400M240 400 460 180 640 400" fill="#254c58"/></svg>',
    ),
  alt: 'Mountains and a sun, a local test illustration',
};

function SurfaceHost({
  surface,
  side = 'end',
  hasScrim = true,
  isFullWidthOnMobile = false,
  dialogPosition,
  navigationWidth,
  isOpen,
  onOpenChange,
  name,
  children,
}: FixtureProps & {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  children: ReactNode;
}) {
  const [step, setStep] = useState('first');
  const body = (
    <Layout
      header={
        surface === 'drawer' ? (
          <DrawerHeader title={name} onOpenChange={onOpenChange} />
        ) : (
          <DialogHeader title={name} onOpenChange={onOpenChange} />
        )
      }
      content={
        <LayoutContent>
          <VStack gap={4}>{children}</VStack>
        </LayoutContent>
      }
      footer={
        <LayoutFooter hasDivider data-testid={`${name}-divider`}>
          <Button label={`Close ${name}`} onClick={() => onOpenChange(false)} />
        </LayoutFooter>
      }
    />
  );
  switch (surface) {
    case 'drawer':
      return (
        <Drawer
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          label={name}
          side={side}
          hasScrim={hasScrim}
          isFullWidthOnMobile={isFullWidthOnMobile}
          data-testid={name}>
          {body}
        </Drawer>
      );
    case 'nav':
      return (
        <MobileNav
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          header={name}
          side={side}
          width={navigationWidth}
          data-testid={name}>
          <VStack gap={4}>{children}</VStack>
        </MobileNav>
      );
    case 'sheet':
      return (
        <BottomSheet
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          label={name}
          hasScrim={hasScrim}
          data-testid={name}>
          {body}
        </BottomSheet>
      );
    case 'flow':
      return (
        <BottomSheetSwitcher
          activeSheet={isOpen ? step : null}
          onActiveSheetChange={next => {
            if (next == null) {
              onOpenChange(false);
            }
          }}
          hasScrim={hasScrim}
          data-testid={name}>
          <BottomSheet sheetId="first" label={name} height="capped">
            <VStack gap={4}>
              {children}
              <Button label="Next step" onClick={() => setStep('second')} />
              <Button
                label={`Close ${name}`}
                onClick={() => onOpenChange(false)}
              />
            </VStack>
          </BottomSheet>
          <BottomSheet
            sheetId="second"
            label={`${name} second step`}
            height="hug">
            <VStack gap={4}>
              <Text>Second step in the same modal boundary.</Text>
              <Button label="Previous step" onClick={() => setStep('first')} />
              <Button
                label={`Close ${name}`}
                onClick={() => onOpenChange(false)}
              />
            </VStack>
          </BottomSheet>
        </BottomSheetSwitcher>
      );
    case 'lightbox':
      return (
        <Lightbox
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          media={media}
          data-testid={name}
        />
      );
    default:
      return (
        <Dialog
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          variant={surface === 'fullscreen' ? 'fullscreen' : 'standard'}
          position={dialogPosition}
          aria-label={name}
          data-testid={name}>
          {body}
        </Dialog>
      );
  }
}

function ScrollLockFixture(props: FixtureProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSecondaryOpen, setIsSecondaryOpen] = useState(false);
  return (
    <>
      <Section xstyle={styles.page} data-testid="scroll-lock-page">
        <Section xstyle={styles.landmark} data-testid="page-landmark">
          <VStack gap={4}>
            <Text>
              Scrollable background: this centered region and the fixed header
              stay still while overlays open and close.
            </Text>
            <Text>
              Check both window edges, both writing directions, and classic or
              overlay scrollbars.
            </Text>
          </VStack>
        </Section>
      </Section>
      <div {...stylex.props(styles.fixed)} data-testid="fixed-landmark">
        <Button label="Open primary" onClick={() => setIsOpen(true)} />
      </div>
      <SurfaceHost
        {...props}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        name="primary">
        <Text>
          The page stays at its original width; the overlay uses the complete
          window.
        </Text>
        {props.secondary && (
          <Button
            label="Open secondary"
            onClick={() => setIsSecondaryOpen(true)}
          />
        )}
      </SurfaceHost>
      {props.secondary && (
        <SurfaceHost
          surface={props.secondary}
          side="end"
          isOpen={isSecondaryOpen}
          onOpenChange={setIsSecondaryOpen}
          name="secondary">
          <Text>
            The background remains locked after either surface closes first.
          </Text>
          <Button label="Close underlying" onClick={() => setIsOpen(false)} />
          <Button
            label="Close secondary"
            onClick={() => setIsSecondaryOpen(false)}
          />
        </SurfaceHost>
      )}
    </>
  );
}

const meta = {
  title: 'Core/Scroll Lock',
  component: ScrollLockFixture,
  parameters: {layout: 'fullscreen'},
} satisfies Meta<typeof ScrollLockFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

export const CenteredDialog: Story = {args: {surface: 'dialog'}};
export const FullscreenDialog: Story = {args: {surface: 'fullscreen'}};
export const PositionedDialogEnd: Story = {
  args: {surface: 'dialog', dialogPosition: {top: 16, end: 0}},
};
export const PositionedDialogStart: Story = {
  args: {surface: 'dialog', dialogPosition: {top: 16, start: 0}},
};
export const DrawerEnd: Story = {args: {surface: 'drawer', side: 'end'}};
export const DrawerStart: Story = {args: {surface: 'drawer', side: 'start'}};
export const DrawerFullMobile: Story = {
  args: {surface: 'drawer', isFullWidthOnMobile: true},
};
export const NonModalDrawer: Story = {
  args: {surface: 'drawer', hasScrim: false},
};
export const Sheet: Story = {args: {surface: 'sheet'}};
export const SheetFlow: Story = {args: {surface: 'flow'}};
export const NonModalSheet: Story = {args: {surface: 'sheet', hasScrim: false}};
export const NonModalSheetFlow: Story = {
  args: {surface: 'flow', hasScrim: false},
};
export const NavigationEnd: Story = {args: {surface: 'nav', side: 'end'}};
export const NavigationStart: Story = {args: {surface: 'nav', side: 'start'}};
export const NavigationFullWidth: Story = {
  args: {surface: 'nav', navigationWidth: 2000},
};
export const MediaViewer: Story = {args: {surface: 'lightbox'}};
export const DialogStack: Story = {
  args: {surface: 'dialog', secondary: 'fullscreen'},
};
export const DrawerStack: Story = {
  args: {surface: 'drawer', secondary: 'drawer'},
};
export const NavigationThenDialog: Story = {
  args: {surface: 'nav', secondary: 'fullscreen'},
};
export const DialogThenNavigation: Story = {
  args: {surface: 'dialog', secondary: 'nav'},
};
export const NavigationStack: Story = {
  args: {surface: 'nav', secondary: 'nav'},
};
