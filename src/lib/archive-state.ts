export interface ArchiveState {
  category: string
  series: string
  density: 'editorial' | 'compact'
}

/** Only declared options are valid; unknown campaign parameters and anchors are unrelated. */
export function readArchiveState(url: URL, categories: readonly string[], series: readonly string[]): ArchiveState {
  const category = url.searchParams.get('category') ?? ''
  const selectedSeries = url.searchParams.get('series') ?? ''
  return {
    category: categories.includes(category) ? category : '',
    series: series.includes(selectedSeries) ? selectedSeries : '',
    density: url.searchParams.get('density') === 'compact' ? 'compact' : 'editorial',
  }
}

export function archiveStateUrl(input: URL, state: ArchiveState): URL {
  const url = new URL(input)
  for (const key of ['category', 'series', 'density'] as const) {
    const value = key === 'density' && state.density === 'editorial' ? '' : state[key]
    if (value) url.searchParams.set(key, value)
    else url.searchParams.delete(key)
  }
  return url
}
