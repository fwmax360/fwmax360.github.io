import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:4322';
const browser = await chromium.launch(process.env.CI ? {} : { channel: 'chrome' });
const checks = [];
const errors = [];
const page = await browser.newPage();
page.on('pageerror', error => errors.push(error.message));
try {
  for (const route of ['/', '/archive/', '/series/', '/tags/', '/map/', '/about/', '/silicon/']) {
    await page.goto(origin + route);
    assert.equal(await page.locator('h1').count(), 1, `${route}: one primary heading`);
    await assert.doesNotReject(() => page.locator('link[rel="canonical"]').getAttribute('href'));
    assert(await page.locator('meta[property="og:title"]').getAttribute('content'));
    for (const width of (route === '/' ? [320, 390, 640, 700, 701, 768, 1000, 1440] : [320, 390, 768, 1440])) {
      await page.setViewportSize({ width, height: route === '/' ? 844 : 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} overflows at ${width}`);
      if (route === '/' || route === '/archive/') {
        const grid = await page.evaluate(() => {
          const main = document.querySelector('main');
          const left = main.getBoundingClientRect().left + parseFloat(getComputedStyle(main).paddingLeft);
          return { content: left, brand: document.querySelector('.nav .brand').getBoundingClientRect().left, footer: document.querySelector('.footer .inner').getBoundingClientRect().left };
        });
        assert(Math.abs(grid.content-grid.brand) < 1 && Math.abs(grid.content-grid.footer) < 1, `${route} chrome shares the content grid at ${width}`);
      }

      if (route === '/') {
        const entry = await page.locator('.silicon-cta').evaluate(el => ({ height: el.getBoundingClientRect().height, font: parseFloat(getComputedStyle(el).fontSize) }));
        assert(entry.height >= 44 && entry.font >= 12, `Silicon entry remains readable and touch-sized at ${width}`);
        assert(await page.locator('.silicon-summary').isVisible(), `Silicon entry keeps its context at ${width}`);
        if (width <= 700) assert(await page.locator('.featured h3').evaluate(el => el.getBoundingClientRect().bottom < innerHeight), `Latest title stays in the first screen at ${width}`);
      }
    }
  }
  checks.push('Seven core routes have canonical/OG metadata, one h1, and no viewport overflow');
  await page.goto(origin + '/');
  assert.equal(await page.locator('.research-opening h1').count(), 1);
  assert.equal(await page.locator('.browse').count(), 0, 'Research paths replace the homepage sidebar');
  assert(await page.locator('.research-path').count() > 0);
  for (const path of await page.locator('.research-path').all()) {
    assert((await path.getAttribute('href')).startsWith('/categories/'));
    assert(await path.locator('h3').innerText());
  }
  await page.locator('.primary-entry').click();
  assert.equal(await page.evaluate(() => location.hash), '#notes');
  checks.push('Research homepage has a spatial opening, real category paths and a working reading anchor');

  await page.goto(origin + '/map/');
  assert.equal(await page.locator('.knowledge-graph').getAttribute('role'), 'group');
  assert.equal(await page.locator('.hero-stats > div > span').count(), 0);
  checks.push('Knowledge graph preserves interactive semantics and valid definition-list groups');
  const sitemap = await (await page.request.get(origin + '/sitemap-0.xml')).text();
  assert(!sitemap.includes('/chip-preview/'));
  assert(sitemap.includes('/silicon/'));
  checks.push('Formal silicon page is indexed; preview route is excluded from sitemap');
  const samplePath = '/posts/silicon-trust-boundary/';
  assert(!sitemap.includes(samplePath));
  assert(!(await (await page.request.get(origin + '/rss.xml')).text()).includes(samplePath));
  for (const route of ['/', '/archive/', '/map/']) {
    await page.goto(origin + route);
    assert.equal(await page.locator(`a[href="${samplePath}"]`).count(), 0);
  }
  await page.goto(origin + samplePath);
  assert.match(await page.locator('meta[name="robots"]').getAttribute('content'), /noindex/);
  assert.equal(await page.locator('html').getAttribute('data-pagefind-ignore'), 'all');
  assert.match(await page.locator('article').innerText(), /专题示例/);
  checks.push('Sample remains directly readable, but is absent from lists, graph, RSS and sitemap');


  await page.goto(origin);
  const hiddenBefore = await page.locator('[data-extra-post][hidden]').count();
  await page.locator('[data-more-posts]').click();
  assert.equal(await page.locator('[data-extra-post][hidden]').count(), Math.max(0, hiddenBefore - 4));
  checks.push('Homepage more-posts controller still expands four rows after legacy art cleanup');
  await page.locator('[data-search-open]').first().click();
  const searchFocus = await page.locator('[data-search-input]').evaluate(input => {
    const style = getComputedStyle(input);
    return { focused: input === document.activeElement, visible: input.matches(':focus-visible'), width: parseFloat(style.outlineWidth), outline: style.outlineStyle };
  });
  assert(searchFocus.focused && searchFocus.visible && searchFocus.width >= 2 && searchFocus.outline !== 'none', 'Search input retains a visible keyboard focus indicator');
  const brandContrast = await page.locator('.search-brand').evaluate(brand => {
    // Resolve the current flat footer surfaces, including alpha, rather than testing a token alone.
    const rgb = value => (value.match(/[\d.]+/g) || []).map(Number);
    const over = (front, back) => front.slice(0, 3).map((v, i) => v * (front[3] ?? 1) + back[i] * (1 - (front[3] ?? 1)));
    const ancestors = []; for (let el = brand.parentElement; el; el = el.parentElement) ancestors.unshift(el);
    let background = [0, 0, 0];
    for (const el of ancestors) background = over(rgb(getComputedStyle(el).backgroundColor), background);
    const style = getComputedStyle(brand);
    const foreground = rgb(style.color); foreground[3] = (foreground[3] ?? 1) * Number(style.opacity);
    const luminance = color => color.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const fg = luminance(over(foreground, background)), bg = luminance(background);
    return (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05);
  });
  assert(brandContrast >= 4.5, `Search attribution contrast is ${brandContrast.toFixed(2)}:1`);
  checks.push('Open search has a visible keyboard input focus and attribution contrast of at least 4.5:1');
  await page.locator('[data-search-input]').fill('Frida');
  await page.locator('.search-item').first().waitFor();
  assert.equal(await page.locator('[data-search-results]').isVisible(), true);
  assert.equal(await page.locator('[data-search-message]').isVisible(), false);
  assert.equal(await page.locator('[data-search-input]').getAttribute('aria-expanded'), 'true');
  await page.locator('[data-search-input]').fill('镧铈钷镤锿镄');
  await page.waitForFunction(() => document.querySelector('[data-search-status]').textContent.includes('没有搜索结果'));
  assert.equal(await page.locator('[data-search-results]').isVisible(), false);
  assert.equal(await page.locator('[data-search-results]').locator('p').count(), 0);
  assert.equal(await page.locator('[data-search-message]').isVisible(), true);
  assert.equal(await page.locator('[data-search-input]').getAttribute('aria-expanded'), 'false');
  checks.push('Search listbox owns only actual options; empty messages stay outside the collapsed popup');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog[data-search]').open);
  assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  checks.push('Search works; one Escape closes the dialog and restores page scrolling');
  await page.locator('[data-search-open]').first().click();
  await page.locator('[data-search-input]').fill('TrustZone');
  await page.waitForFunction(() => {
    const status = document.querySelector('[data-search-status]').textContent;
    return status.includes('条结果') || status.includes('没有搜索结果');
  });
  assert.equal(await page.locator(`.search-item[href="${samplePath}"]`).count(), 0);
  await page.keyboard.press('Escape');
  checks.push('Pagefind excludes the sample article from actual search results');

  assert.deepEqual(errors, []);

  // Use a fresh context so successful fragment requests cannot mask a network failure.
  const failure = await browser.newPage({ viewport: { width: 390, height: 844 } });
  failure.on('pageerror', error => errors.push(error.message));
  await failure.route('**/pagefind/fragment/**', route => route.abort());
  await failure.goto(origin);
  await failure.locator('[data-search-open]').first().click();
  await failure.locator('[data-search-input]').fill('Frida');
  await failure.locator('[data-search-retry]').waitFor({ state: 'visible' });
  for (const selector of ['[data-search-close]', '[data-search-clear]', '[data-search-retry]']) {
    const box = await failure.locator(selector).boundingBox();
    assert(box && box.height >= 44 && box.width >= 44, `${selector} has a 44px mobile target`);
  }
  assert.match(await failure.locator('[data-search-status]').textContent(), /重试/);
  assert.equal(await failure.locator('[data-search-results]').isVisible(), false);
  assert.equal(await failure.locator('[data-search-message]').isVisible(), true);
  assert.equal(await failure.locator('[data-search-results]').getAttribute('aria-busy'), null);
  await failure.unroute('**/pagefind/fragment/**');
  await failure.locator('[data-search-retry]').click();
  await failure.locator('.search-item').first().waitFor();
  assert.equal(await failure.locator('[data-search-retry]').isVisible(), false);
  assert.deepEqual(errors, []);
  checks.push('Failed search fragments show feedback and recover on retry, without uncaught exceptions');
  await mkdir(new URL('../artifacts/product-quality/', import.meta.url), { recursive: true });
  await writeFile(new URL('../artifacts/product-quality/verification.json', import.meta.url), JSON.stringify({ checks, errors, scope: 'Chromium; no real-device or cross-browser claim' }, null, 2));
  console.log(checks.join('\n'));
} finally {
  await browser.close();
}
