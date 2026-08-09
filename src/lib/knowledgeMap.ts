import { categoryUrl, formatDate, getPosts, postUrl, tagUrl, type Post } from './posts'
import { getSeriesSummaries, seriesUrl } from './series'
import { getSeriesVisual } from './seriesVisual'

export type KnowledgeNodeKind = 'root' | 'category' | 'series' | 'tag' | 'post'
export type KnowledgeRelation = 'root' | 'category' | 'series' | 'tag'

export interface KnowledgePoint {
  x: number
  y: number
}

export interface KnowledgeNode extends KnowledgePoint {
  id: string
  kind: KnowledgeNodeKind
  label: string
  shortLabel: string
  eyebrow: string
  detail: string
  meta: string
  href: string
  accent: string
  width: number
  height: number
  count: number
  postIds: string[]
  category?: string
  series?: string
  tags?: string[]
  date?: string
}

export interface KnowledgeEdge {
  id: string
  from: string
  to: string
  relation: KnowledgeRelation
  path: string
  accent: string
  postIds: string[]
}

export interface KnowledgePost {
  id: string
  nodeId: string
  title: string
  shortTitle: string
  description: string
  href: string
  category: string
  series?: string
  tags: string[]
  date: string
  order?: number
}

export interface KnowledgeGroup {
  name: string
  href: string
  count: number
  postIds: string[]
}

export interface KnowledgeMapData {
  width: number
  height: number
  nodes: KnowledgeNode[]
  edges: KnowledgeEdge[]
  posts: KnowledgePost[]
  categories: KnowledgeGroup[]
  series: KnowledgeGroup[]
  highTags: KnowledgeGroup[]
  stats: {
    posts: number
    categories: number
    series: number
    tags: number
    relations: number
  }
}

const WIDTH = 1200
const HEIGHT = 920
const ROOT: KnowledgePoint = { x: 600, y: 460 }

const CATEGORY_COLORS = ['#65d9ed', '#52e198', '#f2bd5b', '#ae91ff']
const POST_COLORS = ['#9fdff0', '#a8ebc7', '#f4d18b', '#c8b8ff']

const trimLabel = (value: string, limit: number) => {
  const chars = [...value]
  return chars.length > limit ? `${chars.slice(0, limit - 1).join('')}…` : value
}

const spread = (count: number, start: number, end: number) => {
  if (count <= 1) return [(start + end) / 2]
  return Array.from({ length: count }, (_, index) => start + ((end - start) * index) / (count - 1))
}

const allocateSeriesRows = (groups: Post[][]) => {
  const rows = new Map<string, number>()
  const count = groups.reduce((total, posts) => total + posts.length, 0)
  if (!count) return rows

  const gapWeight = 0.58
  const increments = Math.max(1, count - 1 + Math.max(0, groups.length - 1) * gapWeight)
  const step = (808 - 58) / increments
  let cursor = 58

  groups.forEach((posts, groupIndex) => {
    posts.forEach((post) => {
      rows.set(post.id, cursor)
      cursor += step
    })
    if (groupIndex < groups.length - 1) cursor += step * gapWeight
  })

  return rows
}

const curve = (from: KnowledgePoint, to: KnowledgePoint) => {
  const dx = to.x - from.x
  const dy = to.y - from.y

  if (Math.abs(dx) >= Math.abs(dy)) {
    const bend = from.x + dx * 0.5
    return `M ${from.x} ${from.y} C ${bend} ${from.y}, ${bend} ${to.y}, ${to.x} ${to.y}`
  }

  const bend = from.y + dy * 0.48
  return `M ${from.x} ${from.y} C ${from.x} ${bend}, ${to.x} ${bend}, ${to.x} ${to.y}`
}

const average = (values: number[], fallback: number) =>
  values.length ? values.reduce((total, value) => total + value, 0) / values.length : fallback

export async function getKnowledgeMap(): Promise<KnowledgeMapData> {
  const [allPosts, summaries] = await Promise.all([getPosts(), getSeriesSummaries()])
  const posts = [...allPosts].sort(
    (a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime() || a.data.title.localeCompare(b.data.title, 'zh-CN'),
  )
  const seriesPostIds = new Set(summaries.flatMap((summary) => summary.posts.map((post) => post.id)))
  const standalonePosts = posts
    .filter((post) => !seriesPostIds.has(post.id))
    .sort(
      (a, b) =>
        a.data.category.localeCompare(b.data.category, 'zh-CN') ||
        b.data.pubDate.getTime() - a.data.pubDate.getTime(),
    )

  const categoryMap = new Map<string, Post[]>()
  const tagMap = new Map<string, Post[]>()
  for (const post of posts) {
    const categoryPosts = categoryMap.get(post.data.category) ?? []
    categoryPosts.push(post)
    categoryMap.set(post.data.category, categoryPosts)

    for (const tag of post.data.tags) {
      const tagPosts = tagMap.get(tag) ?? []
      tagPosts.push(post)
      tagMap.set(tag, tagPosts)
    }
  }

  const categoryEntries = [...categoryMap.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'zh-CN'),
  )
  const highTagEntries = [...tagMap.entries()]
    .filter(([, taggedPosts]) => taggedPosts.length >= 2)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'zh-CN'))
    .slice(0, 8)

  const standaloneRows = spread(standalonePosts.length, 82, 830)
  const seriesRows = allocateSeriesRows(summaries.map((summary) => summary.posts))
  const categoryRows = spread(categoryEntries.length, 330, 590)
  const nodePoints = new Map<string, KnowledgePoint>([['root', ROOT]])

  standalonePosts.forEach((post, index) => nodePoints.set(`post:${post.id}`, { x: 142, y: standaloneRows[index] }))
  summaries.forEach((summary) =>
    summary.posts.forEach((post) => nodePoints.set(`post:${post.id}`, { x: 1058, y: seriesRows.get(post.id) ?? 460 })),
  )
  categoryEntries.forEach(([name], index) => nodePoints.set(`category:${name}`, { x: 382, y: categoryRows[index] }))
  summaries.forEach((summary, index) => {
    const rows = summary.posts.map((post) => seriesRows.get(post.id)).filter((row): row is number => row !== undefined)
    nodePoints.set(`series:${summary.name}`, { x: 818, y: average(rows, 220 + index * 155) })
  })

  const tagSplit = Math.ceil(highTagEntries.length / 2)
  const topTagRows = highTagEntries.slice(0, tagSplit)
  const bottomTagRows = highTagEntries.slice(tagSplit)
  spread(topTagRows.length, 455, 745).forEach((x, index) =>
    nodePoints.set(`tag:${topTagRows[index][0]}`, { x, y: 31 }),
  )
  spread(bottomTagRows.length, 455, 745).forEach((x, index) =>
    nodePoints.set(`tag:${bottomTagRows[index][0]}`, { x, y: 889 }),
  )

  const knowledgePosts: KnowledgePost[] = posts.map((post) => ({
    id: post.id,
    nodeId: `post:${post.id}`,
    title: post.data.title,
    shortTitle: trimLabel(post.data.title, 23),
    description: post.data.description,
    href: postUrl(post),
    category: post.data.category,
    series: post.data.series,
    tags: post.data.tags,
    date: formatDate(post.data.updatedDate ?? post.data.pubDate),
    order: post.data.order,
  }))

  const categoryGroups: KnowledgeGroup[] = categoryEntries.map(([name, groupedPosts]) => ({
    name,
    href: categoryUrl(name),
    count: groupedPosts.length,
    postIds: groupedPosts.map((post) => post.id),
  }))
  const seriesGroups: KnowledgeGroup[] = summaries.map((summary) => ({
    name: summary.name,
    href: seriesUrl(summary.name),
    count: summary.count,
    postIds: summary.posts.map((post) => post.id),
  }))
  const highTags: KnowledgeGroup[] = highTagEntries.map(([name, taggedPosts]) => ({
    name,
    href: tagUrl(name),
    count: taggedPosts.length,
    postIds: taggedPosts.map((post) => post.id),
  }))

  const nodes: KnowledgeNode[] = [
    {
      id: 'root',
      kind: 'root',
      label: 'sleep4r knowledge',
      shortLabel: 'KNOWLEDGE',
      eyebrow: 'KNOWLEDGE CORE',
      detail: `以 ${posts.length} 篇技术文章为核心，沿分类、系列与高频标签追踪知识关系。`,
      meta: `${categoryGroups.length} categories · ${seriesGroups.length} series · ${highTags.length} signals`,
      href: '/map/',
      accent: '#52e198',
      width: 176,
      height: 74,
      count: posts.length,
      postIds: posts.map((post) => post.id),
      ...ROOT,
    },
    ...categoryGroups.map((group, index): KnowledgeNode => ({
      id: `category:${group.name}`,
      kind: 'category',
      label: group.name,
      shortLabel: trimLabel(group.name, 14),
      eyebrow: 'CATEGORY',
      detail: `${group.name} 分类共收录 ${group.count} 篇文章，连接该方向下的系列与独立研究记录。`,
      meta: `${group.count} linked articles`,
      href: group.href,
      accent: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
      width: 148,
      height: 58,
      count: group.count,
      postIds: group.postIds,
      category: group.name,
      ...(nodePoints.get(`category:${group.name}`) ?? ROOT),
    })),
    ...seriesGroups.map((group): KnowledgeNode => {
      const visual = getSeriesVisual(group.name)
      const summary = summaries.find((item) => item.name === group.name)
      return {
        id: `series:${group.name}`,
        kind: 'series',
        label: group.name,
        shortLabel: trimLabel(group.name, 12),
        eyebrow: `${visual.code} · SERIES`,
        detail: summary
          ? `从「${summary.posts[0]?.data.title}」到「${summary.posts.at(-1)?.data.title}」，按章节顺序阅读。`
          : `${group.name} 系列阅读路径。`,
        meta: `${group.count} ordered chapters`,
        href: group.href,
        accent: visual.palette.accent,
        width: 172,
        height: 58,
        count: group.count,
        postIds: group.postIds,
        series: group.name,
        ...(nodePoints.get(`series:${group.name}`) ?? ROOT),
      }
    }),
    ...highTags.map((group): KnowledgeNode => ({
      id: `tag:${group.name}`,
      kind: 'tag',
      label: `#${group.name}`,
      shortLabel: `#${trimLabel(group.name, 9)}`,
      eyebrow: 'HIGH-FREQ SIGNAL',
      detail: `高频标签「${group.name}」连接 ${group.count} 篇文章，可用于跨分类发现相邻主题。`,
      meta: `${group.count} matching articles`,
      href: group.href,
      accent: '#f2bd5b',
      width: Math.min(126, Math.max(84, 56 + [...group.name].length * 11)),
      height: 34,
      count: group.count,
      postIds: group.postIds,
      tags: [group.name],
      ...(nodePoints.get(`tag:${group.name}`) ?? ROOT),
    })),
    ...knowledgePosts.map((post, index): KnowledgeNode => {
      const categoryIndex = Math.max(0, categoryGroups.findIndex((group) => group.name === post.category))
      return {
        id: post.nodeId,
        kind: 'post',
        label: post.title,
        shortLabel: post.shortTitle,
        eyebrow: `ARTICLE · ${post.category}`,
        detail: post.description,
        meta: [post.date, post.series ? `series / ${post.series}` : 'standalone', ...post.tags.slice(0, 3).map((tag) => `#${tag}`)].join(' · '),
        href: post.href,
        accent: POST_COLORS[categoryIndex % POST_COLORS.length],
        width: 264,
        height: 46,
        count: 1,
        postIds: [post.id],
        category: post.category,
        series: post.series,
        tags: post.tags,
        date: post.date,
        ...(nodePoints.get(post.nodeId) ?? { x: index % 2 ? 1058 : 142, y: 460 }),
      }
    }),
  ]

  const byId = new Map(nodes.map((node) => [node.id, node]))
  const edges: KnowledgeEdge[] = []
  const addEdge = (
    from: string,
    to: string,
    relation: KnowledgeRelation,
    postIds: string[],
    accent: string,
  ) => {
    const source = byId.get(from)
    const target = byId.get(to)
    if (!source || !target) return
    edges.push({
      id: `edge:${edges.length + 1}`,
      from,
      to,
      relation,
      path: curve(source, target),
      accent,
      postIds,
    })
  }

  for (const category of categoryGroups) {
    const categoryNode = byId.get(`category:${category.name}`)
    addEdge('root', `category:${category.name}`, 'root', category.postIds, categoryNode?.accent ?? '#65d9ed')
    for (const postId of category.postIds) {
      addEdge(`category:${category.name}`, `post:${postId}`, 'category', [postId], categoryNode?.accent ?? '#65d9ed')
    }
  }

  for (const series of seriesGroups) {
    const seriesNode = byId.get(`series:${series.name}`)
    addEdge('root', `series:${series.name}`, 'root', series.postIds, seriesNode?.accent ?? '#ae91ff')
    for (const postId of series.postIds) {
      addEdge(`series:${series.name}`, `post:${postId}`, 'series', [postId], seriesNode?.accent ?? '#ae91ff')
    }
  }

  for (const tag of highTags) {
    addEdge('root', `tag:${tag.name}`, 'root', tag.postIds, '#f2bd5b')
    for (const postId of tag.postIds) addEdge(`tag:${tag.name}`, `post:${postId}`, 'tag', [postId], '#f2bd5b')
  }

  return {
    width: WIDTH,
    height: HEIGHT,
    nodes,
    edges,
    posts: knowledgePosts,
    categories: categoryGroups,
    series: seriesGroups,
    highTags,
    stats: {
      posts: posts.length,
      categories: categoryGroups.length,
      series: seriesGroups.length,
      tags: highTags.length,
      relations: edges.length,
    },
  }
}
