#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scroll-lock-geometry.js
 * @input Built Scroll Lock stories; --url <origin> or --storybook-dir <path>,
 *   --port <number>, optional --output-dir <path>, --story <substring>,
 *   --scrollbars classic|hidden and --mode light|dark
 * @output Failing browser assertions for modal coverage and background stability
 * @position Real-layout regression guard; run after `pnpm storybook:build`
 *
 * Chromium's default --hide-scrollbars masks this entire class of bugs. Run
 * both classic and hidden modes, not a mocked clientWidth. Native ::backdrop
 * rectangles come from the browser's box model rather than a CSS string.
 *
 * `pnpm guard:scroll-lock` serves the build itself and always closes the server.
 * `--url` reuses an existing server. Screenshots and JSON are opt-in via
 * `--output-dir`; the geometry assertions always run.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require('playwright');
const {PNG} = require('pngjs');

const args = process.argv.slice(2);
const arg = name => {
  const index = args.indexOf(`--${name}`);
  return index < 0 ? undefined : args[index + 1];
};
const outputDir = arg('output-dir');
const filter = arg('story');
const scrollbarModes = arg('scrollbars')
  ? [arg('scrollbars')]
  : ['classic', 'hidden'];
const colorModes = arg('mode') ? [arg('mode')] : ['light', 'dark'];
assert.ok(
  scrollbarModes.every(mode => ['classic', 'hidden'].includes(mode)),
  'Invalid --scrollbars',
);
assert.ok(
  colorModes.every(mode => ['light', 'dark'].includes(mode)),
  'Invalid --mode',
);
const stories = [
  ['centered-dialog', 'center'],
  ['fullscreen-dialog', 'full'],
  ['positioned-dialog-end', 'edge', 'end'],
  ['positioned-dialog-start', 'edge', 'start'],
  ['drawer-end', 'edge', 'end'],
  ['drawer-start', 'edge', 'start'],
  ['drawer-full-mobile', 'edge', 'end'],
  ['non-modal-drawer', 'nonmodal'],
  ['sheet', 'full'],
  ['sheet-flow', 'full'],
  ['non-modal-sheet', 'nonmodal'],
  ['non-modal-sheet-flow', 'nonmodal'],
  ['navigation-end', 'nav', 'end'],
  ['navigation-start', 'nav', 'start'],
  ['navigation-full-width', 'nav', 'end'],
  ['media-viewer', 'full'],
  ['dialog-stack', 'center', undefined, 'full'],
  ['drawer-stack', 'edge', 'end', 'edge'],
  ['navigation-then-dialog', 'nav', 'end', 'full'],
  ['dialog-then-navigation', 'center', undefined, 'nav'],
  ['navigation-stack', 'nav', 'end', 'nav'],
];

function near(actual, expected, label) {
  assert.ok(
    Math.abs(actual - expected) <= 1,
    `${label}: ${actual}, expected ${expected}`,
  );
}

async function serve() {
  if (arg('url')) return {url: arg('url'), close() {}};
  const root = path.resolve(arg('storybook-dir') || 'apps/storybook/dist');
  assert.ok(
    fs.existsSync(path.join(root, 'iframe.html')),
    'Build Storybook first',
  );
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
  };
  const server = http.createServer((request, response) => {
    const file = path.resolve(
      root,
      `.${decodeURIComponent(new URL(request.url, 'http://localhost').pathname)}`,
    );
    if (
      !file.startsWith(`${root}${path.sep}`) ||
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile()
    ) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader(
      'Content-Type',
      types[path.extname(file)] || 'application/octet-stream',
    );
    fs.createReadStream(file).pipe(response);
  });
  const port = Number(arg('port') || 6153);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

async function measure(page, cdp) {
  const data = await page.evaluate(() => {
    const rect = element => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        left: box.left,
        right: box.right,
        width: box.width,
        top: box.top,
        bottom: box.bottom,
      };
    };
    const root = document.documentElement;
    return {
      width: innerWidth,
      clientWidth: root.clientWidth,
      scrollY,
      rootStyle: root.style.cssText,
      bodyStyle: document.body.style.cssText,
      bodyPosition: getComputedStyle(document.body).position,
      rootOverflow: getComputedStyle(root).overflow,
      fixed: rect(document.querySelector('[data-testid="fixed-landmark"]')),
      landmark: rect(document.querySelector('[data-testid="page-landmark"]')),
      dialogs: Array.from(
        document.querySelectorAll('dialog[open], dialog:popover-open'),
      ).map(dialog => ({
        rect: rect(dialog),
        modal: dialog.matches(':modal'),
        dir: getComputedStyle(dialog).direction,
        panel: rect(dialog.querySelector(':scope > div[tabindex="-1"]')),
        divider: rect(dialog.querySelector('[data-testid$="-divider"]')),
      })),
    };
  });
  const {root} = await cdp.send('DOM.getDocument');
  const {nodeIds} = await cdp.send('DOM.querySelectorAll', {
    nodeId: root.nodeId,
    selector: 'dialog[open], dialog:popover-open',
  });
  for (const [index, nodeId] of nodeIds.entries()) {
    const {node} = await cdp.send('DOM.describeNode', {nodeId, depth: 1});
    const backdrop = node.pseudoElements?.find(
      item => item.pseudoType === 'backdrop',
    );
    if (!backdrop || !data.dialogs[index].modal) continue;
    const {model} = await cdp.send('DOM.getBoxModel', {
      nodeId: backdrop.nodeId,
    });
    const xs = [
      model.border[0],
      model.border[2],
      model.border[4],
      model.border[6],
    ];
    data.dialogs[index].backdrop = {
      left: Math.min(...xs),
      right: Math.max(...xs),
    };
  }
  return data;
}

function stable(before, current) {
  for (const key of ['fixed', 'landmark']) {
    for (const dimension of ['left', 'right', 'width']) {
      near(
        current[key][dimension],
        before[key][dimension],
        `${key}.${dimension}`,
      );
    }
  }
}

function covered(current, kind, side = 'end', fullPanel = false) {
  const top = current.dialogs.at(-1);
  assert.ok(top, 'Expected an open host');
  if (kind === 'nonmodal') {
    assert.notEqual(
      current.bodyPosition,
      'fixed',
      'Non-modal must not pin the body',
    );
    assert.notEqual(
      current.rootOverflow,
      'clip',
      'Non-modal must not clip the document',
    );
    return;
  }
  for (const dialog of current.dialogs) {
    assert.ok(
      dialog.modal && dialog.backdrop,
      'Expected a native modal backdrop',
    );
    near(dialog.backdrop.left, 0, 'backdrop.left');
    near(dialog.backdrop.right, current.width, 'backdrop.right');
  }
  if (kind === 'full' || kind === 'nav') {
    near(top.rect.left, 0, 'host.left');
    near(top.rect.right, current.width, 'host.right');
  }
  if (kind === 'center')
    near(
      (top.rect.left + top.rect.right) / 2,
      current.width / 2,
      'modal center',
    );
  if (kind === 'edge' || kind === 'nav') {
    const left = (top.dir === 'rtl') !== (side === 'start');
    const box = kind === 'nav' ? top.panel : top.rect;
    assert.ok(box, 'Expected an edge panel');
    near(
      box[left ? 'left' : 'right'],
      left ? 0 : current.width,
      'selected edge',
    );
    if (fullPanel) near(box.width, current.width, 'full-mobile panel width');
  }
  if (top.divider && kind === 'edge') {
    near(top.divider.left, top.rect.left, 'footer left');
    near(top.divider.right, top.rect.right, 'footer right');
  }
}

async function verifyEdgePaint(page) {
  // A reported box can reach the window while its paint remains root-clipped.
  // Replace colors only, never layout/overflow/containing blocks, then sample
  // the actual painted edge. Unmodified screenshots are captured separately.
  const marker = await page.addStyleTag({
    content: `
    dialog:modal, dialog:modal::backdrop {
      background: rgb(17, 239, 83) !important;
      background-image: none !important;
      backdrop-filter: none !important;
      box-shadow: none !important;
      border-color: rgb(17, 239, 83) !important;
      opacity: 1 !important;
    }
    dialog:modal * { visibility: hidden !important; }
  `,
  });
  try {
    const image = PNG.sync.read(await page.screenshot());
    for (const x of [1, image.width - 2]) {
      const i = (Math.floor(image.height / 2) * image.width + x) * 4;
      assert.deepEqual(
        Array.from(image.data.subarray(i, i + 3)),
        [17, 239, 83],
        `Modal paint clipped at x=${x}`,
      );
    }
  } finally {
    await marker.evaluate(element => element.remove());
  }
}

async function sampleFrames(page, start) {
  return page.evaluate(start => {
    if (!start) {
      window.__scrollLockSampling = false;
      return window.__scrollLockFrames;
    }
    window.__scrollLockFrames = [];
    window.__scrollLockSampling = true;
    const frame = () => {
      const rect = selector => {
        const box = document.querySelector(selector).getBoundingClientRect();
        return {left: box.left, right: box.right, width: box.width};
      };
      window.__scrollLockFrames.push({
        fixed: rect('[data-testid="fixed-landmark"]'),
        landmark: rect('[data-testid="page-landmark"]'),
      });
      if (window.__scrollLockSampling) requestAnimationFrame(frame);
    };
    frame();
  }, start);
}

async function main() {
  const server = await serve();
  const results = [];
  if (outputDir) fs.mkdirSync(outputDir, {recursive: true});
  try {
    for (const scrollbars of scrollbarModes) {
      const browser = await chromium.launch(
        scrollbars === 'classic'
          ? {ignoreDefaultArgs: ['--hide-scrollbars']}
          : {},
      );
      try {
        for (const width of [1280, 390])
          for (const mode of colorModes)
            for (const dir of ['ltr', 'rtl']) {
              for (const [story, kind, side, secondary] of stories) {
                if (
                  (filter && !story.includes(filter)) ||
                  (width === 390 && secondary)
                )
                  continue;
                const id = `${story}-${width}-${scrollbars}-${mode}-${dir}`;
                const page = await browser.newPage({
                  viewport: {width, height: 800},
                  colorScheme: mode,
                  reducedMotion: 'reduce',
                });
                const row = {id, browser: browser.version()};
                const errors = [];
                page.on('pageerror', error => errors.push(error.message));
                try {
                  await page.goto(
                    `${server.url}/iframe.html?id=core-scroll-lock--${story}&globals=colorMode:${mode};direction:${dir}`,
                    {waitUntil: 'networkidle'},
                  );
                  const open = () =>
                    page
                      .getByRole('button', {name: 'Open primary', exact: true})
                      .click();
                  const settle = () => page.waitForTimeout(300);
                  const closed = async () => {
                    await page.keyboard.press('Escape');
                    await page.waitForFunction(
                      () =>
                        !Array.from(document.querySelectorAll('dialog')).some(
                          dialog =>
                            dialog.open || dialog.matches(':popover-open'),
                        ),
                    );
                    await settle();
                  };
                  const cdp = await page.context().newCDPSession(page);
                  const capture = async name => {
                    const state = await measure(page, cdp);
                    row[name] = state;
                    if (outputDir)
                      await page.screenshot({
                        path: path.join(outputDir, `${id}-${name}.png`),
                      });
                    return state;
                  };
                  await page
                    .getByRole('button', {name: 'Open primary', exact: true})
                    .waitFor();
                  await page.evaluate(dir => {
                    document.documentElement.dir = dir;
                    scrollTo(0, 80);
                  }, dir);
                  await settle();
                  const before = await capture('before');
                  assert.equal(
                    before.clientWidth < width,
                    scrollbars === 'classic',
                    'Scrollbar launch mode did not take effect',
                  );
                  await sampleFrames(page, true);
                  await open();
                  await settle();
                  covered(
                    await capture('opened'),
                    kind,
                    side,
                    story === 'navigation-full-width' ||
                      (story === 'drawer-full-mobile' && width === 390),
                  );
                  if (kind !== 'nonmodal') {
                    await verifyEdgePaint(page);
                    const y = await page.evaluate(() => scrollY);
                    await page.mouse.move(1, 799);
                    await page.mouse.wheel(0, 200);
                    await settle();
                    near(
                      await page.evaluate(() => scrollY),
                      y,
                      'locked document wheel',
                    );
                  }
                  if (story.includes('sheet-flow')) {
                    await page
                      .getByRole('button', {name: 'Next step', exact: true})
                      .click();
                    await settle();
                    covered(await capture('handoff'), kind, side);
                    await page
                      .getByRole('button', {name: 'Previous step', exact: true})
                      .click();
                    await settle();
                  }
                  if (secondary) {
                    await page
                      .getByRole('button', {
                        name: 'Open secondary',
                        exact: true,
                      })
                      .click();
                    await settle();
                    covered(await capture('stacked'), secondary);
                    await verifyEdgePaint(page);
                    await page.keyboard.press('Escape');
                    await settle();
                    covered(await capture('peeled'), kind, side);
                  }
                  await closed();
                  await capture('closed');
                  if (secondary) {
                    await open();
                    await settle();
                    await page
                      .getByRole('button', {
                        name: 'Open secondary',
                        exact: true,
                      })
                      .click();
                    await settle();
                    await page
                      .getByRole('button', {
                        name: 'Close underlying',
                        exact: true,
                      })
                      .click();
                    await settle();
                    covered(await capture('underlyingClosed'), secondary);
                    await verifyEdgePaint(page);
                    await closed();
                    await capture('closedOutOfOrder');
                  }
                  for (const frame of await sampleFrames(page, false))
                    stable(before, frame);
                  for (const state of Object.values(row))
                    if (typeof state === 'object' && state?.fixed)
                      stable(before, state);
                  for (const name of ['closed', 'closedOutOfOrder'])
                    if (row[name]) {
                      near(
                        row[name].scrollY,
                        before.scrollY,
                        'restored scroll position',
                      );
                      assert.equal(
                        row[name].rootStyle,
                        before.rootStyle,
                        'Root styles leaked',
                      );
                      assert.equal(
                        row[name].bodyStyle,
                        before.bodyStyle,
                        'Body styles leaked',
                      );
                    }
                  assert.deepEqual(errors, [], 'Unexpected browser errors');
                  row.passed = true;
                  console.log(`PASS ${id}`);
                } catch (error) {
                  row.error = error.stack;
                  console.error(`FAIL ${id}: ${error.message}`);
                } finally {
                  await page.close();
                  results.push(row);
                }
              }
            }
      } finally {
        await browser.close();
      }
    }
  } finally {
    await server.close();
  }
  if (outputDir)
    fs.writeFileSync(
      path.join(outputDir, 'measurements.json'),
      JSON.stringify(results, null, 2),
    );
  assert.ok(results.length > 0, 'No stories matched');
  const failed = results.filter(row => !row.passed).length;
  console.log(`${results.length - failed}/${results.length} cases passed`);
  if (failed) process.exitCode = 1;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
