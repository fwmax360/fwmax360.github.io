let cleanup: (() => void) | undefined
function setupNoteHover() {
  cleanup?.(); cleanup = undefined
  const root = document.querySelector<HTMLElement>('[data-home-motion]')
  const preview = root?.querySelector<HTMLElement>('[data-note-preview]')
  const img = preview?.querySelector<HTMLImageElement>('[data-note-preview-image]')
  if (!root || !preview || !img) return
  const controller = new AbortController(), { signal } = controller
  const fine = matchMedia('(hover:hover) and (pointer:fine) and (min-width:901px)')
  const reduced = matchMedia('(prefers-reduced-motion:reduce)')
  let active: HTMLElement | null = null, frame = 0, generation = 0
  let request: AbortController | undefined
  let decoded = false
  let point: { x:number; y:number } | null = null
  const hide = () => { generation++; request?.abort(); request = undefined; active = null; decoded = false; preview.removeAttribute('data-visible'); if (frame) cancelAnimationFrame(frame); frame = 0 }
  const position = () => {
    if (!active) return
    const width = preview.offsetWidth, height = width*630/1200
    const box = active.getBoundingClientRect()
    // Reserve space for the rotated artwork, and never cover the active reading row.
    const inset = reduced.matches ? 0 : 12, gap = 16
    const top = Math.max(80, (document.querySelector('.nav')?.getBoundingClientRect().bottom ?? 0) + gap) + inset
    const bottom = innerHeight - height - gap - inset
    const above = box.top - height - gap - inset
    const below = box.bottom + gap + inset
    let x = point && !reduced.matches ? point.x + 28 : box.right - width
    const wantedY = point && !reduced.matches ? point.y - height - 28 : box.top - height - 16
    if (point && x + width > innerWidth - 16 - inset) x = point.x - width - 28
    x = Math.max(gap + inset, Math.min(x,innerWidth-width-gap-inset))
    // Small-height windows prioritize text: omit decoration if neither side fits.
    const fits = top <= bottom && (above >= top || below <= bottom)
    let y = top
    if (above >= top) y = Math.max(top, Math.min(wantedY, above, bottom))
    else if (below <= bottom) y = Math.max(below, Math.min(wantedY, bottom))
    preview.style.setProperty('--preview-x',`${x}px`); preview.style.setProperty('--preview-y',`${y}px`)
    if (fits && decoded) preview.dataset.visible = 'true'
    else preview.removeAttribute('data-visible')
  }
  const queue = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; position() }) }
  const show = (item:HTMLElement) => {
    if (!fine.matches) return
    if (active === item) { queue(); return }
    hide(); active = item; const version = generation
    const loading = new AbortController()
    request = loading
    const reveal = () => {
      if (signal.aborted || loading.signal.aborted || version !== generation || active !== item || !fine.matches) return
      loading.abort()
      decoded = true
      position()
    }
    // Some engines can decode the preceding bitmap while the next src is pending.
    // Observe this resource's load first, and cancel obsolete listeners on selection/exit.
    img.addEventListener('load', () => {
      void img.decode().then(reveal).catch(() => loading.abort())
    }, { once:true, signal:loading.signal })
    img.addEventListener('error', () => loading.abort(), { once:true, signal:loading.signal })
    img.src = item.dataset.noteCover ?? ''
    preview.style.setProperty('--preview-color',item.dataset.noteColor ?? '#65d9ed')
    position()
    if (img.complete && img.naturalWidth > 0 && img.currentSrc === img.src) {
      void img.decode().then(reveal).catch(() => loading.abort())
    }
  }
  const itemFor = (target:EventTarget|null) => target instanceof Element ? target.closest<HTMLElement>('[data-note-hover]') : null
  root.addEventListener('pointerover',event => { const item=itemFor(event.target);if(item){point={x:event.clientX,y:event.clientY};void show(item)}else hide() },{signal})
  root.addEventListener('pointermove',event => { const item=itemFor(event.target);if(item){point={x:event.clientX,y:event.clientY};if(item!==active)void show(item);else queue()} },{signal})
  root.addEventListener('pointerleave',hide,{signal})
  root.addEventListener('focusin',event => { const item=itemFor(event.target);point=null;if(item)void show(item);else hide() },{signal})
  root.addEventListener('focusout',event => { if(!itemFor(event.relatedTarget))hide() },{signal})
  window.addEventListener('scroll',hide,{signal,passive:true})
  window.addEventListener('resize',hide,{signal})
  window.addEventListener('keydown',event=>{if(event.key==='Escape')hide()},{signal})
  fine.addEventListener('change',hide,{signal})
  reduced.addEventListener('change',queue,{signal})
  cleanup=()=>{hide();controller.abort()}
}
setupNoteHover()
document.addEventListener('astro:page-load',setupNoteHover)
document.addEventListener('astro:before-swap',()=>{cleanup?.();cleanup=undefined})
