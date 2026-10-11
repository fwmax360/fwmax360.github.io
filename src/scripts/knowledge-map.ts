import { MAP_READING_KEY, readMapReadingState, type MapReadingState } from '../lib/map-reading-state'

function renderFilters(map: HTMLElement, queryText: string, selectedCategory: string) {
  const term = queryText.trim().toLocaleLowerCase('zh-CN')
  const graphPosts = [...map.querySelectorAll<SVGElement>('.map-node.node--post')]
  const allPostIds = graphPosts.map(node => node.dataset.postId ?? '').filter(Boolean)
  const nodeElements = [...map.querySelectorAll<SVGElement>('.map-node')]
  const edgeElements = [...map.querySelectorAll<SVGPathElement>('.map-edge')]
  const results = map.querySelector<HTMLElement>('[data-map-results]')
  const treeEmpty = map.querySelector<HTMLElement>('[data-tree-empty]')
  const clear = map.querySelector<HTMLButtonElement>('[data-map-clear]')
  const postIdsFor = (element: Element) => (element.getAttribute('data-post-ids') ?? '').split(',').filter(Boolean)
  const visiblePostIds = new Set<string>()

  for (const node of graphPosts) {
    const matchesTerm = !term || (node.dataset.search ?? '').toLocaleLowerCase('zh-CN').includes(term)
    const matchesCategory = !selectedCategory || node.dataset.category === selectedCategory
    const visible = matchesTerm && matchesCategory
    const postId = node.dataset.postId
    if (visible && postId) visiblePostIds.add(postId)
  }

  map.querySelectorAll<HTMLElement>('[data-post-id]').forEach((element) => {
    const postId = element.dataset.postId ?? ''
    const visible = visiblePostIds.has(postId)
    if (element.matches('.tree-post')) element.hidden = !visible
    if (element.matches('.map-node')) {
      element.classList.toggle('is-filtered', !visible)
      element.setAttribute('aria-hidden', String(!visible))
      element.setAttribute('tabindex', visible ? '0' : '-1')
    }
  })

  edgeElements.forEach((edge) => {
    const edgePosts = postIdsFor(edge)
    edge.classList.toggle('is-filtered', edgePosts.length > 0 && !edgePosts.some((id) => visiblePostIds.has(id)))
  })
  nodeElements.forEach((node) => {
    if (node.dataset.nodeKind === 'root' || node.dataset.nodeKind === 'post') return
    const nodePosts = postIdsFor(node)
    const empty = nodePosts.length > 0 && !nodePosts.some((id) => visiblePostIds.has(id))
    node.classList.toggle('is-empty', empty)
    node.setAttribute('aria-hidden', String(empty))
    node.setAttribute('tabindex', empty ? '-1' : '0')
  })
  map.querySelectorAll<HTMLElement>('[data-filter-group]').forEach((group) => {
    const groupPosts = postIdsFor(group)
    const hidden = groupPosts.length > 0 && !groupPosts.some((id) => visiblePostIds.has(id))
    group.hidden = hidden
    if (!hidden && (term || selectedCategory) && group.matches('.tree-category')) {
      const details = group as HTMLDetailsElement
      details.open = true
    }
  })

  if (results) results.textContent = `${visiblePostIds.size} / ${allPostIds.length} 篇笔记`
  if (treeEmpty) treeEmpty.hidden = visiblePostIds.size > 0
  if (clear) clear.disabled = !term && !selectedCategory

  return visiblePostIds
}
// Cache only plain per-entry data, never detached DOM nodes. Keep at most 32 entries.
const readingEntries = new Map<string, MapReadingState>()
const entryTokenKey = 'blogMapEntryToken'
const storagePrefix = 'blog:map-reading:'
const storageOrder = `${storagePrefix}order`
const validToken = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9-]{32,36}$/i.test(value)
const readingEntryKey = () => validToken(history.state?.[entryTokenKey]) ? history.state[entryTokenKey] as string : `${history.state?.index ?? 0}:${location.pathname}`
function initializeReadingEntry() {
  if (validToken(history.state?.[entryTokenKey])) return
  const token = crypto.randomUUID()
  try { history.replaceState({ ...history.state, [entryTokenKey]: token }, '') }
  catch (error) { if (!(error instanceof DOMException) || error.name !== 'SecurityError') throw error }
}
function readReadingJournal(key: string): unknown {
  if (!validToken(key)) return
  try { const value = sessionStorage.getItem(storagePrefix + key); return value ? JSON.parse(value) : undefined }
  catch { return undefined }
}
function writeReadingJournal(key: string, state: MapReadingState) {
  if (!validToken(key)) return
  try {
    sessionStorage.setItem(storagePrefix + key, JSON.stringify(state))
    const raw = JSON.parse(sessionStorage.getItem(storageOrder) ?? '[]')
    let order: string[] = Array.isArray(raw) ? [...new Set(raw.filter(validToken))] : []
    if (order.at(-1) === key) return
    order = order.filter(value => value !== key)
    order.push(key)
    while (order.length > 32) sessionStorage.removeItem(storagePrefix + order.shift()!)
    sessionStorage.setItem(storageOrder, JSON.stringify(order))
  } catch {
    // Storage may be disabled/full. In-memory Back/Forward and batched history remain usable.
  }
}
let pendingReading: { key: string; state: MapReadingState } | undefined
let readingTimer: ReturnType<typeof setTimeout> | undefined
const clearReadingTimer = () => {
  if (readingTimer !== undefined) clearTimeout(readingTimer)
  readingTimer = undefined
}
function flushReadingState() {
  clearReadingTimer()
  const pending = pendingReading
  if (!pending || pending.key !== readingEntryKey()) { pendingReading = undefined; return }
  try {
    history.replaceState({ ...history.state, [MAP_READING_KEY]: pending.state }, '')
    // Some engines may drop excessive history writes rather than throw.
    if (JSON.stringify(history.state?.[MAP_READING_KEY]) === JSON.stringify(pending.state)) {
      pendingReading = undefined
      return
    }
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== 'SecurityError') throw error
  }
  // Native history quotas must not break the live filter. Retry only on this active entry.
  if (!document.hidden) readingTimer = setTimeout(flushReadingState, 1000)
}
function saveReadingState(state: MapReadingState) {
  const key = readingEntryKey()
  readingEntries.delete(key)
  readingEntries.set(key, state)
  writeReadingJournal(key, state)
  if (readingEntries.size > 32) readingEntries.delete(readingEntries.keys().next().value!)
  pendingReading = { key, state }
  clearReadingTimer()
  readingTimer = setTimeout(flushReadingState, 150)
}

function savedState(map: HTMLElement) {
  return readMapReadingState(readingEntries.get(readingEntryKey()) ?? readReadingJournal(readingEntryKey()) ?? history.state?.[MAP_READING_KEY],
    [...map.querySelectorAll<HTMLOptionElement>('[data-map-category] option')].map(option => option.value),
    [...map.querySelectorAll<SVGElement>('[data-node-id]')].map(node => node.dataset.nodeId ?? ''))
}
function restoreOpenCategories(map: HTMLElement, saved: MapReadingState) {
  if (!saved.openCategories) return
  map.querySelectorAll<HTMLDetailsElement>('[data-tree-category]').forEach(group => {
    group.open = saved.openCategories!.includes(group.dataset.treeCategory ?? '')
  })
}
function restoreReadingLayout(doc: Document) {
  doc.querySelectorAll<HTMLElement>('[data-knowledge-map]').forEach(map => {
    const saved = savedState(map)
    if (!saved) return
    const query = map.querySelector<HTMLInputElement>('[data-map-query]')
    const category = map.querySelector<HTMLSelectElement>('[data-map-category]')
    if (query) query.value = saved.query
    if (category) category.value = saved.category
    renderFilters(map, saved.query, saved.category)
    restoreOpenCategories(map, saved)
  })
}
const controllers = new Set<AbortController>()

type InspectorNode = {
  id: string
  kind: 'root' | 'category' | 'series' | 'tag' | 'post'
  label: string
  eyebrow: string
  detail: string
  meta: string
  href: string
  count: number
}

const initKnowledgeMaps = () => {
  document.querySelectorAll<HTMLElement>('[data-knowledge-map]').forEach((map) => {
    if (map.dataset.mapReady === 'true') return
    initializeReadingEntry()
    map.dataset.mapReady = 'true'
    const controller = new AbortController()
    controllers.add(controller)
    const { signal } = controller

    const payloadElement = document.getElementById(map.dataset.payloadId ?? '')
    if (!payloadElement?.textContent) return
    const payload = JSON.parse(payloadElement.textContent) as Record<string, InspectorNode>
    const query = map.querySelector<HTMLInputElement>('[data-map-query]')
    const category = map.querySelector<HTMLSelectElement>('[data-map-category]')
    const clear = map.querySelector<HTMLButtonElement>('[data-map-clear]')
    const canvas = map.querySelector<HTMLElement>('[data-map-canvas]')
    const nodeElements = [...map.querySelectorAll<SVGElement>('.map-node')]
    const edgeElements = [...map.querySelectorAll<SVGPathElement>('.map-edge')]

    const inspectorType = map.querySelector<HTMLElement>('[data-inspector-type]')
    const inspectorTitle = map.querySelector<HTMLElement>('[data-inspector-title]')
    const inspectorDetail = map.querySelector<HTMLElement>('[data-inspector-detail]')
    const inspectorMeta = map.querySelector<HTMLElement>('[data-inspector-meta]')
    const inspectorLink = map.querySelector<HTMLAnchorElement>('[data-inspector-link]')


    const saved = savedState(map)
    if (saved && query) query.value = saved.query
    if (saved && category) category.value = saved.category
    let selectedId = 'root'
    const persist = () => {
      saveReadingState({
        version: 1, query: (query?.value ?? '').slice(0, 512), category: category?.value ?? '', selection: selectedId,
        openCategories: [...map.querySelectorAll<HTMLDetailsElement>('[data-tree-category]')].filter(group => group.open).map(group => group.dataset.treeCategory ?? ''),
      })
    }

    const setInspector = (id = 'root') => {
      const node = payload[id] ?? payload.root
      if (!node) return
      if (inspectorType) inspectorType.textContent = node.eyebrow
      if (inspectorTitle) inspectorTitle.textContent = node.label
      if (inspectorDetail) inspectorDetail.textContent = node.detail
      if (inspectorMeta) inspectorMeta.textContent = node.meta
      if (inspectorLink) {
        inspectorLink.href = node.href
        inspectorLink.firstChild!.textContent = node.kind === 'post' ? '阅读这篇笔记 ' : '打开这个节点 '
      }

    }

    const activateNode = (id: string) => {
      if (!payload[id]) return
      selectedId = id
      const activeEdges = edgeElements.filter(
        (edge) => edge.dataset.edgeFrom === id || edge.dataset.edgeTo === id,
      )
      const related = new Set<string>()
      activeEdges.forEach((edge) => {
        if (edge.dataset.edgeFrom) related.add(edge.dataset.edgeFrom)
        if (edge.dataset.edgeTo) related.add(edge.dataset.edgeTo)
      })
      related.delete(id)

      map.classList.toggle('is-inspecting', id !== 'root')
      nodeElements.forEach((node) => {
        node.classList.toggle('is-active', node.dataset.nodeId === id)
        node.classList.toggle('is-related', related.has(node.dataset.nodeId ?? ''))
      })
      edgeElements.forEach((edge) => edge.classList.toggle('is-active', activeEdges.includes(edge)))
      setInspector(id)
    }

    const resetInspector = () => {
      selectedId = 'root'
      map.classList.remove('is-inspecting')
      nodeElements.forEach((node) => node.classList.remove('is-active', 'is-related'))
      edgeElements.forEach((edge) => edge.classList.remove('is-active'))
      setInspector('root')
    }

    const referencedNode = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null
      const element = target.closest<HTMLElement>('[data-node-id], [data-map-node-ref]')
      if (!element || !map.contains(element)) return null
      return element.dataset.nodeId ?? element.dataset.mapNodeRef ?? null
    }

    map.addEventListener('pointerover', (event) => {
      const id = referencedNode(event.target)
      if (id) activateNode(id)
    }, { signal })
    map.addEventListener('focusin', (event) => {
      const id = referencedNode(event.target)
      if (id) { activateNode(id); persist() }
    }, { signal })
    canvas?.addEventListener('pointerleave', () => {
      if (!canvas.contains(document.activeElement)) resetInspector()
    }, { signal })
    map.addEventListener('focusout', (event) => {
      if (!(event.relatedTarget instanceof Node) || !map.contains(event.relatedTarget)) resetInspector()
    }, { signal })

    const applyFilters = () => {
      renderFilters(map, query?.value ?? '', category?.value ?? '')
      resetInspector()
      persist()
    }

    query?.addEventListener('input', applyFilters, { signal })
    category?.addEventListener('change', applyFilters, { signal })
    clear?.addEventListener('click', () => {
      if (query) query.value = ''
      if (category) category.value = ''
      applyFilters()
      query?.focus()
    }, { signal })
    if (query) query.disabled = false
    if (category) category.disabled = false
    renderFilters(map, query?.value ?? '', category?.value ?? '')
    if (saved) restoreOpenCategories(map, saved)
    const candidate = saved?.selection ?? 'root'
    const candidateElement = nodeElements.find(node => node.dataset.nodeId === candidate)
    if (candidate !== 'root' && candidateElement && !candidateElement.classList.contains('is-filtered') && !candidateElement.classList.contains('is-empty')) activateNode(candidate)
    else resetInspector()
    map.addEventListener('click', event => {
      const id = referencedNode(event.target)
      if (id) activateNode(id)
      persist()
    }, { capture: true, signal })
    map.querySelectorAll<HTMLDetailsElement>('[data-tree-category]').forEach(group => group.addEventListener('toggle', persist, { signal }))
    if (saved) { persist(); flushReadingState() }
  })
}

initKnowledgeMaps()
document.addEventListener('astro:page-load', initKnowledgeMaps)

document.addEventListener('astro:before-preparation', event => {
  // For traverse, history.state already points at the destination. Never flush the old entry into it.
  if (event.navigationType === 'traverse') { clearReadingTimer(); pendingReading = undefined }
  else flushReadingState()
})
window.addEventListener('pagehide', flushReadingState)
document.addEventListener('astro:before-swap', event => {
  clearReadingTimer()
  pendingReading = undefined
  controllers.forEach(controller => controller.abort())
  controllers.clear()
  if (event.navigationType === 'traverse') restoreReadingLayout(event.newDocument)
})
