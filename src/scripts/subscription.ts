let cleanup: (() => void) | undefined
function setupSubscription() {
  cleanup?.(); cleanup = undefined
  const button = document.querySelector<HTMLButtonElement>('[data-copy-feed]')
  const status = document.querySelector<HTMLElement>('[data-feed-status]')
  if (!button || !status) return
  const controller = new AbortController(), {signal} = controller
  button.addEventListener('click', async () => {
    button.disabled = true
    try {
      await navigator.clipboard.writeText(button.dataset.feedUrl ?? '')
      if (!signal.aborted) status.textContent = '已复制订阅地址。'
    } catch {
      if (!signal.aborted) status.textContent = '复制未成功，请选择上方地址手动复制。'
    } finally { if (!signal.aborted) button.disabled = false }
  }, {signal})
  button.hidden = false
  cleanup = () => controller.abort()
}
setupSubscription()
document.addEventListener('astro:page-load', setupSubscription)
document.addEventListener('astro:before-swap', () => { cleanup?.(); cleanup = undefined })

export {}
