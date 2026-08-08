import type { ShikiTransformer } from 'shiki'
import type { Element, Root } from 'hast'

/** 解析 ```c {1,4-6} 里的行号范围 */
function parseHighlights(meta: string): Set<number> {
  const out = new Set<number>()
  const m = meta.match(/\{([\d,\s-]+)\}/)
  if (!m) return out
  for (const part of m[1].split(',')) {
    const seg = part.trim()
    if (!seg) continue
    const [a, b] = seg.split('-').map((n) => Number.parseInt(n, 10))
    if (Number.isNaN(a)) continue
    // 单个行号时 b 是 undefined，Number.isNaN(undefined) 为 false，必须单独判空
    const end = b === undefined || Number.isNaN(b) ? a : b
    for (let i = a; i <= end; i++) out.add(i)
  }
  return out
}

/** 解析 title="xxx" 或 title='xxx' */
function parseTitle(meta: string): string | null {
  const m = meta.match(/title=(?:"([^"]*)"|'([^']*)')/)
  return m ? (m[1] ?? m[2] ?? null) : null
}

const COLLAPSE_THRESHOLD = 34

/**
 * 把 Shiki 输出的 <pre> 包成一个带标题栏的「编辑器窗口」：
 * 语言标签、可选文件名、复制按钮、行号、行高亮、超长自动折叠。
 *
 * 用法： ```c title="loader.c" {12,18-20} nolines
 */
export function transformerCodeBlock(): ShikiTransformer {
  let meta = ''
  let highlights = new Set<number>()
  let lineCount = 0

  return {
    name: 'sleep4r:code-block',

    preprocess() {
      meta = (this.options.meta?.__raw as string | undefined) ?? ''
      highlights = parseHighlights(meta)
      lineCount = 0
    },

    line(node, lineNumber) {
      lineCount = Math.max(lineCount, lineNumber)
      if (highlights.has(lineNumber)) {
        const cls = node.properties.class
        node.properties.class = cls ? `${cls} highlighted` : 'line highlighted'
      }
      return node
    },

    root(root: Root) {
      const pre = root.children.find(
        (n): n is Element => n.type === 'element' && n.tagName === 'pre',
      )
      if (!pre) return

      const lang = String(this.options.lang ?? 'text')
      const title = parseTitle(meta)
      const showLines = !/\bnolines\b/.test(meta) && lineCount > 1
      const collapsible = lineCount > COLLAPSE_THRESHOLD && !/\bnocollapse\b/.test(meta)

      // Shiki 的内联样式会盖掉我们的主题背景，这里交还给 CSS 控制
      pre.properties.style = String(pre.properties.style ?? '').replace(
        /background-color:[^;]+;?/g,
        '',
      )

      const head: Element = {
        type: 'element',
        tagName: 'div',
        properties: { class: 'code-head' },
        children: [
          {
            type: 'element',
            tagName: 'span',
            properties: { class: 'code-lang' },
            children: [{ type: 'text', value: lang }],
          },
          ...(title
            ? ([
                {
                  type: 'element',
                  tagName: 'span',
                  properties: { class: 'code-title' },
                  children: [{ type: 'text', value: title }],
                },
              ] as Element[])
            : []),
          {
            type: 'element',
            tagName: 'button',
            properties: {
              class: 'code-copy',
              type: 'button',
              'data-copy': '',
              'aria-label': '复制代码',
            },
            children: [{ type: 'text', value: 'copy' }],
          },
        ],
      }

      const scroll: Element = {
        type: 'element',
        tagName: 'div',
        properties: { class: 'code-scroll' },
        children: [pre],
      }

      const children: Element[] = [head, scroll]

      if (collapsible) {
        children.push({
          type: 'element',
          tagName: 'button',
          properties: {
            class: 'code-expand',
            type: 'button',
            'data-expand': '',
            'aria-label': '展开或收起代码块',
            'aria-expanded': 'false',
          },
          children: [{ type: 'text', value: `展开全部 ${lineCount} 行` }],
        })
      }

      const figure: Element = {
        type: 'element',
        tagName: 'figure',
        properties: {
          class: 'code-block',
          ...(showLines ? { 'data-line-numbers': '' } : {}),
          ...(collapsible ? { 'data-collapsible': '', 'data-open': 'false' } : {}),
        },
        children,
      }

      root.children = [figure]
    },
  }
}
