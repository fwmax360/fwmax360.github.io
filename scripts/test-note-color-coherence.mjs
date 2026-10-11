import { chromium, webkit, firefox } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:4322'
const out = new URL('../artifacts/note-color-coherence/', import.meta.url)
await mkdir(out, { recursive: true })
const themes = JSON.parse(await readFile(new URL('../src/lib/seriesThemes.json', import.meta.url), 'utf8'))
const cases = []
for (const [engine, type] of Object.entries({ chromium, webkit, firefox })) {
 const browser = await type.launch(engine === 'chromium' && !process.env.CI ? { channel: 'chrome' } : {})
 try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  for (const route of ['/archive/', '/']) {
   await page.goto(origin + route)
   const rows = await page.evaluate(route => route === '/archive/'
    ? [...document.querySelectorAll('[data-archive-item]')].map(row => ({cover:row.dataset.cover, color:getComputedStyle(row.querySelector('.archive-entry')).getPropertyValue('--note-color').trim(), category:row.dataset.category, series:row.dataset.series}))
    : [...document.querySelectorAll('[data-note-hover]')].map(row => ({cover:row.dataset.noteCover, color:row.dataset.noteColor})), route)
   assert(rows.length >= 17)
   for (const row of rows) {
    const svg = await readFile(new URL('../public' + row.cover, import.meta.url), 'utf8')
    const glow = svg.match(/<radialGradient id="glow"[\s\S]*?<stop offset="0" stop-color="(#[a-f0-9]{6})"/i)?.[1]
    assert.equal(row.color, glow, `${engine} ${route} ${row.cover}: title/cover palette mismatch`)
    if (row.category && !row.series) {
     const tone = themes.categoryTones[row.category] ?? themes.defaultCategoryTone
     assert.equal(row.color, themes.palettes[tone].accent)
    }
    if (row.series && themes.known[row.series]) assert.equal(row.color, themes.palettes[themes.known[row.series].tone].accent)
   }
   const count = new Set(rows.map(row => row.color)).size
   assert.equal(count, 4, 'Four purposeful family colors, not random per-article accents')
   if (route === '/') {
    const launcher = page.locator('[data-note-hover]').filter({has:page.locator('a[href="/posts/launcher-trace/"]')})
    for (let attempt = 0; !await launcher.isVisible() && attempt < rows.length; attempt++) {
     const before = await page.locator('#recent-posts > li:not([hidden])').count()
     await page.locator('[data-more-posts]').click()
     await page.waitForFunction(count => document.querySelectorAll('#recent-posts > li:not([hidden])').length > count, before)
    }
    assert(await launcher.isVisible(), 'Launcher fixture must be revealed through the real More control')
    await launcher.scrollIntoViewIfNeeded(); await page.waitForTimeout(350)
    await launcher.locator('h3 a').evaluate(link => link.focus({preventScroll:true}))
    await page.waitForSelector('[data-note-preview][data-visible]')
    assert.equal(await page.locator('[data-note-preview]').evaluate(el => el.style.getPropertyValue('--preview-color')),themes.palettes.cyan.accent)
    assert(await launcher.locator('h3').evaluate(el => {
     const probe=document.createElement('span');probe.style.color=el.closest('[data-note-hover]').dataset.noteColor;el.append(probe)
     const expected=getComputedStyle(probe).color;probe.remove();return getComputedStyle(el).color===expected
    }))
    await page.screenshot({path:new URL(`${engine}-launcher.png`,out).pathname})
   }
   cases.push({engine, route, rows:rows.length, colorFamilies:count, errors:[...errors]})
  }
  assert.deepEqual(errors, [])
 } finally { await browser.close() }
}
await writeFile(new URL('verification.json', out), JSON.stringify({cases,scope:'Every rendered archive and homepage note palette checked against its generated SVG, three local browser engines. Human aesthetic approval remains separate.'},null,2))
console.log(JSON.stringify(cases))
