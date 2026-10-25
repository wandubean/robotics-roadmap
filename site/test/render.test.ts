import type { Element, Root } from 'hast'
import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../lesson-render'

const elements = (node: Root | Element): Element[] =>
  node.children.flatMap((c) => (c.type === 'element' ? [c, ...elements(c)] : []))

describe('lesson render', () => {
  const tree = renderMarkdown(
    [
      '# Title',
      '',
      '## title',
      '',
      '**확인 문제.** 1 + 1 은?',
      '',
      '<details><summary>답 보기</summary>',
      '',
      '2',
      '',
      '</details>',
      '',
      '<details><summary><b>심화: 유도</b></summary>',
      '',
      '$x^2$',
      '',
      '</details>',
    ].join('\n'),
  )
  const all = elements(tree)

  it('gives headings the GitHub slug, prefixed, counting the title', () => {
    expect(all.filter((e) => /^h\d$/.test(e.tagName)).map((e) => e.properties.id)).toEqual(['sec-title', 'sec-title-1'])
  })

  it('wraps a check question and its answer in one section', () => {
    const check = all.find((e) => e.tagName === 'section')
    expect(check?.properties.className).toEqual(['check'])
    expect(check?.children.filter((c) => c.type === 'element').map((c) => (c as Element).tagName)).toEqual(['p', 'details'])
  })

  it('marks a 심화 block and drops the prefix from its summary', () => {
    const deep = all.find((e) => e.tagName === 'details' && (e.properties.className as string[] | undefined)?.includes('deep'))
    expect(deep).toBeDefined()
    expect(JSON.stringify(deep)).not.toContain('심화:')
  })

  it('renders math with KaTeX and keeps no source positions', () => {
    expect(all.some((e) => (e.properties.className as string[] | undefined)?.includes('katex'))).toBe(true)
    expect(JSON.stringify(tree)).not.toContain('"position"')
  })
})
