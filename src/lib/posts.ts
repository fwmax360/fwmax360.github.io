import { getCollection, type CollectionEntry } from 'astro:content'

export type Post = CollectionEntry<'posts'>

const isVisible = (p: Post) => import.meta.env.DEV || !p.data.draft

/** 全部可见文章，置顶优先，其余按发布时间升序（越早越靠前） */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', isVisible)
  return posts.sort((a, b) => {
    if (a.data.pinned !== b.data.pinned) return b.data.pinned - a.data.pinned
    return a.data.pubDate.getTime() - b.data.pubDate.getTime()
  })
}

/** 纯按时间升序，用于归档和上/下篇导航（越早越靠前） */
export async function getPostsByDate(): Promise<Post[]> {
  const posts = await getCollection('posts', isVisible)
  return posts.sort((a, b) => a.data.pubDate.getTime() - b.data.pubDate.getTime())
}

export type Counted = { name: string; count: number }

export async function getTags(): Promise<Counted[]> {
  const posts = await getPosts()
  const map = new Map<string, number>()
  for (const p of posts) {
    for (const t of p.data.tags) map.set(t, (map.get(t) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export async function getCategories(): Promise<Counted[]> {
  const posts = await getPosts()
  const map = new Map<string, number>()
  for (const p of posts) map.set(p.data.category, (map.get(p.data.category) ?? 0) + 1)
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** 同系列文章，按 order 升序 */
export async function getSeries(name: string): Promise<Post[]> {
  const posts = await getPosts()
  return posts
    .filter((p) => p.data.series === name)
    .sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0))
}

/** 按年份分组，用于归档页 */
export function groupByYear(posts: Post[]): [string, Post[]][] {
  const map = new Map<string, Post[]>()
  for (const p of posts) {
    const y = String(p.data.pubDate.getFullYear())
    if (!map.has(y)) map.set(y, [])
    map.get(y)!.push(p)
  }
  return [...map.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))
}

/**
 * 相关文章：同系列 > 同分类 > 共同标签多的优先。
 */
export async function getRelated(current: Post, limit = 3): Promise<Post[]> {
  const posts = await getPosts()
  const tags = new Set(current.data.tags)

  return posts
    .filter((p) => p.id !== current.id)
    .map((p) => {
      let score = 0
      if (current.data.series && p.data.series === current.data.series) score += 100
      if (p.data.category === current.data.category) score += 10
      for (const t of p.data.tags) if (tags.has(t)) score += 3
      return { post: p, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.post.data.pubDate.getTime() - b.post.data.pubDate.getTime())
    .slice(0, limit)
    .map((x) => x.post)
}

export const postUrl = (p: Post) => `/posts/${p.id}/`
export const tagUrl = (t: string) => `/tags/${encodeURIComponent(t)}/`
export const categoryUrl = (c: string) => `/categories/${encodeURIComponent(c)}/`

export const formatDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** 中英混排的粗略字数与阅读时长 */
export function readingStats(body: string) {
  const cjk = (body.match(/[\u4e00-\u9fa5]/g) ?? []).length
  const words = (body.match(/[a-zA-Z0-9]+/g) ?? []).length
  const total = cjk + words
  return { words: total, minutes: Math.max(1, Math.round(total / 400)) }
}
