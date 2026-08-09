/**
 * 为文章阅读轨迹生成稳定的虚拟 PC 地址。
 *
 * 地址只承担视觉索引：同一篇文章的同一标题始终得到同一结果，末两位按
 * 4-byte 指令对齐。实现保持浏览器/SSR 双端纯函数，方便 TOC 与运行时 HUD
 * 共用而不引入额外状态。
 */
const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193
const TRACE_BASE = 0x70000000
const TRACE_MASK = 0x0ffffffc

export const stableTraceHash = (value: string) => {
  let hash = FNV_OFFSET
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, FNV_PRIME)
  }
  return hash >>> 0
}

/** 从 `/posts/<slug>/` 提取文章 slug；非文章路径仍返回规范化路径。 */
export const traceSlugFromPathname = (pathname: string) => {
  const normalized = pathname.split(/[?#]/, 1)[0].replace(/^\/+|\/+$/g, '')
  const parts = normalized.split('/').filter(Boolean)
  const postsIndex = parts.indexOf('posts')
  const encoded = postsIndex >= 0 ? parts.slice(postsIndex + 1).join('/') : normalized

  try {
    return decodeURIComponent(encoded) || 'article'
  } catch {
    return encoded || 'article'
  }
}

/** 返回形如 `0x7A12F3C0` 的稳定、4-byte 对齐虚拟地址。 */
export const tracePcAddress = (postSlug: string, headingKey: string, index = 0) => {
  const headingHash = stableTraceHash(`${postSlug}\u241f${headingKey}`)
  const mixed = (headingHash ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0
  const offset = (mixed ^ (mixed >>> 16)) & TRACE_MASK
  const address = (TRACE_BASE + offset) >>> 0
  return `0x${address.toString(16).toUpperCase().padStart(8, '0')}`
}
