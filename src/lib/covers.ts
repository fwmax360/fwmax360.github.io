/** 文章封面的固定画布尺寸，与 scripts/gen-covers.mjs 保持一致。 */
export const COVER_WIDTH = 1200
export const COVER_HEIGHT = 630

export type CoverFormat = 'png' | 'svg'

export type CoverTarget =
  | string
  | {
      id: string
      data?: { title?: string }
    }

function coverSlug(target: CoverTarget) {
  const raw = typeof target === 'string' ? target : target.id
  return raw
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/^posts\//, '')
    .replace(/\.mdx?$/i, '')
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')
}

/** 返回 public/covers/posts 中对应文章的静态封面 URL。 */
export function postCoverUrl(target: CoverTarget, format: CoverFormat = 'png') {
  return `/covers/posts/${coverSlug(target)}.${format}`
}

/** 简短别名，便于已有组件按统一 coverUrl 命名调用。 */
export const coverUrl = postCoverUrl
export const coverPngUrl = (target: CoverTarget) => postCoverUrl(target, 'png')
export const coverSvgUrl = (target: CoverTarget) => postCoverUrl(target, 'svg')

/** 可直接展开给 Astro Image/原生 img 的封面元数据。 */
export function coverImage(target: CoverTarget, format: CoverFormat = 'png') {
  const title = typeof target === 'string' ? '' : target.data?.title
  return {
    src: postCoverUrl(target, format),
    width: COVER_WIDTH,
    height: COVER_HEIGHT,
    alt: title ? `${title}｜文章封面` : '文章封面',
  } as const
}
