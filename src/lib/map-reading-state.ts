export interface MapReadingState {
  version: 1
  query: string
  category: string
  selection: string
  openCategories?: string[]
}

export const MAP_READING_KEY = 'blogKnowledgeMap'

/** History-entry state is untrusted; accept only current declared options/nodes. */
export function readMapReadingState(value: unknown, categories: readonly string[], nodes: readonly string[]): MapReadingState | undefined {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1) return
  const saved = value as Partial<MapReadingState>
  return {
    version: 1,
    query: typeof saved.query === 'string' ? saved.query.slice(0, 512) : '',
    category: typeof saved.category === 'string' && categories.includes(saved.category) ? saved.category : '',
    selection: typeof saved.selection === 'string' && nodes.includes(saved.selection) ? saved.selection : 'root',
    openCategories: Array.isArray(saved.openCategories)
      ? [...new Set(saved.openCategories.filter((name): name is string => typeof name === 'string' && categories.includes(name)))]
      : undefined,
  }
}
