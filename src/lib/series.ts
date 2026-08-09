import { getPosts, type Post } from './posts'

export interface SeriesSummary {
  name: string
  posts: Post[]
  count: number
  categories: string[]
  topTags: string[]
  firstPublishedAt: Date
  lastUpdatedAt: Date
}

const seriesPostOrder = (a: Post, b: Post) => {
  const aOrder = a.data.order
  const bOrder = b.data.order

  if (aOrder !== undefined && bOrder !== undefined && aOrder !== bOrder) return aOrder - bOrder
  if (aOrder !== undefined && bOrder === undefined) return -1
  if (aOrder === undefined && bOrder !== undefined) return 1
  return a.data.pubDate.getTime() - b.data.pubDate.getTime() || a.data.title.localeCompare(b.data.title, 'zh-CN')
}

/** 全部公开系列；系列内按 order 排序，系列之间按最近更新时间排序。 */
export async function getSeriesSummaries(): Promise<SeriesSummary[]> {
  const groups = new Map<string, Post[]>()

  for (const post of await getPosts()) {
    const name = post.data.series?.trim()
    if (!name) continue
    const list = groups.get(name) ?? []
    list.push(post)
    groups.set(name, list)
  }

  return [...groups.entries()]
    .map(([name, unsorted]) => {
      const posts = [...unsorted].sort(seriesPostOrder)
      const categories = [...new Set(posts.map((post) => post.data.category))]
      const tagCounts = new Map<string, number>()

      for (const post of posts) {
        for (const tag of post.data.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
      }

      const topTags = [...tagCounts]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
        .slice(0, 4)
        .map(([tag]) => tag)

      return {
        name,
        posts,
        count: posts.length,
        categories,
        topTags,
        firstPublishedAt: new Date(Math.min(...posts.map((post) => post.data.pubDate.getTime()))),
        lastUpdatedAt: new Date(
          Math.max(...posts.map((post) => (post.data.updatedDate ?? post.data.pubDate).getTime())),
        ),
      }
    })
    .sort(
      (a, b) =>
        b.lastUpdatedAt.getTime() - a.lastUpdatedAt.getTime() || a.name.localeCompare(b.name, 'zh-CN'),
    )
}

/** 页面链接统一编码；getStaticPaths 仍接收原始系列名，由 Astro 生成对应静态路径。 */
export const seriesUrl = (name: string) => `/series/${encodeURIComponent(name)}/`
