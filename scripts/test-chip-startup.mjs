import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:4322';
const softwareGPU = process.argv.includes('--software-gpu');
const browser = await chromium.launch(softwareGPU ? { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : process.env.CI ? {} : { channel: 'chrome' });
const checks = [], errors = [];
try {
 const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
 page.on('pageerror', e => errors.push(e.message));
 await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true, effectiveType: '4g' } }));
 const modules = [];
 page.on('request', r => { if (/chip-preview.*\.js/.test(r.url())) modules.push(r.url()); });
 await page.goto(origin + '/silicon/');
 await page.locator('[data-start-3d]').waitFor({ state: 'visible' });
 assert.equal(modules.length, 0);
 assert.equal(await page.locator('canvas').count(), 0);
 assert(await page.locator('.scene-poster').evaluate(image => image.complete && image.naturalWidth > 0));
 assert(await page.locator('h1').isVisible());
 assert(await page.evaluate(() => document.querySelector('.scene-poster').getBoundingClientRect().top >= document.querySelector('.description').getBoundingClientRect().bottom));
 assert(await page.evaluate(() => document.querySelector('.journey').getBoundingClientRect().height <= Math.max(innerHeight, 760)));
 await mkdir(new URL('../artifacts/chip-startup/', import.meta.url), { recursive: true });
 await page.screenshot({ path: new URL('../artifacts/chip-startup/static-mobile.png', import.meta.url).pathname });
 checks.push('Data-saving entry renders a real poster and headline without requesting the 3D runtime or adding empty scroll');
 await page.locator('[data-start-3d]').click();
 await page.waitForFunction(() => window.chipPreview?.getState().ready);
 assert.equal(await page.evaluate(() => window.chipPreview.getState().quality), 'economy');
 assert.equal(await page.evaluate(() => window.chipPreview.getState().pixelRatio), 1);
 await page.locator('.scene-tools summary').click();
 await page.locator('#structure-select').selectOption('4');
 assert.equal(await page.evaluate(() => window.chipPreview.getState().selected), 4);
 await page.screenshot({ path: new URL('../artifacts/chip-startup/economy-mobile.png', import.meta.url).pathname });
 checks.push('Explicit opt-in loads the full model at economy DPR while preserving layer selection');
 // These are independent startup fixtures, not a multi-scene GPU stress test.
 // Retaining completed scenes makes CI's shared software renderer spend the retry
 // budget rendering unrelated pages. Close each fixture after its assertions.
 await page.close();
 const delayed = await browser.newPage();
 await delayed.addInitScript(() => {
  Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 8 });
  Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 8 });
 });
 delayed.on('pageerror', e => errors.push(e.message));
 let unblock;
 const gate = new Promise(resolve => { unblock = resolve; });
 await delayed.route('**/*chip-preview*.js', async route => { await gate; await route.continue(); });
 await delayed.goto(origin + '/silicon/', { waitUntil: 'domcontentloaded' });
 await delayed.locator('.scene-poster').waitFor({ state: 'visible' });
 assert(await delayed.locator('h1').isVisible());
 assert(await delayed.evaluate(() => document.querySelector('.scene-poster').getBoundingClientRect().top >= document.querySelector('.description').getBoundingClientRect().bottom));
 assert.equal(await delayed.locator('canvas').count(), 0);
 await delayed.screenshot({ path: new URL('../artifacts/chip-startup/loading-desktop.png', import.meta.url).pathname });
 unblock();
 await delayed.waitForFunction(() => window.chipPreview?.getState().ready);
 assert.equal(await delayed.locator('.scene-poster').isVisible(), false);
 checks.push('Slow module transfer keeps the poster visible until a real rendered frame is ready');
 await delayed.close();
 const retry = await browser.newPage();
 const retryConsole = [];
 retry.on('console', message => { if (['error', 'warning'].includes(message.type())) retryConsole.push({ type: message.type(), text: message.text() }); });
 retry.on('pageerror', e => errors.push(e.message));
 await retry.addInitScript(() => {
  Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 8 });
  Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 8 });
  window.__denyWebGL = true;
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, ...args) {
   if (window.__denyWebGL && /webgl/.test(type)) return null;
   return get.call(this, type, ...args);
  };
 });
 await retry.goto(origin + '/silicon/');
 await retry.waitForFunction(() => document.querySelector('.stage').dataset.boot === 'failed');
 assert.equal(await retry.locator('canvas').count(), 0);
 await retry.evaluate(() => { window.__denyWebGL = false; });
 await retry.locator('[data-start-3d]').click();
 try {
  await retry.waitForFunction(() => window.chipPreview?.getState().ready);
 } catch (error) {
  const state = await retry.evaluate(() => ({ stage: { ...document.querySelector('.stage').dataset }, preview: window.chipPreview?.getState(), hidden: document.hidden, scrollY, viewport: document.querySelector('.viewport').getBoundingClientRect().toJSON() }));
  await writeFile(new URL('../artifacts/chip-startup/failure.json', import.meta.url), JSON.stringify({ softwareGPU, state, console: retryConsole, errors }, null, 2));
  await retry.screenshot({ path: new URL('../artifacts/chip-startup/failure.png', import.meta.url).pathname });
  throw error;
 }
 assert.equal(await retry.locator('.viewport canvas').count(), 1);
 checks.push('Failed WebGL initialization releases the partial scene and can be retried in place');
 assert.deepEqual(errors, []);
 await writeFile(new URL('../artifacts/chip-startup/verification.json', import.meta.url), JSON.stringify({ checks, errors, softwareGPU, retryTimings: await retry.locator('.stage').getAttribute('data-boot-timings'), limits: ['Chromium emulation; quality policy is not a real mobile GPU benchmark.'] }, null, 2));
 console.log(checks.join('\n'));
} finally { await browser.close(); }
