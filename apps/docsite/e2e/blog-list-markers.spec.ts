// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file blog-list-markers.spec.ts
 * @input Production docsite's 0.7.0 release post and its 26-item migration list
 * @output Browser proof of intact counters, a shared text start, and no overlap
 * @position Docsite regression; generated screenshots stay in test-results
 */

import {expect, test} from '@playwright/test';

for (const {width, dir, colorScheme} of [
  {width: 1280, dir: 'ltr', colorScheme: 'light'},
  {width: 390, dir: 'ltr', colorScheme: 'light'},
  {width: 1280, dir: 'rtl', colorScheme: 'dark'},
  {width: 390, dir: 'rtl', colorScheme: 'dark'},
] as const) {
  test(`release list markers stay intact (${width}px, ${dir}, ${colorScheme})`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({width, height: 900});
    await page.emulateMedia({colorScheme, reducedMotion: 'reduce'});
    await page.goto('/blog/astryx-v0-7-0');
    await page.evaluate(d => {
      document.documentElement.dir = d;
    }, dir);
    await page.evaluate(() => document.fonts.ready);

    const migrations = page.locator('ol').filter({
      hasText: 'Phone typography starts at 16px',
    });
    await expect(migrations.locator(':scope > li')).toHaveCount(26);
    const geometry = await migrations
      .locator(':scope > li')
      .evaluateAll(items =>
        items.map(item => {
          const marker = item.firstElementChild;
          const label = marker?.nextElementSibling;
          if (marker == null || label == null) {
            throw new Error('missing marker or label');
          }
          const markerBox = marker.getBoundingClientRect();
          const labelBox = label.getBoundingClientRect();
          const rtl = getComputedStyle(item).direction === 'rtl';
          return {
            height: markerBox.height,
            lineHeight: Number.parseFloat(getComputedStyle(marker).lineHeight),
            textStart: rtl ? labelBox.right : labelBox.left,
            gap: rtl
              ? markerBox.left - labelBox.right
              : labelBox.left - markerBox.right,
            width: markerBox.width,
            scrollWidth: marker.scrollWidth,
          };
        }),
      );
    const starts = geometry.map(marker => marker.textStart);
    expect(Math.max(...starts) - Math.min(...starts)).toBeLessThanOrEqual(1);
    for (const marker of geometry) {
      expect(marker.height).toBeLessThanOrEqual(marker.lineHeight + 1);
      expect(marker.scrollWidth).toBeLessThanOrEqual(marker.width + 1);
      expect(marker.gap).toBeGreaterThan(0);
    }

    // Neighboring short steps and bullets still expose their original list
    // structure. A different list's widest counter cannot change these rows.
    const steps = page.locator('ol').filter({hasText: 'Pin Core and the CLI'});
    await expect(steps.locator(':scope > li')).toHaveCount(3);
    const bullet = page
      .locator('ul')
      .filter({hasText: 'Core spacing uses rem'})
      .locator(':scope > li > span:first-child > span')
      .first();
    await expect(bullet).toBeVisible();

    await migrations.locator(':scope > li').nth(20).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(
        `migration-markers-${width}-${dir}-${colorScheme}.png`,
      ),
    });
  });
}
