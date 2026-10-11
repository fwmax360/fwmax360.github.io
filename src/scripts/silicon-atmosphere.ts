// Decorative motion stays independent of WebGL and can always be paused.
const stage = document.querySelector<HTMLElement>('.silicon-editorial .stage')
const toggle = document.querySelector<HTMLButtonElement>('.atmosphere-toggle')
if (stage && toggle) {
 const abort = new AbortController()
 const reduced = matchMedia('(prefers-reduced-motion: reduce)')
 let paused = false
 let visible = false
 const update = () => {
  stage.dataset.atmosphere = !paused && visible && !document.hidden && !reduced.matches ? 'running' : 'still'
  toggle.hidden = reduced.matches || !visible
  toggle.setAttribute('aria-pressed', String(paused))
  toggle.textContent = paused ? 'Resume atmosphere' : 'Pause atmosphere'
 }
 const observer = new IntersectionObserver(entries => {visible = entries[0].isIntersecting;update()})
 observer.observe(stage)
 toggle.addEventListener('click', () => {paused = !paused;update()}, {signal:abort.signal})
 reduced.addEventListener('change', update, {signal:abort.signal})
 document.addEventListener('visibilitychange', update, {signal:abort.signal})
 const dispose = () => {stage.dataset.atmosphere='still';observer.disconnect();abort.abort()}
 document.addEventListener('astro:before-swap', dispose, {signal:abort.signal})
 window.addEventListener('pagehide', event => {if(!event.persisted)dispose()}, {signal:abort.signal})
 window.addEventListener('pageshow', update, {signal:abort.signal})
 update()
}
