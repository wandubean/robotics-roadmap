import type { Element, ElementContent, RootContent } from 'hast'

// Small readers of the HTML trees lessons render to, shared by the server render (lesson-render.ts) and the page.

/** text of the bold label a paragraph starts with, e.g. `**확인 문제.** ...` → "확인 문제." */
export function boldLead(node: RootContent | ElementContent | undefined): string | undefined {
  if (node?.type !== 'element' || node.tagName !== 'p') return undefined
  const strong = node.children.find((c) => c.type !== 'text' || c.value.trim() !== '')
  if (strong?.type !== 'element' || strong.tagName !== 'strong') return undefined
  const text = strong.children[0]
  return text?.type === 'text' ? text.value : undefined
}

export function textOf(node: RootContent | ElementContent): string {
  if (node.type === 'text') return node.value
  return node.type === 'element' ? node.children.map(textOf).join('') : ''
}

export function summaryOf(node: RootContent): Element | undefined {
  if (node.type !== 'element' || node.tagName !== 'details') return undefined
  return node.children.find((c): c is Element => c.type === 'element' && c.tagName === 'summary')
}
