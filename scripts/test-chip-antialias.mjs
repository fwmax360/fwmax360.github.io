import { chromium, webkit, firefox } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:4322'
const out = new URL('../artifacts/chip-aa/', import.meta.url)
await mkdir(out, { recursive: true })
const results = []
const percentile = (values, p) => [...values].sort((a,b) => a-b)[Math.min(values.length-1, Math.floor(values.length*p))]
for (const engine of [chromium, webkit, firefox]) {
  const browser = await engine.launch(engine === chromium && !process.env.CI ? { channel: 'chrome' } : {})
  const errors = []
  try {
    for (const tier of ['economy', 'balanced']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 1000 }, deviceScaleFactor: 3 })
      page.on('pageerror', error => errors.push(error.message))
      await page.addInitScript(manual => {
        Object.defineProperty(navigator, 'hardwareConcurrency', { configurable:true, value:8 })
        Object.defineProperty(navigator, 'deviceMemory', { configurable:true, value:8 })
        Object.defineProperty(navigator, 'connection', { configurable:true, value:{saveData:manual,effectiveType:'4g'} })
      }, tier === 'economy')
      await page.goto(origin + '/silicon/')
      if (tier === 'economy') await page.locator('[data-start-3d]').click()
      await page.waitForFunction(() => document.querySelector('.stage').dataset.boot === 'ready' && window.chipPreview?.getState().ready)
      await page.locator('.scene-tools summary').click()
      await page.locator('#labels-toggle').click()
      const compare = []
      for (const enabled of [false,true,false]) {
        const before = await page.evaluate(() => window.chipPreview.getState().renderedFrames)
        await page.evaluate(enabled => { window.chipPreview.setAntialias(enabled); window.chipPreview.seek(.36) }, enabled)
        await page.waitForFunction(before => window.chipPreview.getState().renderedFrames > before, before)
        const state = await page.evaluate(() => window.chipPreview.getState())
        assert.equal(state.antialias, enabled ? 'fxaa' : 'off')
        assert.equal(state.quality, tier)
        const canvas = await page.locator('.viewport canvas').evaluate(el => ({width:el.width,height:el.height}))
        assert(Math.abs(state.aaResolution[0] - 1/canvas.width) < 1e-8)
        assert(Math.abs(state.aaResolution[1] - 1/canvas.height) < 1e-8)
        await page.locator('.viewport').screenshot({ path: new URL(`${engine.name()}-${tier}-${enabled?'on':compare.length?'off-repeat':'off'}.png`,out).pathname })
        // Warm-up excludes the first shader compile. These are elapsed CPU/driver
        // composer.render calls, NOT GPU timer queries or physical-device FPS.
        const timings = await page.evaluate(async () => {
          const values=[]
          for(let i=0;i<25;i++){
            const before=window.chipPreview.getState().renderedFrames
            window.chipPreview.setProgress(.36)
            while(window.chipPreview.getState().renderedFrames<=before)await new Promise(resolve=>requestAnimationFrame(resolve))
            if(i>=5)values.push(window.chipPreview.getState().lastSubmitMs)
          }
          return values
        })
        compare.push({enabled,calls:state.calls,triangles:state.triangles,pixelRatio:state.pixelRatio,canvas,aaResolution:state.aaResolution,submitMs:{median:percentile(timings,.5),p95:percentile(timings,.95)}})
      }
      const hashes = await Promise.all(['off','on','off-repeat'].map(async mode => createHash('sha256').update(await readFile(new URL(`${engine.name()}-${tier}-${mode}.png`,out))).digest('hex')))
      assert.equal(hashes[0], hashes[2], 'Same engine fixed-frame off repeats must match')
      assert.notEqual(hashes[0], hashes[1], 'The enabled pass must actually change rendered pixels')
      assert.equal(compare[1].calls, compare[0].calls+1)
      assert.equal(compare[1].triangles, compare[0].triangles+1)
      assert.equal(compare[1].pixelRatio, compare[0].pixelRatio)
      assert.equal(compare[1].canvas.width, compare[0].canvas.width)
      await page.evaluate(() => window.chipPreview.setAntialias(true))
      await page.setViewportSize({width:393,height:900})
      await page.waitForFunction(() => { const canvas=document.querySelector('.viewport canvas');const resolution=window.chipPreview.getState().aaResolution;return Math.abs(resolution[0]-1/canvas.width)<1e-8 && Math.abs(resolution[1]-1/canvas.height)<1e-8 })
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
      results.push({sameEngineOffRepeatExact:hashes[0]===hashes[2],onPixelsChanged:hashes[0]!==hashes[1],engine:engine.name(),version:browser.version(),tier,compare,resize:'AA texel resolution follows actual buffer size',scope:'Fixed camera .36, labels off, 390x1000 DPR3 headless local browser; not real phone timing'})
      await page.close()
    }
    assert.deepEqual(errors,[])
    console.log(`${engine.name()}: fixed-frame off/on/off comparison and resize passed`)
  } finally {
    await writeFile(new URL('verification.json',out),JSON.stringify({results,limits:['Timing measures elapsed composer.render CPU/driver calls, not GPU timer or true frame time','Comparisons are fixed frames on local headless browsers, not iPhone/Safari visual certification']},null,2))
    await browser.close()
  }
}
