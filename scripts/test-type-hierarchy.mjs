import {chromium,webkit,firefox} from '@playwright/test'
import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'

const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:4322'
const out = new URL('../artifacts/type-hierarchy-2026-10-10/',import.meta.url)
await mkdir(out,{recursive:true})
const routes = ['/', '/archive/', '/posts/behavioral-neural-risk/', '/posts/android-vpn-capture/']
const captions = ['.opening-index','.opening-foot','.stage-label','.stage-caption','.feature-section > .section-head h2','.entry-date','.archive-years span','.year-head > span','.month-head h3','.inspector-meta','.article-editorial .series-position','.article-editorial .series-n']
const metadata = ['.home .meta','.home .row-read','.silicon-summary','.silicon-cta','.entry-meta','.archive-status','.article-editorial .meta','.article-editorial .meta .copy-link']
const results = []

for (const [engine,type] of Object.entries({chromium,webkit,firefox})) {
  const browser = await type.launch(engine === 'chromium' && !process.env.CI ? {channel:'chrome'} : {})
  try {
    const page = await browser.newPage({reducedMotion:'reduce'})
    const errors = []
    page.on('pageerror',error => errors.push(error.message))
    for (const route of routes) for (const width of [320,390,1440]) for (const scale of [1,2]) {
      await page.setViewportSize({width,height:1100})
      await page.goto(origin + route)
      if (route.includes('android-vpn-capture')) await page.locator('.series-fold').evaluate(el => {el.open = true})
      await page.evaluate(scale => {document.documentElement.style.fontSize = `${16*scale}px`},scale)
      await page.evaluate(() => document.fonts.ready)
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))))
      await page.waitForFunction(({metadata,expected}) => {
        const el = document.querySelector(metadata.join(','))
        return el && parseFloat(getComputedStyle(el).fontSize) === expected
      },{metadata,expected:13*scale})
      const sizes = await page.evaluate(({captions,metadata}) => {
        const measure = selectors => selectors.flatMap(selector => [...document.querySelectorAll(selector)]
          .filter(el => el.checkVisibility())
          .map(el => ({selector,size:parseFloat(getComputedStyle(el).fontSize)})))
        return {captions:measure(captions),metadata:measure(metadata),overflow:document.documentElement.scrollWidth > innerWidth}
      },{captions,metadata})
      assert(!sizes.overflow,`${engine} ${route} ${width} ${scale}: horizontal overflow`)
      assert(sizes.captions.every(item => item.size >= 12*scale),`${engine} ${route} ${width} ${scale}: caption below 12px base ${JSON.stringify(sizes.captions)}`)
      assert(sizes.metadata.every(item => item.size === 13*scale),`${engine}: metadata differs from shared 13px level`)
      assert(sizes.metadata.length > 0)
      const navigation = await page.locator('.nav .brand,.nav .search-trigger,.nav .menu-toggle').evaluateAll(nodes => nodes.filter(el => el.checkVisibility()).map(el => {const r=el.getBoundingClientRect();return {left:r.left,right:r.right}}))
      assert(navigation.every(r => r.left >= 0 && r.right <= width + 1),'Navigation controls clipped at large text')
      if (route === '/') {
        assert.equal(await page.locator('.silicon-eyebrow,.stage-coordinate').count(),0)
        assert(!(await page.locator('.opening-foot').innerText()).includes('Observe.'))
        const bounds = await page.locator('.stage-label,.stage-caption,.silicon-cta').evaluateAll(nodes => nodes.map(el => {
          const r = el.getBoundingClientRect()
          return {left:r.left,right:r.right,width:r.width,scroll:el.scrollWidth,client:el.clientWidth,height:r.height}
        }))
        assert(bounds.every(r => r.left >= 0 && r.right <= width + 1 && r.scroll <= r.client + 1),'Chip labels/action clip')
        assert(bounds.at(-1).height >= 44)
        if (scale === 1) assert(await page.locator('.featured h3').evaluate(el => el.getBoundingClientRect().bottom < 1100))
      }
      if (route === '/archive/') {
        await page.locator('.archive-tools').evaluate(el => {el.open = true})
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),'Expanded filters overflow')
        await page.locator('[data-density="compact"]').click()
        assert.equal(await page.locator('[data-archive]').getAttribute('data-archive-density'),'compact')
        await page.locator('[data-density="editorial"]').click()
      }
      if (engine === 'chromium' && [390,1440].includes(width)) {
        const name = route === '/' ? 'home' : route === '/archive/' ? 'archive' : route.includes('behavioral') ? 'article' : 'series-article'
        await page.screenshot({path:new URL(`${name}-${width}-${scale}x.png`,out).pathname})
      }
      results.push({engine,route,width,scale,...sizes})
    }
    assert.deepEqual(errors,[])
    await page.close()
  } finally {await browser.close()}
}

await writeFile(new URL('verification.json',out),JSON.stringify({verifiedAt:new Date().toISOString(),cases:results.length,results,scope:'Three installed browser engines, four routes, 320/390/1440 widths and 100/200% root text scaling; not physical phones or platform-native fonts.'},null,2)+'\n')
console.log(`Shared 12px captions / 13px metadata: ${results.length} responsive cases passed`)
