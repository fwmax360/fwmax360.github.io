import { chromium, webkit, firefox } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:4322'
const phase = process.env.TEST_PHASE || 'current'
const out = new URL('../artifacts/note-preview-loading/', import.meta.url)
await mkdir(out, { recursive: true })
const cases = []
for (const [engine, type] of Object.entries({ chromium, webkit, firefox })) {
 const browser = await type.launch(engine === 'chromium' && !process.env.CI ? { channel: 'chrome' } : {})
 const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
 const held = new Map(), errors = []
 page.on('pageerror', error => errors.push(error.message))
 try {
  await page.goto(origin)
  await page.locator('[data-note-hover]').first().scrollIntoViewIfNeeded()
  await page.waitForTimeout(350)
  const items = page.locator('[data-note-hover]')
  const covers = await items.evaluateAll(els => els.map(el => el.dataset.noteCover))
  const next = covers.findIndex(cover => cover !== covers[0])
  assert(next > 0)
  const third = covers.findIndex(cover => cover !== covers[0] && cover !== covers[next])
  assert(third > 0)
  const delayed = new Set([covers[next], covers[third]])
  await page.route('**/covers/posts/*.svg*', async route => {
   const path = new URL(route.request().url()).pathname
   if (delayed.delete(path)) await new Promise(resolve => held.set(path, resolve))
   try { await route.continue() } catch { /* Leaving cancels pending images. */ }
  })
  const focus = async index => { await items.nth(index).locator('h3 a').evaluate(link => link.focus({ preventScroll: true })) }
  await focus(0)
  await page.waitForSelector('[data-note-preview][data-visible]')
  await focus(next)
  const waitHeld = async cover => {
   for (let n = 0; n < 100 && !held.has(cover); n++) await new Promise(resolve => setTimeout(resolve, 20))
   assert(held.has(cover), `${engine}: held image request observed`)
  }
  await waitHeld(covers[next])
  await page.waitForTimeout(200)
  const staleVisible = await page.locator('[data-note-preview]').getAttribute('data-visible') !== null
  await focus(third); await waitHeld(covers[third])
  held.get(covers[next])(); held.delete(covers[next])
  await page.waitForTimeout(200)
  const obsoleteVisible = await page.locator('[data-note-preview]').getAttribute('data-visible') !== null
  held.get(covers[third])(); held.delete(covers[third])
  await page.waitForSelector('[data-note-preview][data-visible]')
  assert.equal(await page.locator('[data-note-preview-image]').getAttribute('src'), covers[third])
  assert(await page.locator('[data-note-preview-image]').evaluate(img => img.complete && img.naturalWidth > 0 && img.currentSrc === img.src))
  await page.waitForTimeout(350)
  await page.screenshot({ path: new URL(`${engine}-${phase}.png`, out).pathname })
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-note-preview][data-visible]', { state: 'detached' })
  await focus(0); await page.waitForSelector('[data-note-preview][data-visible]')
  // Dismiss a pending request: its later completion must not resurrect the preview.
  delayed.add(covers[next])
  await items.nth(next).evaluate((item, cover) => { item.dataset.noteCover = cover + '?preview=exit' }, covers[next])
  await focus(next); await waitHeld(covers[next])
  await page.keyboard.press('Escape')
  held.get(covers[next])(); held.delete(covers[next])
  await page.waitForTimeout(250)
  assert.equal(await page.locator('[data-note-preview]').getAttribute('data-visible'), null)
  await focus(0); await page.waitForSelector('[data-note-preview][data-visible]')
  assert.deepEqual(errors, [])
  cases.push({ engine, staleVisible, obsoleteVisible, errors })
 } finally { for (const release of held.values()) release(); await browser.close() }
}
await writeFile(new URL(`${phase}.json`, out), JSON.stringify({ phase, cases }, null, 2))
if (phase !== 'before') for (const result of cases) {
 assert.equal(result.staleVisible, false, `${result.engine}: pending source must not reveal old bitmap`)
 assert.equal(result.obsoleteVisible, false, `${result.engine}: obsolete resource must not reveal current pending source`)
}
console.log(JSON.stringify(cases))
