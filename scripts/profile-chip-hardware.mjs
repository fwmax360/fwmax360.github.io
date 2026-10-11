import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const origin = process.env.PREVIEW_URL || 'http://127.0.0.1:4322'
const out = new URL('../artifacts/chip-hardware-profile/', import.meta.url)
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
const runs = []
try {
 for (const width of [1440, 390]) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto(origin + '/silicon/')
  await page.waitForFunction(() => window.chipPreview?.getState().ready && document.querySelector('.stage').dataset.boot === 'ready')
  const result = await page.evaluate(async () => {
   const api = window.chipPreview
   const cold = api.getState()
   const gl = document.querySelector('.stage canvas').getContext('webgl2')
   const debug = gl.getExtension('WEBGL_debug_renderer_info')
   const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2')
   const backend = { renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR), ua: navigator.userAgent, cores: navigator.hardwareConcurrency, memory: navigator.deviceMemory, timerAvailable: !!ext }
   const pending = [], gpu = [], originals = new Map()
   let active = null, disjoint = 0
   if (ext) for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
    originals.set(name, gl[name])
    gl[name] = function (...args) {
     if (!active) {
      active = gl.createQuery()
      gl.beginQuery(ext.TIME_ELAPSED_EXT, active)
      queueMicrotask(() => { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(active); active = null })
     }
     return originals.get(name).apply(this, args)
    }
   }
   const collect = () => {
    if (ext && gl.getParameter(ext.GPU_DISJOINT_EXT)) { disjoint++; for (const q of pending.splice(0)) gl.deleteQuery(q); return }
    for (let i = pending.length - 1; i >= 0; i--) if (gl.getQueryParameter(pending[i], gl.QUERY_RESULT_AVAILABLE)) {
     gpu.push(gl.getQueryParameter(pending[i], gl.QUERY_RESULT) / 1e6)
     gl.deleteQuery(pending[i]); pending.splice(i, 1)
    }
   }
   const frame = () => new Promise(resolve => requestAnimationFrame(resolve))
   const cpu = [], counters = []
   // Two complete passes warm shader/material variants before measured passes.
   for (let pass = 0; pass < 5; pass++) {
    for (let step = 0; step < 40; step++) {
     const before = api.getState().renderedFrames
     api.setProgress((step + .5) / 40)
     for (let wait = 0; api.getState().renderedFrames === before && wait < 120; wait++) await frame()
     const state = api.getState()
     if (state.renderedFrames === before) throw new Error('Scene did not submit a requested frame')
     collect()
     if (pass >= 2) cpu.push(state.lastSubmitMs)
    }
    for (let wait = 0; wait < 10; wait++) { await frame(); collect() }
    counters.push(api.getState())
    if (pass === 1) gpu.length = 0
   }
   for (let wait = 0; pending.length && wait < 120; wait++) { await frame(); collect() }
   for (const [name, fn] of originals) gl[name] = fn
   for (const q of pending) gl.deleteQuery(q)
   const idleStart = api.getState().renderedFrames
   await new Promise(resolve => setTimeout(resolve, 1000))
   const idleFrames = api.getState().renderedFrames - idleStart
   const distribution = values => {
    const sorted = [...values].sort((a,b) => a-b)
    return { samples: sorted.length, p50: sorted[Math.floor((sorted.length-1)*.5)] ?? null, p95: sorted[Math.floor((sorted.length-1)*.95)] ?? null, max: sorted.at(-1) ?? null }
   }
   return { backend, cold, cpuSubmitMs: distribution(cpu), gpuDrawIntervalMs: distribution(gpu), disjoint, unansweredQueries: pending.length, counters, idleFrames }
  })
  assert.deepEqual(errors, [])
  assert.equal(result.cpuSubmitMs.samples, 120)
  assert.equal(result.idleFrames, 0)
  const warm = result.counters.slice(2)
  assert.equal(new Set(warm.map(s => s.geometries)).size, 1)
  assert.equal(new Set(warm.map(s => s.textures)).size, 1)
  runs.push({ width, height: 1000, dpr: 1, errors, ...result })
  console.log(JSON.stringify(runs.at(-1)))
  await context.close()
 }
 await writeFile(new URL('current.json', out), JSON.stringify({ measuredAt: new Date().toISOString(), runs, limits: ['Actual local Chrome hardware backend; no capability, CPU, network, or GPU overrides.', 'Mobile width is a desktop GPU fixture, not a physical mobile device measurement.', 'Two warmup passes; three measured passes, same 40 progress positions per pass.', 'CPU is composer.render submission only; GPU timer covers first draw through end of synchronous render task, omitting pre-first-draw work.', 'Not presentation FPS; instrumentation adds overhead. Resource counters are partial evidence, not GPU memory bytes or route-disposal proof.', 'Different viewport fixtures are not an isolated optimization comparison.'] }, null, 2))
} finally { await browser.close() }
