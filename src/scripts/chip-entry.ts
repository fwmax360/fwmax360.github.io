import { chipQuality } from '../lib/chip-quality'
const stage = document.querySelector<HTMLElement>('.stage')!
const button = document.querySelector<HTMLButtonElement>('[data-start-3d]')!
const message = document.querySelector<HTMLElement>('.fallback p')!
const capabilities = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } }
const quality = chipQuality({ width: innerWidth, memory: capabilities.deviceMemory, cores: navigator.hardwareConcurrency,
  saveData: capabilities.connection?.saveData, connection: capabilities.connection?.effectiveType,
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches })
const dormantControls = document.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('.controls button, .controls input, .controls select')
for (const control of dormantControls) control.disabled = true
const status = document.querySelector<HTMLElement>('[data-status]')!
const controller = new AbortController()
let loading = false
let generation = 0
function showStaticPreview(text: string, failure: 'runtime' | 'renderer' = 'renderer') {
  const reading = document.getElementById('topics')
  const readingBefore = reading?.getBoundingClientRect()
  generation++
  loading = false
  stage.dataset.boot = 'failed'
  stage.dataset.failure = failure
  status.textContent = 'STATIC PREVIEW'
  document.documentElement.dataset.experience = 'static'
  for (const control of dormantControls) control.disabled = true
  message.textContent = text
  button.textContent = failure === 'runtime' ? 'Reload page ↻' : 'Retry interactive model ↗'
  button.disabled = false
  button.hidden = false
  // Collapsing a failed animation must not move content the user already reads.
  // Measure after reflow so native scroll anchoring/clamping is not compensated twice.
  if (reading && readingBefore && readingBefore.top < innerHeight && readingBefore.bottom > 0) {
    const delta = reading.getBoundingClientRect().top - readingBefore.top
    if (Math.abs(delta) > .5) window.scrollBy({ top: delta, behavior: 'instant' })
  }
}
stage.addEventListener('chip:unavailable', () => showStaticPreview('3D rendering was interrupted. The static preview is available; retry the interactive model when ready.'), { signal: controller.signal })
const nextPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
async function start() {
  if (loading || controller.signal.aborted) return
  loading = true
  const currentGeneration = ++generation
  button.hidden = true
  delete document.documentElement.dataset.experience
  stage.dataset.boot = 'loading'
  delete stage.dataset.failure
  status.textContent = 'PREPARING 3D'
  message.textContent = 'Preparing the interactive model…'
  const started = performance.now()
  const bootTimings: Record<string, number> = {}
  const checkpoint = (name: string) => { bootTimings[name] = Math.round((performance.now() - started) * 10) / 10; stage.dataset.bootTimings = JSON.stringify(bootTimings) }
  let runtimeLoaded = false
  try {
    // The poster and headline paint before loading/parsing the expensive scene module.
    const poster = document.querySelector<HTMLImageElement>('.scene-poster')!
    await poster.decode().catch(() => {})
    stage.dataset.posterReady = 'true'
    checkpoint('posterDecoded')
    await nextPaint()
    if (controller.signal.aborted || currentGeneration !== generation) return
    checkpoint('posterPaint')
    const { initChipExperience } = await import('./chip-preview')
    runtimeLoaded = true
    if (controller.signal.aborted || currentGeneration !== generation) return
    checkpoint('runtimeLoaded')
    await initChipExperience(quality, controller.signal)
    await nextPaint()
    if (controller.signal.aborted || currentGeneration !== generation) return
    for (const control of document.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('.chapters button, #structure-select, #labels-toggle')) control.disabled = false
    checkpoint('readyPaint')
    stage.dataset.boot = 'ready'
    stage.dataset.bootMs = String(Math.round(performance.now() - started))
    delete document.documentElement.dataset.experience
  } catch {
    if (controller.signal.aborted || currentGeneration !== generation) return
    if (!runtimeLoaded) {
      // Chromium can retain a rejected dynamic import for this document. A fresh
      // document retries the exact published module URL without cache-busting chunks.
      showStaticPreview('Model loading failed. Reload this page to retry, or read the notes below.', 'runtime')
    } else showStaticPreview('3D preview unavailable. The static preview is available; explore the notes or retry 3D.')
  } finally { if (currentGeneration === generation) loading = false }
}
button.addEventListener('click', () => {
  if (stage.dataset.failure === 'runtime') {
    button.disabled = true
    button.textContent = 'Reloading page…'
    location.reload()
  } else void start()
}, { signal: controller.signal })
window.addEventListener('pagehide', event => { if (!event.persisted) controller.abort() }, { signal: controller.signal })
window.addEventListener('pageshow', () => {
  if (stage.dataset.failure === 'runtime') {
    button.disabled = false
    button.textContent = 'Reload page ↻'
  }
}, { signal: controller.signal })
if (quality.manual) {
  document.documentElement.dataset.experience = 'static'
  stage.dataset.boot = 'poster'
  status.textContent = 'STATIC PREVIEW'
  message.textContent = 'A lighter preview. Start the interactive model when you’re ready.'
  button.hidden = false
} else void start()
