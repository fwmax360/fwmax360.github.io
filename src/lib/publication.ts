/** One publication policy for lists, feeds, rendered previews and indexing. */
export interface PublicationData {
  status?: 'published' | 'sample' | 'draft'
  /** Legacy frontmatter remains supported; draft always takes precedence. */
  draft?: boolean
}
export function publicationStatus(data: PublicationData) {
  return data.draft ? 'draft' : (data.status ?? 'published')
}
export const isIndexable = (data: PublicationData) => publicationStatus(data) === 'published'
export const isRoutable = (data: PublicationData, development = false) =>
  development || publicationStatus(data) !== 'draft'
export const isListed = (data: PublicationData, development = false) =>
  publicationStatus(data) !== 'sample' && isRoutable(data, development)
