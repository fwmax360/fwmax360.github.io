export {}
let cleanup: (() => void) | undefined
function setup() {
  cleanup?.()
  const root = document.querySelector<HTMLElement>('[data-about]')
  if (!root) return
  const abort = new AbortController()
  const name = root.querySelector<HTMLButtonElement>('[data-name-poke]')!
  const text = name.querySelector<HTMLElement>('[data-name-text]')!
  root.querySelector<HTMLElement>('[data-name-static]')!.hidden = true
  name.hidden = false
  const names = ['Sleep3r', 'sleep4r', 'sleep?', '还没睡', 'Sleep3r']
  let index = 0
  name.addEventListener('click', () => { index = (index + 1) % names.length; text.textContent = names[index] }, { signal: abort.signal })
  const debug = root.querySelector<HTMLElement>('[data-adbg]')!
  const button = debug.querySelector<HTMLButtonElement>('[data-adbg-btn]')!
  const pid = debug.querySelector<HTMLElement>('[data-adbg-pid]')!
  const status = debug.querySelector<HTMLElement>('[data-adbg-status]')!
  const message = debug.querySelector<HTMLElement>('[data-adbg-msg]')!
  debug.hidden = false
  let attached = false
  button.addEventListener('click', () => {
    attached = !attached
    pid.textContent = attached ? '1337' : '0'
    status.textContent = attached ? 'compromised' : 'clean'
    message.hidden = false
    message.textContent = attached ? '检测到调试器。应用已自爆。（开玩笑的）' : 'debugger detached. 你假装什么都没发生。'
    button.textContent = attached ? 'detach debugger' : 'attach debugger'
    debug.classList.toggle('is-attached', attached)
  }, { signal: abort.signal })
  cleanup = () => abort.abort()
}
setup()
document.addEventListener('astro:page-load', setup)
document.addEventListener('astro:before-swap', () => { cleanup?.(); cleanup = undefined })
