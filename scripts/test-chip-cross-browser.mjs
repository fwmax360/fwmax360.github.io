import { chromium, webkit, firefox } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:4322'
const out = new URL('../artifacts/chip-cross-browser/', import.meta.url)
await mkdir(out, { recursive: true })
const results = []
const supplementalChecks = []
for (const engine of [chromium, webkit, firefox]) {
  const browser = await engine.launch(engine === chromium && !process.env.CI ? { channel: 'chrome' } : {})
  const errors = []
  const name = engine.name()
  let failure
  try {
    for (const mode of ['economy', 'balanced', 'full']) {
      const page = await browser.newPage({ viewport: { width: mode === 'balanced' ? 390 : 1440, height: 1000 }, deviceScaleFactor: 3 })
      page.on('pageerror', e => errors.push(e.message))
      await page.addInitScript(manual => {
        Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: manual, effectiveType: '4g' } })
        Object.defineProperty(navigator, 'hardwareConcurrency', { configurable: true, value: 8 })
        Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 8 })
      }, mode === 'economy')
      const ready = () => page.waitForFunction(() => document.querySelector('.stage').dataset.boot === 'ready' && window.chipPreview?.getState().ready, {}, { timeout: 60000 })
      await page.goto(origin + '/silicon/')
      if (mode === 'economy') {
        assert(await page.locator('.scene-poster').isVisible())
        assert.equal(await page.locator('canvas').count(), 0)
        await page.locator('[data-start-3d]').click()
      }
      await ready()
      const state = () => page.evaluate(() => window.chipPreview.getState())
      const initial = await state()
      assert.equal(initial.quality, mode)
      assert.equal(initial.pixelRatio, mode === 'economy' ? 1 : mode === 'balanced' ? 1.5 : 2)
      assert(initial.calls > 0 && initial.triangles > 0)
      assert.equal(await page.locator('.viewport canvas').count(), 1)
      assert(!await page.locator('.scene-poster').isVisible())
      const frames = initial.renderedFrames
      await page.evaluate(() => window.chipPreview.seek(.36))
      await page.waitForFunction(before => window.chipPreview.getState().renderedFrames > before, frames)
      assert.equal(await page.locator('.stage').getAttribute('data-shot'), '1')
      if (!(await page.locator('.scene-tools').evaluate(el => el.open))) await page.locator('.scene-tools summary').click()
      await page.locator('#structure-select').selectOption('4')
      await page.waitForFunction(() => window.chipPreview.getState().selectionVisible)
      assert.equal((await state()).selected, 4)
      await page.locator('#labels-toggle').click()
      assert.equal(await page.locator('#labels-toggle').getAttribute('aria-pressed'), 'false')
      await page.locator('#play').click()
      await page.waitForFunction(() => document.querySelector('#play').textContent.includes('Pause'))
      const playing = (await state()).progress
      await page.waitForFunction(start => window.chipPreview.getState().progress > start + .003, playing)
      await page.locator('#play').click()
      const paused = (await state()).progress
      await page.waitForTimeout(200)
      assert(Math.abs((await state()).progress - paused) < .001)
      const recoveries = []
      if (mode === 'economy') {
        for (let cycle = 0; cycle < 3; cycle++) {
          const loss = await page.evaluate(() => {
            const canvas = document.querySelector('.viewport canvas')
            const gl = canvas.getContext('webgl2')
            const extension = gl?.getExtension('WEBGL_lose_context')
            if (extension) { extension.loseContext(); return 'WEBGL_lose_context' }
            canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
            return 'synthetic context-loss event'
          })
          await page.waitForFunction(() => document.querySelector('.stage').dataset.boot === 'failed')
          assert.equal(await page.locator('canvas').count(), 0)
          assert(await page.locator('.scene-poster').isVisible())
          assert(await page.locator('[data-start-3d]').isVisible())
          assert(await page.locator('#play').isDisabled())
          assert.equal(await page.evaluate(() => typeof window.chipPreview), 'undefined')
          assert.equal(await page.locator('html').getAttribute('data-experience'), 'static')
          await page.locator('[data-start-3d]').click()
          await ready()
          assert.equal(await page.locator('canvas').count(), 1)
          assert.equal(await page.locator('#labels-toggle').getAttribute('aria-pressed'), 'true')
          const recovered = await state()
          recoveries.push({ loss, geometries: recovered.geometries, textures: recovered.textures })
        }
        assert(recoveries.every(sample => sample.geometries === recoveries[0].geometries && sample.textures === recoveries[0].textures))
      }
      const last = (await state()).renderedFrames
      await page.evaluate(() => window.chipPreview.seek(.36))
      await page.waitForFunction(before => window.chipPreview.getState().renderedFrames > before, last)
      await page.screenshot({ path: new URL(`${name}-${mode}.png`, out).pathname })
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      assert.equal((await state()).antialias, mode === 'full' ? 'msaa4' : 'fxaa')
      await page.setViewportSize({width:393,height:1000})
      await page.waitForFunction(() => { const canvas=document.querySelector('canvas'); const buffer=window.chipPreview.getState().postBuffer; return Math.abs(buffer[0]-canvas.width)<1e-6 && Math.abs(buffer[1]-canvas.height)<1e-6 })
      results.push({ engine: name, version: browser.version(), mode, initial, recoveries, checks: ['Actual rendered frame, quality and DPR', 'Layer selection and labels', 'Play progresses; Pause stops progression', 'No horizontal overflow'], limitations: 'Headless local GPU backend, not physical-device frame time or memory; renderer counters are partial resource evidence' })
      await page.close()
    }
    const reduced = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 390, height: 1000 } })
    await reduced.goto(origin + '/silicon/')
    await reduced.waitForFunction(() => document.querySelector('.stage').dataset.boot === 'ready' && window.chipPreview?.getState().ready, {}, { timeout: 60000 })
    assert((await reduced.evaluate(() => window.chipPreview.getState())).reduced)
    assert(await reduced.locator('#play').isDisabled())
    assert.equal(await reduced.locator('[data-status]').innerText(), 'REDUCED MOTION')
    await reduced.close()
    const interrupted = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    interrupted.on('pageerror', e => errors.push(e.message))
    await interrupted.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true, effectiveType: '4g' } })
      const observer = new MutationObserver(() => {
        const stage = document.querySelector('.stage')
        const canvas = stage?.querySelector('canvas')
        if (stage?.getAttribute('data-ready') === 'true' && stage.getAttribute('data-boot') === 'loading' && canvas) {
          observer.disconnect()
          canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }))
        }
      })
      observer.observe(document, { subtree: true, attributes: true, attributeFilter: ['data-ready'] })
    })
    await interrupted.goto(origin + '/silicon/')
    await interrupted.locator('[data-start-3d]').click()
    await interrupted.waitForFunction(() => document.querySelector('.stage').dataset.boot === 'failed')
    await interrupted.waitForTimeout(250)
    assert.equal(await interrupted.locator('.stage').getAttribute('data-boot'), 'failed', 'Stale startup must not overwrite a context-loss fallback')
    assert.equal(await interrupted.locator('canvas').count(), 0)
    await interrupted.locator('[data-start-3d]').click()
    await interrupted.waitForFunction(() => document.querySelector('.stage').dataset.boot === 'ready' && window.chipPreview?.getState().ready)
    await interrupted.close()
    supplementalChecks.push({ engine: name, reducedMotion: 'static controls; playback disabled', startupInterruption: 'synthetic context-loss event between first render and boot completion; stale ready suppressed; retry rendered successfully' })
    assert.deepEqual(errors, [], `${name} runtime errors`)
    console.log(`${name}: three quality tiers, rendering, controls, repeated recovery, startup interruption and reduced motion passed`)
  } catch (error) {
    failure = String(error)
    const lastPage = browser.contexts().at(-1)?.pages().at(-1)
    await lastPage?.screenshot({ path: new URL(`${name}-failure.png`, out).pathname }).catch(() => {})
    throw error
  } finally {
    await writeFile(new URL('verification.json', out), JSON.stringify({ results, supplementalChecks, completedEngines: supplementalChecks.map(check => check.engine), failure, scope: 'Local Playwright Chromium/WebKit/Firefox; no installed Safari/iPhone certification' }, null, 2))
    await browser.close()
  }
}
