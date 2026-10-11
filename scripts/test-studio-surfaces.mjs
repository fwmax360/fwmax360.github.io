import { chromium, firefox, webkit } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:4322';
const routes = ['/', '/archive/', '/series/', '/tags/', '/map/', '/about/', '/posts/abl-android-handoff/', '/rss/', '/404.html'];
const results = [];
await mkdir('artifacts/studio', { recursive: true });
for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch(name === 'chromium' && !process.env.CI ? { channel: 'chrome' } : {});
  try {
    for (const width of [390, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      for (const route of routes) {
        await page.goto(origin + route);
        assert.equal(await page.locator('h1').count(), 1, `${name} ${route}: one heading`);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} ${route}: overflow`);
        assert.equal(await page.locator('.nav').evaluate(e => getComputedStyle(e).borderBottomWidth), '0px', `${route}: no decorative nav rule`);
        if (['/', '/archive/', '/series/', '/tags/', '/map/', '/about/'].includes(route)) {
          assert(await page.locator('.nav-link.active').evaluate(e => getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)'), `${route}: active location visible`);
        }
        // Load lazy covers before checking assets; retain existing native loading.
        for (const img of await page.locator('.feature-cover img,.note-thumb img,.path-art img').all()) {
          if (await img.isVisible()) {
            await img.scrollIntoViewIfNeeded();
            await img.evaluate(e => e.decode());
            assert(await img.evaluate(e => e.naturalWidth > 0), `${route}: actual cover loaded`);
          }
        }
        await page.locator('.search-trigger').focus();
        assert(await page.locator('.search-trigger').evaluate(e => e === document.activeElement && getComputedStyle(e).outlineStyle !== 'none'), `${route}: keyboard focus`);
        await page.evaluate(() => window.scrollTo(0, 0));
        if (name === 'chromium') await page.screenshot({ path: `artifacts/studio/${route === '/' ? 'home' : route.split('/').filter(Boolean).join('-')}-${width}.png`, fullPage: true });
        results.push({ engine: name, width, route });
      }
      assert.deepEqual(errors, [], `${name}: no uncaught UI errors`);
      await context.close();
    }
    const page = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });
    for (const route of ['/', '/series/', '/posts/abl-android-handoff/']) {
      await page.goto(origin + route);
      assert(await page.locator('h1').isVisible(), `${route}: static content retained`);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route}: no-JS overflow`);
      results.push({ engine: name, width: 390, route, javaScript: false });
    }
  } finally { await browser.close(); }
}
await writeFile('artifacts/studio/checks.json', JSON.stringify(results, null, 2));
console.log(`${results.length} studio surface cases passed: 3 engines, mobile/desktop, reduced motion, covers, focus and static reading.`);
