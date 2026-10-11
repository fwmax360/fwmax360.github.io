import { archiveStateUrl, readArchiveState, type ArchiveState } from '../lib/archive-state'

let cleanup: (() => void) | undefined

function setupArchive() {
  cleanup?.()
  cleanup = undefined
  const root = document.querySelector<HTMLElement>('[data-archive]')
  if (!root) return
  const controller = new AbortController()
  const { signal } = controller
  const category = root.querySelector<HTMLSelectElement>('[data-archive-category]')!
  const series = root.querySelector<HTMLSelectElement>('[data-archive-series]')!
  const items = [...root.querySelectorAll<HTMLElement>('[data-archive-item]')]
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-density]')]
  const count = root.querySelector<HTMLElement>('[data-archive-count]')!
  const empty = root.querySelector<HTMLElement>('[data-archive-empty]')!
  const preview = root.querySelector<HTMLElement>('[data-archive-preview]')
  const img = root.querySelector<HTMLImageElement>('[data-preview-image]')
  const cover = root.querySelector<HTMLElement>('.inspector-cover')
  const fallback = root.querySelector<HTMLElement>('[data-preview-fallback]')
  const title = root.querySelector<HTMLElement>('[data-preview-title]')
  const description = root.querySelector<HTMLElement>('[data-preview-description]')
  const meta = root.querySelector<HTMLElement>('[data-preview-meta]')
  const categories = [...category.options].map(option => option.value)
  const seriesOptions = [...series.options].map(option => option.value)
  let selected: HTMLElement | undefined
  let animation: Animation | undefined
  let previewGeneration = 0
  let previewRequest: AbortController | undefined
  let state: ArchiveState = readArchiveState(new URL(location.href), categories, seriesOptions)

  const setPreview = (item: HTMLElement) => {
    if (item === selected || item.hidden) return
    selected?.removeAttribute('data-preview-active')
    selected = item
    item.dataset.previewActive = 'true'
    const version = ++previewGeneration
    previewRequest?.abort()
    if (fallback) fallback.hidden = true
    if (cover) cover.hidden = false
    if (preview && img) {
      const request = new AbortController()
      previewRequest = request
      preview.style.setProperty('--preview-color', getComputedStyle(item.querySelector('.archive-entry') ?? item).getPropertyValue('--note-color').trim() || '#65d9ed')
      preview.dataset.previewState = 'loading'
      preview.setAttribute('aria-busy', 'true')
      const finish = (state: 'ready' | 'error') => {
        if (signal.aborted || request.signal.aborted || version !== previewGeneration) return
        request.abort()
        preview.dataset.previewState = state
        preview.setAttribute('aria-busy', 'false')
        if (cover) cover.hidden = state === 'error'
        if (fallback) fallback.hidden = state !== 'error'
      }
      // Wait for the new resource, not an old decoded bitmap retained while src changes.
      img.addEventListener('load', () => {
        void img.decode().then(() => finish('ready')).catch(() => finish('error'))
      }, {once: true, signal: request.signal})
      img.addEventListener('error', () => finish('error'), {once: true, signal: request.signal})
      img.src = item.dataset.cover ?? ''
      if (img.complete && img.naturalWidth > 0 && img.currentSrc === img.src) {
        void img.decode().then(() => finish('ready')).catch(() => finish('error'))
      }
    }
    if (title) title.textContent = item.dataset.title ?? ''
    if (description) description.textContent = item.dataset.description ?? ''
    if (meta) meta.textContent = item.dataset.meta ?? ''
    root.querySelectorAll<HTMLAnchorElement>('[data-preview-link]').forEach(link => { link.href = item.dataset.href ?? '/archive/' })
    animation?.cancel()
    if (preview && !matchMedia('(prefers-reduced-motion: reduce)').matches && document.documentElement.dataset.motion === 'ready' && matchMedia('(min-width: 1001px)').matches) {
      animation = preview.animate([{opacity:.65,transform:'translateY(3px)'},{opacity:1,transform:'none'}], {duration:180,easing:'cubic-bezier(.16,1,.3,1)'})
    }
  }

  const render = () => {
    category.value = state.category
    series.value = state.series
    root.dataset.archiveDensity = state.density
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.density === state.density)))
    let visible = 0
    items.forEach(item => {
      item.hidden = Boolean((state.category && item.dataset.category !== state.category) || (state.series && item.dataset.series !== state.series))
      if (!item.hidden) visible++
    })
    root.querySelectorAll<HTMLElement>('[data-archive-year],[data-archive-month]').forEach(group => {
      const size = group.querySelectorAll('[data-archive-item]:not([hidden])').length
      group.hidden = size === 0
      const label = group.querySelector<HTMLElement>(group.hasAttribute('data-archive-year') ? '[data-year-count]' : '[data-month-count]')
      if (label) label.textContent = group.hasAttribute('data-archive-year') ? String(size) : `${size} 篇`
    })
    root.querySelectorAll<HTMLAnchorElement>('[data-year-link]').forEach(link => {
      const year = root.querySelector<HTMLElement>(`[data-archive-year="${link.dataset.yearLink}"]`)
      link.hidden = !year || year.hidden
      const total = year?.querySelector('[data-year-count]')?.textContent
      const number = link.querySelector('span')
      if (number && total) number.textContent = total
    })
    root.dataset.emptyResults = String(visible === 0)
    const years = root.querySelector<HTMLElement>('.archive-years')
    if (years) years.hidden = visible === 0
    count.textContent = String(visible)
    empty.hidden = visible > 0
    if (preview) preview.hidden = visible === 0
    root.querySelectorAll<HTMLButtonElement>('[data-archive-reset]').forEach(button => {
      button.disabled = !state.category && !state.series && state.density === 'editorial'
    })
    const first = items.find(item => !item.hidden)
    if (first) setPreview(selected && !selected.hidden ? selected : first)
    else { previewGeneration++; previewRequest?.abort(); selected?.removeAttribute('data-preview-active'); selected = undefined; animation?.cancel() }
  }

  const syncUrl = () => {
    const url = archiveStateUrl(new URL(location.href), state)
    // Filters describe the current index, not another page. Keep Astro's history metadata intact.
    // Returning from a note restores this URL, with no extra Back presses for each filter adjustment.
    if (url.href !== location.href) history.replaceState(history.state, '', url)
  }
  const change = () => {
    state = {...state, category:category.value,series:series.value}
    render()
    syncUrl()
  }
  category.addEventListener('change', change, {signal})
  series.addEventListener('change', change, {signal})
  buttons.forEach(button => button.addEventListener('click', () => {
    state = {...state,density:button.dataset.density === 'compact' ? 'compact' : 'editorial'}
    render()
    syncUrl()
  }, {signal}))
  root.querySelectorAll<HTMLButtonElement>('[data-archive-reset]').forEach(button => button.addEventListener('click', () => {
    state = {category:'',series:'',density:'editorial'}
    render()
    syncUrl()
  }, {signal}))
  const inspect = (event: Event) => {
    if (!(event.target instanceof Element)) return
    const item = event.target.closest<HTMLElement>('[data-archive-item]')
    if (item && root.contains(item)) setPreview(item)
  }
  root.addEventListener('pointerover', inspect, {signal})
  root.addEventListener('focusin', inspect, {signal})
  window.addEventListener('popstate', () => {
    if (location.pathname.replace(/\/$/,'') !== '/archive') return
    state = readArchiveState(new URL(location.href), categories, seriesOptions)
    render()
  }, {signal})
  root.querySelectorAll<HTMLSelectElement | HTMLButtonElement>('[data-archive-controls] select,[data-archive-controls] button').forEach(control => { control.disabled = false })
  const tools = root.querySelector<HTMLDetailsElement>('.archive-tools')
  if (tools && (state.category || state.series || state.density !== 'editorial')) tools.open = true
  render()
  syncUrl()
  root.dataset.archiveReady = 'true'
  cleanup = () => { previewGeneration++; previewRequest?.abort(); controller.abort(); animation?.cancel() }
}
setupArchive()
document.addEventListener('astro:page-load', setupArchive)
document.addEventListener('astro:before-swap', () => { cleanup?.(); cleanup = undefined })
