// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scroll-lock-gutter.mjs
 * @input Built Storybook URL, Playwright Chromium, optional evidence directory
 * @output Browser geometry, hit-test and paint assertions, JSON measurements, and screenshots
 * @position Regression guard for scroll-lock viewport coverage and page stability
 *
 * Build Storybook and serve it, then run:
 * node .github/scripts/scroll-lock-gutter.mjs --url http://localhost:6006 --output <directory>
 *
 * Ordinary headless Chromium hides scrollbars. The classic lane deliberately
 * removes that default argument; the hidden lane is the unchanged control.
 */

/* global document, window, getComputedStyle, innerWidth, innerHeight, scrollX, scrollY */
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import {URL} from 'node:url';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';

const {values} = parseArgs({
  options: {
    url: {type: 'string'},
    output: {type: 'string'},
    case: {type: 'string'},
  },
});
if (!values.url || !values.output) {
  throw new Error(
    'Supply --url for a running built Storybook and --output for evidence.',
  );
}
const output = path.resolve(values.output);
await mkdir(output, {recursive: true});

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
];
const narrowSurfaces = [
  'drawer-end',
  'drawer-start',
  'drawer-mobile-full',
  'dialog-fullscreen',
  'sheet',
  'switcher',
  'nav-start',
  'nav-end',
];
const results = [];
const pause = page => page.waitForTimeout(550);

function snapshot() {
  const declarations = element =>
    Object.fromEntries(
      Array.from(element.style)
        .sort()
        .map(property => [
          property,
          [
            element.style.getPropertyValue(property),
            element.style.getPropertyPriority(property),
          ],
        ]),
    );
  const box = element => {
    if (!element) return null;
    const {left, right, top, bottom, width, height} =
      element.getBoundingClientRect();
    return {left, right, top, bottom, width, height};
  };
  const root = document.documentElement;
  const dialogs = [...document.querySelectorAll('dialog')]
    .filter(element => element.open || element.matches(':popover-open'))
    .map(element => {
      const style = getComputedStyle(element);
      const backdrop = getComputedStyle(element, '::backdrop');
      const modal = element.matches(':modal');
      return {
        box: box(element),
        modal,
        direction: style.direction,
        label: element.getAttribute('aria-label'),
        backdrop: modal
          ? {
              width: parseFloat(backdrop.width),
              left: backdrop.left,
              right: backdrop.right,
            }
          : null,
        panels: [
          ...element.querySelectorAll('.astryx-bottom-sheet, [tabindex="-1"]'),
        ]
          .filter(child => child.getBoundingClientRect().width > 0)
          .map(box),
        dividers: [
          ...element.querySelectorAll('[data-testid="overlay-divider"]'),
        ].map(box),
      };
    });
  return {
    innerWidth,
    innerHeight,
    scrollX,
    scrollY,
    clientWidth: root.clientWidth,
    root: box(root),
    gutter: getComputedStyle(root).scrollbarGutter,
    rootStyle: root.getAttribute('style'),
    bodyStyle: document.body.getAttribute('style'),
    rootDeclarations: declarations(root),
    bodyDeclarations: declarations(document.body),
    edgeHits: [0, innerWidth - 1].map(x => {
      const hit = document.elementFromPoint(x, Math.floor(innerHeight / 2));
      return {
        x,
        tag: hit?.tagName ?? null,
        inModal: !!hit?.closest('dialog:modal'),
      };
    }),
    toast: box(document.querySelector('[data-toast-id]')),
    reference: Object.fromEntries(
      ['flow-alignment', 'fixed-chrome', 'fixed-alignment', 'fixed-footer'].map(
        id => [id, box(document.querySelector(`[data-testid="${id}"]`))],
      ),
    ),
    dialogs,
  };
}

function closeTo(actual, expected, description) {
  assert.ok(
    Number.isFinite(actual) && Math.abs(actual - expected) <= 0.6,
    `${description}: expected ${expected}, got ${actual}`,
  );
}
function samePage(before, after, label) {
  if (before.toast) {
    assert.ok(after.toast, `${label}: toast remains mounted`);
    for (const property of ['left', 'right', 'width'])
      closeTo(
        after.toast[property],
        before.toast[property],
        `${label}: toast.${property}`,
      );
  }
  for (const [id, reference] of Object.entries(before.reference)) {
    assert.ok(reference && after.reference[id], `${label}: missing ${id}`);
    for (const property of ['left', 'right', 'width', 'top', 'bottom']) {
      closeTo(
        after.reference[id][property],
        reference[property],
        `${label}: ${id}.${property}`,
      );
    }
  }
}
function checkOverlay(state, surface) {
  assert.ok(state.dialogs.length > 0, 'overlay must be presented');
  const dialog = state.dialogs.at(-1);
  const {box} = dialog;
  if (!dialog.modal) return;
  for (const hit of state.edgeHits)
    assert.ok(
      hit.inModal,
      `window edge x=${hit.x} is hit-testable by the modal`,
    );
  for (const presented of state.dialogs.filter(item => item.modal)) {
    closeTo(
      presented.backdrop.width,
      state.innerWidth,
      'backdrop covers the window',
    );
  }
  if (surface.startsWith('drawer-')) {
    const onLeft =
      (surface === 'drawer-start') === (dialog.direction === 'ltr');
    closeTo(
      onLeft ? box.left : box.right,
      onLeft ? 0 : state.innerWidth,
      'drawer reaches its window edge',
    );
    if (surface === 'drawer-mobile-full' && state.innerWidth <= 640) {
      closeTo(box.width, state.innerWidth, 'full mobile drawer width');
    }
    for (const divider of dialog.dividers) {
      closeTo(
        onLeft ? divider.left : divider.right,
        onLeft ? 0 : state.innerWidth,
        'footer reaches the window edge',
      );
    }
  } else if (surface === 'dialog-positioned') {
    closeTo(
      dialog.direction === 'ltr' ? state.innerWidth - box.right : box.left,
      16,
      'positioned dialog end offset',
    );
  } else if (
    ['dialog', 'alert-dialog', 'command-palette', 'dialog-stack'].includes(
      surface,
    )
  ) {
    closeTo(
      (box.left + box.right) / 2,
      state.innerWidth / 2,
      'dialog centers on the window',
    );
  } else {
    closeTo(box.left, 0, 'full viewport host left edge');
    closeTo(box.right, state.innerWidth, 'full viewport host right edge');
    const panel = dialog.panels.find(candidate => candidate.width > 0);
    if (surface.startsWith('nav-') && panel) {
      const onLeft = (surface === 'nav-start') === (dialog.direction === 'ltr');
      closeTo(
        onLeft ? panel.left : panel.right,
        onLeft ? 0 : state.innerWidth,
        'navigation panel reaches its logical edge',
      );
    }
    if (
      (surface === 'sheet' || surface === 'switcher') &&
      state.innerWidth < 640
    ) {
      const panel = dialog.panels.find(candidate => candidate.width > 0);
      assert.ok(panel, 'sheet panel is measurable');
      closeTo(panel.left, 0, 'narrow sheet left edge');
      closeTo(panel.right, state.innerWidth, 'narrow sheet right edge');
    }
  }
}

async function captureOpen(page, row, name, check) {
  const file = path.join(output, `${row.id}-${name}.png`);
  const image = PNG.sync.read(await page.screenshot({path: file}));
  if (!row.measurements[name]?.dialogs.some(dialog => dialog.modal)) return;
  const rgba = (png, x, y) => [
    ...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 4),
  ];
  const y = Math.floor(image.height / 2);
  row.measurements[name].edgePixels = [0, image.width - 1].map(x => ({
    x,
    color: rgba(image, x, y),
  }));

  // Paint and hit testing are separate from bounding rectangles. Keep the real
  // screenshot above, then recolor (not resize) the modal and backdrop for an
  // unambiguous clipping assertion. Natural surfaces may have a 1px border;
  // transparent scrims also differ over the page and the formerly empty gutter.
  const paintProbe = await page.addStyleTag({
    content: `
    dialog:modal {background:rgb(255,0,255)!important;border-color:rgb(255,0,255)!important;opacity:1!important;visibility:visible!important;box-shadow:none!important;transition:none!important;}
    dialog:modal * {visibility:hidden!important;}
    dialog:modal::backdrop {background:rgb(0,255,0)!important;opacity:1!important;backdrop-filter:none!important;transition:none!important;}
  `,
  });
  try {
    const diagnostic = PNG.sync.read(
      await page.screenshot({
        path: path.join(output, `${row.id}-${name}-paint.png`),
      }),
    );
    const samples = [0, diagnostic.width - 1].flatMap(x =>
      [0.25, 0.5, 0.75].map(fraction => {
        const y = Math.floor(diagnostic.height * fraction);
        return {x, y, color: rgba(diagnostic, x, y)};
      }),
    );
    row.measurements[name].paintProbe = samples;
    for (const sample of samples)
      check(() =>
        assert.ok(
          [
            [255, 0, 255, 255],
            [0, 255, 0, 255],
          ].some(expected =>
            expected.every(
              (value, i) => Math.abs(value - sample.color[i]) <= 1,
            ),
          ),
          `modal or backdrop paints edge (${sample.x},${sample.y}): ${sample.color}`,
        ),
      );
  } finally {
    await paintProbe.evaluate(element => element.remove());
  }
}

async function runCase(browser, config) {
  const {
    surface,
    mode,
    dir,
    width,
    classic,
    gutter = 'auto',
    hasToast = false,
    noScroll = false,
    opposite = false,
    resize = false,
  } = config;
  const id = `${surface}-${width}-${classic ? 'classic' : 'hidden'}-${mode}-${dir}${gutter === 'auto' ? '' : '-both-edges'}${hasToast ? '-toast' : ''}${noScroll ? '-no-scroll' : ''}${opposite ? '-opposite' : ''}${resize ? '-resize' : ''}`;
  if (values.case && id !== values.case) return;
  const page = await browser.newPage({
    viewport: {width, height: 800},
    colorScheme: mode,
  });
  const row = {id, ...config, errors: [], pageErrors: [], measurements: {}};
  page.on('pageerror', error => row.pageErrors.push(error.message));
  const check = fn => {
    try {
      fn();
    } catch (error) {
      row.errors.push(error.message);
    }
  };
  try {
    const url = new URL('/iframe.html', values.url);
    url.searchParams.set('id', 'core-scrolllock--viewport');
    url.searchParams.set('viewMode', 'story');
    url.searchParams.set('args', `surface:${surface};hasToast:${hasToast}`);
    url.searchParams.set('globals', `colorMode:${mode};direction:${dir}`);
    await page.goto(url.href, {waitUntil: 'networkidle', timeout: 60_000});
    await page
      .getByRole('button', {name: 'Open overlay', exact: true})
      .waitFor();
    await page.evaluate(
      ({dir, gutter, noScroll, opposite}) => {
        document.documentElement.dir = dir;
        const fixture = document.querySelector('[data-scroll-lock-fixture]');
        if (noScroll) fixture.style.minHeight = '600px';
        if (opposite) fixture.dir = dir === 'ltr' ? 'rtl' : 'ltr';
        if (gutter !== 'auto') {
          document.documentElement.style.setProperty(
            'scrollbar-gutter',
            gutter,
            'important',
          );
          document.documentElement.style.setProperty(
            'overflow',
            'auto',
            'important',
          );
          document.body.style.setProperty('position', 'relative', 'important');
        }
        window.scrollTo(0, 120);
      },
      {dir, gutter, noScroll, opposite},
    );
    if (hasToast)
      await page
        .getByRole('button', {name: 'Show persistent toast', exact: true})
        .click();
    await pause(page);
    const before = await page.evaluate(snapshot);
    row.measurements.before = before;
    check(() =>
      classic && !noScroll
        ? assert.ok(
            before.innerWidth - before.clientWidth > 0,
            'classic lane must actually have a scrollbar',
          )
        : closeTo(
            before.clientWidth,
            before.innerWidth,
            'hidden scrollbar control',
          ),
    );
    await page.screenshot({path: path.join(output, `${id}-before.png`)});
    await page.getByRole('button', {name: 'Open overlay', exact: true}).click();
    await pause(page);
    const open = await page.evaluate(snapshot);
    row.measurements.open = open;
    check(() => samePage(before, open, 'open'));
    check(() => checkOverlay(open, surface));
    await captureOpen(page, row, 'open', check);
    if (resize) {
      await page.setViewportSize({width: 960, height: 720});
      await pause(page);
      const resized = await page.evaluate(snapshot);
      row.measurements.resized = resized;
      check(() => checkOverlay(resized, surface));
      const left = before.reference['fixed-chrome'].left;
      const right = before.innerWidth - before.reference['fixed-chrome'].right;
      check(() =>
        closeTo(
          resized.reference['fixed-chrome'].left,
          left,
          'resized background left reservation',
        ),
      );
      check(() =>
        closeTo(
          resized.innerWidth - resized.reference['fixed-chrome'].right,
          right,
          'resized background right reservation',
        ),
      );
      await captureOpen(page, row, 'resized', check);
      await page.setViewportSize({width, height: 800});
      await pause(page);
    }
    if (surface === 'switcher') {
      await page.getByRole('button', {name: 'Next sheet', exact: true}).click();
      await page.waitForTimeout(1000);
      const handoff = await page.evaluate(snapshot);
      row.measurements.handoff = handoff;
      check(() =>
        assert.equal(handoff.dialogs.length, 1, 'switcher keeps one host'),
      );
      check(() => samePage(before, handoff, 'handoff'));
      check(() => checkOverlay(handoff, surface));
      await captureOpen(page, row, 'handoff', check);
    }
    if (surface.endsWith('-stack')) {
      await page
        .getByRole('button', {name: 'Open stacked overlay', exact: true})
        .click();
      await pause(page);
      const stacked = await page.evaluate(snapshot);
      row.measurements.stacked = stacked;
      check(() =>
        assert.equal(
          stacked.dialogs.length,
          2,
          'both overlays remain presented',
        ),
      );
      check(() => samePage(before, stacked, 'stacked'));
      check(() =>
        checkOverlay(stacked, surface === 'drawer-stack' ? surface : 'dialog'),
      );
      await captureOpen(page, row, 'stacked', check);
      await page
        .getByRole('button', {name: 'Close stacked overlay', exact: true})
        .click();
      await pause(page);
      const unstacked = await page.evaluate(snapshot);
      row.measurements.unstacked = unstacked;
      check(() => samePage(before, unstacked, 'top closes first'));
      check(() => checkOverlay(unstacked, surface));
      await page
        .getByRole('button', {name: 'Open stacked overlay', exact: true})
        .click();
      await pause(page);
      await page
        .getByRole('button', {name: 'Close underlying overlay', exact: true})
        .click();
      await pause(page);
      const lowerClosed = await page.evaluate(snapshot);
      row.measurements.lowerClosed = lowerClosed;
      check(() => samePage(before, lowerClosed, 'lower closes first'));
      check(() =>
        checkOverlay(
          lowerClosed,
          surface === 'drawer-stack' ? surface : 'dialog',
        ),
      );
      await captureOpen(page, row, 'lowerClosed', check);
      await page
        .getByRole('button', {name: 'Close stacked overlay', exact: true})
        .click();
    } else {
      // Use an explicit close when the fixture supplies one. A start-side
      // drawer may appear under the pointer and expose its close tooltip;
      // that independent layer correctly owns the first Escape.
      const close = page.getByRole('button', {
        name: 'Close overlay',
        exact: true,
      });
      if (await close.count()) {
        await close.click();
      } else {
        await page.keyboard.press('Escape');
      }
    }
    await pause(page);
    const closed = await page.evaluate(snapshot);
    row.measurements.closed = closed;
    check(() => assert.equal(closed.dialogs.length, 0, 'all overlays close'));
    check(() => samePage(before, closed, 'closed'));
    check(() =>
      closeTo(closed.scrollY, before.scrollY, 'vertical scroll restoration'),
    );
    check(() =>
      closeTo(closed.scrollX, before.scrollX, 'horizontal scroll restoration'),
    );
    check(() =>
      assert.deepEqual(
        closed.rootDeclarations,
        before.rootDeclarations,
        'root inline values and priorities restore exactly',
      ),
    );
    check(() =>
      assert.deepEqual(
        closed.bodyDeclarations,
        before.bodyDeclarations,
        'body inline values and priorities restore exactly',
      ),
    );
    await page.screenshot({path: path.join(output, `${id}-closed.png`)});
  } catch (error) {
    row.errors.push(error.stack || error.message);
    await page
      .screenshot({path: path.join(output, `${id}-error.png`)})
      .catch(() => {});
  } finally {
    await page.close();
  }
  results.push(row);
  console.log(
    `${row.errors.length ? 'FAIL' : 'PASS'} ${id}${row.errors.length ? ': ' + row.errors.join('; ') : ''}`,
  );
}

for (const classic of [true, false]) {
  const browser = await chromium.launch(
    classic ? {ignoreDefaultArgs: ['--hide-scrollbars']} : {},
  );
  try {
    const cases = [];
    for (const mode of ['light', 'dark'])
      for (const dir of ['ltr', 'rtl']) {
        for (const surface of surfaces)
          cases.push({surface, mode, dir, width: 1280, classic});
      }
    for (const dir of ['ltr', 'rtl'])
      for (const surface of narrowSurfaces) {
        cases.push({surface, mode: 'dark', dir, width: 390, classic});
      }
    if (classic)
      for (const dir of ['ltr', 'rtl'])
        for (const surface of [
          'drawer-end',
          'dialog-fullscreen',
          'nav-stack',
        ]) {
          cases.push({
            surface,
            mode: 'dark',
            dir,
            width: 1280,
            classic,
            gutter: 'stable both-edges',
          });
        }
    for (const dir of ['ltr', 'rtl']) {
      for (const surface of [
        'drawer-end',
        'dialog-fullscreen',
        'nav-end',
        'nav-stack',
      ])
        cases.push({
          surface,
          mode: 'dark',
          dir,
          width: 1280,
          classic,
          hasToast: true,
        });
      for (const surface of ['drawer-end', 'dialog-fullscreen', 'nav-end']) {
        cases.push({
          surface,
          mode: 'dark',
          dir,
          width: 1280,
          classic,
          noScroll: true,
        });
        cases.push({
          surface,
          mode: 'dark',
          dir,
          width: 1280,
          classic,
          resize: true,
        });
      }
      cases.push({
        surface: 'drawer-end',
        mode: 'dark',
        dir,
        width: 1280,
        classic,
        opposite: true,
      });
    }
    let next = 0;
    await Promise.all(
      Array.from({length: 3}, async () => {
        while (next < cases.length) await runCase(browser, cases[next++]);
      }),
    );
  } finally {
    await browser.close();
  }
}
if (results.length === 0) throw new Error(`No matching case: ${values.case}`);
results.sort((a, b) => a.id.localeCompare(b.id));
const failed = results.filter(row => row.errors.length > 0);
await writeFile(
  path.join(output, 'measurements.json'),
  JSON.stringify(results, null, 2),
);
console.log(
  `\n${results.length - failed.length}/${results.length} cases passed. Evidence: ${output}`,
);
process.exitCode = failed.length ? 1 : 0;
