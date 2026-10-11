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

      // Empty corner headers still need a name; preserve visible Markdown content.
      let headerIndex = 0
      visit(node, 'element', (cell: Element) => {
        if (cell.tagName !== 'th') return
        headerIndex++
        if (cell.children.length === 0) cell.children.push({ type: 'element', tagName: 'span', properties: { className: ['sr-only'] }, children: [{ type: 'text', value: `第 ${headerIndex} 列` }] })
      })
      parent.children[index] = {
        type: 'element',
        tagName: 'div',
        properties: { class: 'table-wrap', tabIndex: 0, role: 'group', 'aria-label': '数据表格（可横向滚动）' },
        children: [node],
      }
    })
  }
}
