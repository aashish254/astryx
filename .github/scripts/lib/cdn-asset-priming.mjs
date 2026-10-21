// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Prime the CDN assets a starter page asks for, before a browser does.
 *
 * Both CDNs the starter page uses build a package on the first request that
 * reaches them for it, and a request that arrives while that build is running is
 * answered with an error document. For CSS that is the worst case: Chromium
 * refuses a stylesheet served as `text/plain` (`net::ERR_BLOCKED_BY_ORB`), the
 * page never goes idle, and a smoke test that launches a browser sees only a
 * navigation timeout — minutes later, on a lane every contributor's pull
 * request runs, with nothing in the output naming the cause.
 *
 * A plain `fetch` starts the same build and keeps polling it, so the page's own
 * asset URLs are requested here first and reported by URL when one of them
 * still does not serve.
 */

/** True for an answer that means the asset is there: 2xx, or a redirect to it. */
function isServable(status) {
  return status >= 200 && status < 400;
}

/** Absolute http(s) URLs only; a relative or protocol-relative link is not ours to prime. */
function isAbsoluteHttp(value) {
  return /^https?:\/\//i.test(value ?? '');
}

/**
 * Every URL the page itself fetches, in document order and deduplicated.
 *
 * Only fetched resources: stylesheets, scripts, and the import map's module
 * entries. `preconnect`/`dns-prefetch` hints name origins rather than files, and
 * a documentation link in prose is not something the page loads, so neither is
 * primed — a 404 on either would be reported as a broken starter page.
 *
 * @param {string} html the scaffolded page
 * @returns {string[]}
 */
export function pageAssetUrls(html) {
  const urls = [];

  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = /\brel="([^"]*)"/i.exec(tag)?.[1] ?? '';
    if (/preconnect|dns-prefetch/i.test(rel)) continue;
    const href = /\bhref="([^"]*)"/i.exec(tag)?.[1];
    if (isAbsoluteHttp(href)) urls.push(href);
  }

  for (const tag of html.match(/<script\b[^>]*\bsrc="[^"]*"[^>]*>/gi) ?? []) {
    const src = /\bsrc="([^"]*)"/i.exec(tag)?.[1];
    if (isAbsoluteHttp(src)) urls.push(src);
  }

  for (const block of html.match(
    /<script\b[^>]*type="importmap"[^>]*>([\s\S]*?)<\/script>/gi,
  ) ?? []) {
    const json = />([\s\S]*?)<\/script>/i.exec(block)?.[1];
    let map;
    try {
      map = JSON.parse(json ?? '');
    } catch {
      // The browser will report a malformed import map far better than this
      // probe can, and priming is only a precondition for that report.
      continue;
    }
    const entries = {...map?.imports, ...map?.scopes};
    for (const target of Object.values(entries)) {
      if (isAbsoluteHttp(target)) urls.push(target);
    }
  }

  return [...new Set(urls)];
}

/**
 * Request each URL until it serves, sharing one deadline across all of them.
 *
 * The first round asks for everything once, which is what starts a cold build;
 * only URLs that did not serve are asked again, so a page whose assets are
 * already cached costs one round trip per asset.
 *
 * @param {string[]} urls
 * @param {object} [options]
 * @param {(url: string, init: object) => Promise<{status: number}>} [options.fetchImpl]
 * @param {number} [options.deadlineMs] total budget for every retry round
 * @param {number} [options.retryDelayMs] pause between rounds
 * @param {number} [options.probeTimeoutMs] per-request timeout, so a hanging CDN cannot spend the budget
 * @param {() => number} [options.now]
 * @param {(ms: number) => Promise<void>} [options.sleep]
 * @returns {Promise<{ready: string[], cold: Array<{url: string, reason: string}>}>}
 */
export async function primeCdnAssets(
  urls,
  {
    fetchImpl = globalThis.fetch,
    deadlineMs = 120_000,
    retryDelayMs = 5_000,
    probeTimeoutMs = 10_000,
    now = Date.now,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  } = {},
) {
  const ready = new Set();
  const reasons = new Map();
  let pending = [...new Set(urls)];
  const deadline = now() + deadlineMs;

  while (pending.length > 0) {
    const stillPending = [];
    await Promise.all(
      pending.map(async url => {
        let reason;
        try {
          const response = await fetchImpl(url, {
            redirect: 'follow',
            signal: AbortSignal.timeout(probeTimeoutMs),
          });
          reason = isServable(response.status)
            ? null
            : `HTTP ${response.status}`;
        } catch (error) {
          reason = error instanceof Error ? error.name : String(error);
        }
        if (reason === null) {
          ready.add(url);
        } else {
          reasons.set(url, reason);
          stillPending.push(url);
        }
      }),
    );
    pending = stillPending;
    if (pending.length === 0) break;
    if (now() >= deadline) break;
    await sleep(retryDelayMs);
  }

  return {
    ready: [...ready],
    cold: pending.map(url => ({url, reason: reasons.get(url) ?? 'unknown'})),
  };
}
