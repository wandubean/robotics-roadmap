import type { ElementContent, Root, RootContent } from 'hast'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { CONFIG } from './src/config.ts'
import { boldLead, summaryOf, textOf } from './src/curriculum/hast.ts'
import type { Topic } from './src/curriculum/quiz.ts'

// Lessons and quiz texts are turned into HTML trees here, on the server, so the page neither carries the markdown
// parser and KaTeX nor spends a phone's time running them; it only turns each tree into React elements.

/** drop a leading prefix from the first text node under `node` */
function stripPrefix(node: ElementContent, prefix: RegExp): boolean {
  if (node.type === 'text') {
    node.value = node.value.replace(prefix, '')
    return true
  }
  return node.type === 'element' && node.children.some((c) => stripPrefix(c, prefix))
}

const DEEP_PREFIX = /^심화:\s*/

/**
 * Mark the lesson's folding blocks so they can be drawn apart: a `**확인 문제.**` paragraph and everything up to its
 * `답 보기` answer become one `section.check`, and a `심화:` block gets `details.deep` with the prefix moved to a badge.
 * The markdown stays plain so the lesson reads the same on GitHub.
 */
function rehypeLessonBlocks() {
  return (tree: Root) => {
    const kids = tree.children
    const out: RootContent[] = []
    for (let i = 0; i < kids.length; i++) {
      const node = kids[i]
      const summary = summaryOf(node)
      if (node.type === 'element' && summary && DEEP_PREFIX.test(textOf(summary))) {
        node.properties.className = ['deep']
        summary.properties.className = ['deep-summary']
        stripPrefix(summary, DEEP_PREFIX)
      }
      if (boldLead(node) === '확인 문제.') {
        const answer = kids.findIndex((n, j) => j > i && textOf(summaryOf(n) ?? { type: 'text', value: '' }) === '답 보기')
        const heading = kids.findIndex((n, j) => j > i && n.type === 'element' && /^h[1-6]$/.test(n.tagName))
        if (answer > 0 && (heading < 0 || answer < heading)) {
          out.push({ type: 'element', tagName: 'section', properties: { className: ['check'] }, children: kids.slice(i, answer + 1) as ElementContent[] })
          i = answer
          continue
        }
      }
      out.push(node)
    }
    tree.children = out
  }
}

/** source positions are only for error messages; the page does not need them */
function dropPositions(node: Root | RootContent) {
  delete node.position
  if ('children' in node) for (const c of node.children) dropPositions(c)
}

const pipeline = unified()
  .use(remarkParse)
  // a single ~ is a range ("10~50 Hz"), so only ~~text~~ strikes through
  .use(remarkGfm, { singleTilde: false })
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeLessonBlocks)
  // headings get GitHub's slug as their id, prefixed so they cannot clash with the app's own ids; a `#slug` link in a
  // lesson therefore works both here and on GitHub
  .use(rehypeSlug, { prefix: CONFIG.lesson.sectionIdPrefix })
  .use(rehypeKatex)

/** Markdown (a lesson body or a quiz text) as the HTML tree the page draws. */
export function renderMarkdown(source: string): Root {
  const tree = pipeline.runSync(pipeline.parse(source)) as Root
  dropPositions(tree)
  return tree
}

/** A quiz bank with every text rendered. */
export function renderBank(bank: Topic[]): Topic<Root>[] {
  return bank.map((t) => ({
    ...t,
    variants: t.variants.map((v) => ({
      ...v,
      question: renderMarkdown(v.question),
      choices: v.choices.map(renderMarkdown),
      explanation: renderMarkdown(v.explanation),
    })),
  }))
}
