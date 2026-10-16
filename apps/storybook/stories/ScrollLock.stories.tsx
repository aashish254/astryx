// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ScrollLock.stories.tsx
 * @input Real overlay families, a scrolling page, and viewport-fixed alignment marks
 * @output Interactive scrollbar-gutter and stacked-overlay regression fixture
 * @position Storybook browser evidence; no simulated dialog or scroll-lock behavior
 */

import {useState} from 'react';
import type {Meta, StoryObj} from '@storybook/react';
import * as stylex from '@stylexjs/stylex';
import {AlertDialog} from '@astryxdesign/core/AlertDialog';
import {BottomSheet, BottomSheetSwitcher} from '@astryxdesign/core/BottomSheet';
import {Button} from '@astryxdesign/core/Button';
import {CommandPalette} from '@astryxdesign/core/CommandPalette';
import {Dialog, DialogHeader} from '@astryxdesign/core/Dialog';
import {Heading} from '@astryxdesign/core/Heading';
import {Layout, LayoutContent, LayoutFooter} from '@astryxdesign/core/Layout';
import {Lightbox} from '@astryxdesign/core/Lightbox';
import {MobileNav} from '@astryxdesign/core/MobileNav';
import {VStack} from '@astryxdesign/core/Stack';
import {Text} from '@astryxdesign/core/Text';
import {ToastViewport, useToast} from '@astryxdesign/core/Toast';
import {createStaticSource} from '@astryxdesign/core/Typeahead';
import {colorVars, spacingVars} from '@astryxdesign/core/theme/tokens.stylex';
import {Drawer, DrawerHeader} from '@astryxdesign/lab';

const surfaces = [
  'drawer-end',
  'drawer-start',
  'drawer-nonmodal',
  'drawer-mobile-full',
  'dialog',
  'dialog-fullscreen',
  'dialog-positioned',
  'alert-dialog',
  'command-palette',
  'sheet',
  'sheet-nonmodal',
  'switcher',
  'nav-start',
  'nav-end',
  'lightbox',
  'drawer-stack',
  'dialog-stack',
  'nav-stack',
  'sheet-stack',
] as const;
type Surface = (typeof surfaces)[number];

const styles = stylex.create({
  page: {
    minHeight: '220vh',
    paddingBlockStart: 160,
    paddingBlockEnd: spacingVars['--spacing-8'],
  },
  alignment: {
    maxWidth: 640,
    marginInline: 'auto',
    padding: spacingVars['--spacing-4'],
    borderInlineStartWidth: 1,
    borderInlineStartStyle: 'solid',
    borderInlineStartColor: colorVars['--color-border'],
    borderInlineEndWidth: 1,
    borderInlineEndStyle: 'solid',
    borderInlineEndColor: colorVars['--color-border'],
  },
  chrome: {
    position: 'fixed',
    insetInline: 0,
    insetBlockStart: 0,
    backgroundColor: colorVars['--color-background-surface'],
  },
  footer: {
    position: 'fixed',
    insetInline: 0,
    insetBlockEnd: 0,
    backgroundColor: colorVars['--color-background-surface'],
  },
});

const commands = createStaticSource([{id: 'close', label: 'Close preview'}]);
const media = {
  src: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="600" height="360"%3E%3Crect width="600" height="360" fill="%237890a0"/%3E%3Ccircle cx="300" cy="180" r="100" fill="%23d5dce0"/%3E%3C/svg%3E',
  alt: 'A circle in a rectangular image',
};

function ToastControl() {
  const showToast = useToast();
  return (
    <Button
      label="Show persistent toast"
      onClick={() =>
        showToast({
          body: 'Background notification',
          isAutoHide: false,
          uniqueID: 'scroll-lock-evidence',
        })
      }
    />
  );
}

function ScrollLockFixture({
  surface,
  hasToast = false,
}: {
  surface: Surface;
  hasToast?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [stacked, setStacked] = useState(false);
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const isStack = surface.endsWith('-stack');
  const close = () => setOpen(false);
  const actions = (
    <VStack gap={2}>
      <Button label="Close overlay" onClick={close} />
      {isStack && (
        <Button label="Open stacked overlay" onClick={() => setStacked(true)} />
      )}
    </VStack>
  );
  const content = (
    <Layout
      content={
        <LayoutContent>
          <VStack gap={4}>
            <Heading level={2}>Overlay alignment</Heading>
            <Text>
              The surface and its full-bleed footer share the same edge.
            </Text>
          </VStack>
        </LayoutContent>
      }
      footer={
        <LayoutFooter hasDivider data-testid="overlay-divider">
          {actions}
        </LayoutFooter>
      }
    />
  );
  const stackedContent = (
    <VStack gap={4}>
      <Heading level={2}>Stacked overlay</Heading>
      <Button label="Close stacked overlay" onClick={() => setStacked(false)} />
      <Button label="Close underlying overlay" onClick={close} />
    </VStack>
  );

  return (
    <ToastViewport position="bottomEnd">
      <div data-scroll-lock-fixture={surface} {...stylex.props(styles.page)}>
        <div data-testid="flow-alignment" {...stylex.props(styles.alignment)}>
          <VStack gap={4}>
            <Heading level={1}>Scroll-lock geometry</Heading>
            <Text>
              This page deliberately scrolls. Its centered content and fixed
              chrome must not move sideways.
            </Text>
          </VStack>
        </div>
        <div data-testid="fixed-chrome" {...stylex.props(styles.chrome)}>
          <div
            data-testid="fixed-alignment"
            {...stylex.props(styles.alignment)}>
            {hasToast && <ToastControl />}
            <Button
              label="Open overlay"
              onClick={() => {
                setOpen(true);
                if (surface === 'switcher') {
                  setActiveSheet('first');
                }
              }}
            />
          </div>
        </div>
        <div data-testid="fixed-footer" {...stylex.props(styles.footer)}>
          <div {...stylex.props(styles.alignment)}>
            <Text>Fixed page footer</Text>
          </div>
        </div>
        {surface.startsWith('drawer-') && (
          <Drawer
            isOpen={open}
            onOpenChange={setOpen}
            label="Drawer geometry"
            side={surface === 'drawer-start' ? 'start' : 'end'}
            hasScrim={surface !== 'drawer-nonmodal'}
            isFullWidthOnMobile={surface === 'drawer-mobile-full'}>
            <Layout
              header={<DrawerHeader title="Edit form" onOpenChange={setOpen} />}
              content={
                <LayoutContent>
                  <Text>Full-bleed footer actions</Text>
                </LayoutContent>
              }
              footer={
                <LayoutFooter hasDivider data-testid="overlay-divider">
                  {actions}
                </LayoutFooter>
              }
            />
          </Drawer>
        )}
        {(surface === 'dialog' || surface.startsWith('dialog-')) && (
          <Dialog
            isOpen={open}
            onOpenChange={setOpen}
            variant={
              surface === 'dialog-fullscreen' ? 'fullscreen' : 'standard'
            }
            position={
              surface === 'dialog-positioned' ? {end: 16, top: 100} : undefined
            }>
            <DialogHeader title="Dialog geometry" />
            {content}
          </Dialog>
        )}
        {surface === 'alert-dialog' && (
          <AlertDialog
            isOpen={open}
            onOpenChange={setOpen}
            title="Discard preview?"
            description="This only closes the local example."
            actionLabel="Discard preview"
            onAction={close}
          />
        )}
        {surface === 'command-palette' && (
          <CommandPalette
            isOpen={open}
            onOpenChange={setOpen}
            searchSource={commands}
            label="Command geometry"
            onValueChange={close}
          />
        )}
        {(surface === 'sheet' || surface.startsWith('sheet-')) && (
          <BottomSheet
            isOpen={open}
            onOpenChange={setOpen}
            label="Sheet geometry"
            hasScrim={surface !== 'sheet-nonmodal'}>
            {content}
          </BottomSheet>
        )}
        {surface === 'switcher' && (
          <BottomSheetSwitcher
            activeSheet={activeSheet}
            onActiveSheetChange={setActiveSheet}>
            <BottomSheet sheetId="first" label="First sheet" height="capped">
              <VStack gap={4}>
                <Heading level={2}>First sheet</Heading>
                <Button
                  label="Next sheet"
                  onClick={() => setActiveSheet('second')}
                />
                <Button
                  label="Close overlay"
                  onClick={() => setActiveSheet(null)}
                />
              </VStack>
            </BottomSheet>
            <BottomSheet sheetId="second" label="Second sheet" height="hug">
              <VStack gap={4}>
                <Heading level={2}>Second sheet</Heading>
                <Button
                  label="Close overlay"
                  onClick={() => setActiveSheet(null)}
                />
              </VStack>
            </BottomSheet>
          </BottomSheetSwitcher>
        )}
        {surface.startsWith('nav-') && (
          <MobileNav
            isOpen={open}
            onOpenChange={setOpen}
            header="Navigation geometry"
            side={surface === 'nav-start' ? 'start' : 'end'}>
            {content}
          </MobileNav>
        )}
        {surface === 'lightbox' && (
          <Lightbox isOpen={open} onOpenChange={setOpen} media={media} />
        )}
        {surface === 'drawer-stack' ? (
          <Drawer
            isOpen={stacked}
            onOpenChange={setStacked}
            label="Stacked drawer"
            width={320}>
            {stackedContent}
          </Drawer>
        ) : isStack ? (
          <Dialog
            isOpen={stacked}
            onOpenChange={setStacked}
            aria-label="Stacked dialog"
            width={320}>
            {stackedContent}
          </Dialog>
        ) : null}
      </div>
    </ToastViewport>
  );
}

const meta = {
  title: 'Core/ScrollLock',
  component: ScrollLockFixture,
  parameters: {layout: 'fullscreen'},
  argTypes: {
    surface: {control: 'select', options: surfaces},
    hasToast: {control: 'boolean'},
  },
  args: {surface: 'drawer-end', hasToast: false},
} satisfies Meta<typeof ScrollLockFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Use a platform with space-taking scrollbars; the headless default hides them. */
export const Viewport: Story = {};
