// This enhancement is independent of the optional WebGL runtime.
const shelf = document.querySelector<HTMLElement>('#research-shelf')
if (shelf) {
 const controller = new AbortController()
 const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-shelf-step]')]
 document.querySelector<HTMLElement>('.shelf-controls')!.hidden = false
 const update = () => buttons.forEach(button => {
  button.disabled = Number(button.dataset.shelfStep) < 0 ? shelf.scrollLeft < 2 : shelf.scrollLeft >= shelf.scrollWidth - shelf.clientWidth - 2
 })
 const move = (direction: number) => {
  const card = shelf.querySelector<HTMLElement>('a')!
  shelf.scrollBy({left: direction * (card.offsetWidth + 24), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'})
 }
 buttons.forEach(button => button.addEventListener('click', () => move(Number(button.dataset.shelfStep)), {signal:controller.signal}))
 shelf.addEventListener('scroll', update, {passive:true, signal:controller.signal})
 shelf.addEventListener('keydown', event => {
  // Links keep their own Enter/Space behavior. Only a focused shelf owns arrow keys.
  if(event.target !== shelf || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return
  event.preventDefault()
  if(event.key === 'Home' || event.key === 'End') shelf.scrollTo({left:event.key === 'Home' ? 0 : shelf.scrollWidth, behavior:'instant'})
  else move(event.key === 'ArrowLeft' ? -1 : 1)
 }, {signal:controller.signal})
 const observer = new ResizeObserver(update); observer.observe(shelf)
 window.addEventListener('pagehide', event => {if(!event.persisted){controller.abort();observer.disconnect()}}, {signal:controller.signal})
 document.addEventListener('astro:before-swap', () => {controller.abort();observer.disconnect()}, {signal:controller.signal})
 update()
}
