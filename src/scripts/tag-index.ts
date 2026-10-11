export {}
let cleanup: (() => void) | undefined
function setup() {
  cleanup?.()
  const root = document.querySelector<HTMLElement>('[data-vocabulary]')
  if (!root) return
  const abort = new AbortController()
  const query = root.querySelector<HTMLInputElement>('[data-tag-query]')!
  const clear = root.querySelector<HTMLButtonElement>('[data-tag-clear]')!
  const items = [...root.querySelectorAll<HTMLElement>('[data-tag-item]')]
  const groups = [...root.querySelectorAll<HTMLElement>('[data-tag-group]')]
  root.querySelector<HTMLElement>('[data-tag-controls]')!.hidden = false
  const filter = () => {
    const term = query.value.trim().toLocaleLowerCase('zh-CN')
    let count = 0
    items.forEach(item => {
      item.hidden = Boolean(term && !item.dataset.tagSearch?.toLocaleLowerCase('zh-CN').includes(term))
      if (!item.hidden) count++
    })
    groups.forEach(group => {
      const visible = [...group.querySelectorAll<HTMLElement>('[data-tag-item]')].filter(item => !item.hidden).length
      group.hidden = visible === 0
      group.querySelector<HTMLElement>('[data-group-count]')!.textContent = String(visible)
      const link = root.querySelector<HTMLElement>(`[data-tag-group-link="${group.id.replace('group-', '')}"]`)
      if (link) link.hidden = group.hidden
    })
    root.querySelector<HTMLElement>('[data-tag-count]')!.textContent = String(count)
    root.querySelector<HTMLElement>('[data-tag-empty]')!.hidden = count > 0
    clear.disabled = !term
  }
  query.addEventListener('input', filter, { signal: abort.signal })
  clear.addEventListener('click', () => { query.value = ''; filter(); query.focus() }, { signal: abort.signal })
  // Browsers may restore an input value on history traversal; reconcile the list with it.
  filter()
  cleanup = () => abort.abort()
}
setup()
document.addEventListener('astro:page-load', setup)
document.addEventListener('astro:before-swap', () => { cleanup?.(); cleanup = undefined })
