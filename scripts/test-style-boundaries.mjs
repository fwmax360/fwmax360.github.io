import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises'
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:4322'
const out = new URL('../artifacts/performance-current/', import.meta.url)
const browser = await chromium.launch(process.env.CI ? {} : { channel: 'chrome' })
const page = await browser.newPage()
const checks = []
async function buildFiles(dir) {
 const entries = await readdir(dir, { withFileTypes: true })
 const nested = await Promise.all(entries.map(entry => entry.isDirectory() ? buildFiles(new URL(entry.name + '/', dir)) : [new URL(entry.name, dir)]))
 return nested.flat()
}
let retiredCompanion
async function inspect(route, reader) {
  await page.goto(origin + route)
  const urls = await page.locator('head link[rel="stylesheet"]:not([data-font-fallback])').evaluateAll(links => links.map(link => link.href))
  const styles = await Promise.all(urls.map(async url => {
    const response = await page.request.get(url)
    assert(response.ok())
    const css = await response.text()
    return { url, bytes: Buffer.byteLength(css), css }
  }))
  const combined = styles.map(style => style.css).join('\n')
  assert.equal(/\.prose\s*\{/.test(combined), reader, `${route} prose boundary`)
  assert.equal(/\.code-block\s*\{/.test(combined), reader, `${route} code boundary`)
  checks.push({ route, reader, cssBytes: styles.reduce((n, style) => n + style.bytes, 0), styles: styles.map(({url,bytes}) => ({url,bytes})) })
}
try {
  const built = await buildFiles(new URL('../dist/', import.meta.url))
  const cssFiles = built.filter(file => file.pathname.endsWith('.css'))
  const htmlFiles = built.filter(file => file.pathname.endsWith('.html'))
  assert(htmlFiles.length > 0 && cssFiles.length > 0, 'Production build required')
  for (const file of cssFiles) assert(!/body\.site-editorial\.site-editorial/.test(await readFile(file, 'utf8')), `Retired companion CSS emitted: ${file.pathname}`)
  for (const file of htmlFiles) {
    const html = await readFile(file, 'utf8')
    const bodyClass = html.match(/<body[^>]*\bclass=["']([^"']*)["']/)?.[1] ?? ''
    assert(!bodyClass.split(/\s+/).includes('site-editorial'), `Retired body mode: ${file.pathname}`)
  }
  retiredCompanion = { cssFiles: cssFiles.length, htmlFiles: htmlFiles.length, legacyStyles: 0, legacyBodyModes: 0 }
  for (const route of ['/', '/archive/', '/series/', '/map/', '/tags/', '/categories/Android/', '/about/']) await inspect(route, false)
  await inspect('/posts/arm64-calling-convention/', true)
  const h2 = await page.locator('.prose h2').first().evaluate(el => getComputedStyle(el).marginTop)
  assert(parseFloat(h2) >= 32)
  await page.locator('.nav-link[href="/"]').click()
  await page.waitForURL(origin + '/')
  assert.equal(await page.locator('.home-hero').count(), 1)
  const urls = await page.locator('head link[rel="stylesheet"]:not([data-font-fallback])').evaluateAll(links => links.map(link => link.href))
  const css = (await Promise.all(urls.map(async url => (await page.request.get(url)).text()))).join('\n')
  assert(!/\.code-block\s*\{/.test(css), 'Client navigation removes the reader stylesheet from the active head')
  await mkdir(out, { recursive: true })
  await writeFile(new URL('style-boundaries.json', out), JSON.stringify({ checks, retiredCompanion, clientNavigation: 'reader to home swaps reader CSS out', scope: 'Uncompressed stylesheet bytes, excluding nonblocking CJK fallback; no claim about deployed transfer compression' }, null, 2))
  console.log('Style boundaries: seven entry routes exclude reader CSS; article retains it; client navigation swaps correctly')
} finally { await browser.close() }
