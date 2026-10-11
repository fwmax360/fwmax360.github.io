import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:4322';
const browser = await chromium.launch(process.env.CI ? {} : { channel: 'chrome' });
const checks = [], errors = [];
async function checkFonts(page, serif) {
  await page.waitForFunction(() => [...document.querySelectorAll('link[data-font-fallback]')].every(link => link.media === 'all'));
  assert.equal(await page.locator('link[data-font-fallback]').count(), serif ? 2 : 1);
  const loaded = await page.evaluate(async serif => {
    const sample = '中文技术笔记信任边界，阅读与代码。';
    const sans = await document.fonts.load('400 16px "Noto Sans SC Variable"', sample);
    const song = serif ? await document.fonts.load('400 16px "Noto Serif SC Variable"', sample) : [];
    return { sans: sans.length, serif: song.length };
  }, serif);
  assert(loaded.sans > 0, 'Chinese sans fallback glyphs load');
  if (serif) assert(loaded.serif > 0, 'Chinese serif fallback glyphs load');
}
try {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if(r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(origin);
  await checkFonts(page, false);
  assert.equal(await page.locator('link[rel="preload"][as="font"]').count(), 1);
  await page.locator('.feature-copy h3 a').first().click();
  await page.waitForURL('**/posts/**');
  await checkFonts(page, false);
  assert.equal(await page.locator('link[rel="preload"][as="font"]').count(), 2);
  await page.locator('.nav-link[href="/about"]').click();
  await page.waitForURL(/\/about\/?$/);
  await checkFonts(page, false);
  checks.push('Full Chinese sans fallback loads on cold entry/client navigation; ordinary articles do not load unused serif styles');
  checks.push('Homepage preloads only UI Latin; code-reading routes also preload monospace Latin');

  const disabled = await browser.newPage({ javaScriptEnabled: false });
  disabled.on('response', r => { if(r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await disabled.goto(origin + '/posts/behavioral-neural-risk/');
  const faces = await disabled.evaluate(async () => {
    const sample = '中文技术笔记';
    const sans = await document.fonts.load('400 16px "Noto Sans SC Variable"', sample);
    return { sans: sans.length, serif: [...document.fonts].filter(face => face.family.includes('Noto Serif SC')).length };
  });
  assert(faces.sans > 0 && faces.serif === 0);
  checks.push('JavaScript-disabled article still loads full Chinese fallback styles');
  // Optional serif capability remains available, but is no longer imposed on every reader.
  const files = await readdir(new URL('../dist/_astro/', import.meta.url));
  const serifFile = files.find(file => /^editorial-font\..*\.css$/.test(file));
  assert(serifFile, 'Optional serif asset retained');
  await page.addStyleTag({ url: `${origin}/_astro/${serifFile}` });
  const optional = await page.evaluate(async () => (await document.fonts.load('400 16px "Noto Serif SC Variable"', '中文技术笔记信任边界')).length);
  assert(optional > 0, 'Explicit optional serif stylesheet supplies Chinese glyphs');
  checks.push('Explicit optional serif stylesheet loads full Chinese glyphs without changing ordinary reader fonts');
  assert.deepEqual(errors, []);
  await mkdir(new URL('../artifacts/font-loading/', import.meta.url), { recursive: true });
  await writeFile(new URL('../artifacts/font-loading/verification.json', import.meta.url), JSON.stringify({ checks, errors, limits: ['Chromium and explicit fallback font loading; not a real Windows/Linux visual audit.'] }, null, 2));
  console.log(checks.join('\n'));
} finally { await browser.close(); }
