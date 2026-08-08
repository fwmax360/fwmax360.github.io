import { visit } from 'unist-util-visit'
import type { Element, Root } from 'hast'

/**
 * 给 <table> 套一层可横向滚动的容器。
 * 直接对 table 设 overflow 会让它退化成收缩宽度的块级盒子，撑不满正文列。
 */
export function rehypeTableWrap() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element, index, parent) => {
      if (node.tagName !== 'table' || !parent || index === undefined) return
      if (parent.type === 'element' && (parent as Element).properties?.className?.toString().includes('table-wrap'))
        return

      parent.children[index] = {
        type: 'element',
        tagName: 'div',
        properties: { class: 'table-wrap' },
        children: [node],
      }
    })
  }
}
