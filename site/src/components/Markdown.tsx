import type { Element, Root } from 'hast'
import { toJsxRuntime, type Components } from 'hast-util-to-jsx-runtime'
import { Check, X } from './icons'
import { Children, isValidElement, useMemo, type ReactNode } from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import { CONFIG } from '../config'
import { boldLead } from '../curriculum/hast'
import { assetUrl } from '../curriculum/load'

const LESSON_LINK = /^\.\.\/([a-z0-9-]+)\/(README\.md)?$/

/** The rendered heading a `#slug` link in the lesson points at. */
export const sectionElement = (slug: string) => document.getElementById(CONFIG.lesson.sectionIdPrefix + slug)

/**
 * Scrolls `target` to the top of its scroll box once every figure there has its size. Figures load lazily, so those the
 * scroll passes would otherwise grow under it and leave the target short of the top.
 */
export async function scrollToSettled(target: HTMLElement | null) {
  if (!target) return
  const figures = [...(target.closest('.panel-scroll') ?? document).querySelectorAll('img')]
  for (const img of figures) img.loading = 'eager'
  await Promise.all(figures.map((img) => img.decode().catch(() => {})))
  target.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** first bold label of a blockquote's first paragraph, e.g. `> **오해** ...` → "오해" */
function leadLabel(node: Element | undefined): string | undefined {
  return boldLead(node?.children.find((c): c is Element => c.type === 'element'))
}

/** the belief paragraph gets an X, the fact paragraph a check; the bold label stays for screen readers only */
function misconceptionRows(children: ReactNode) {
  const paragraphs = Children.toArray(children).filter(isValidElement)
  return paragraphs.map((p, i) => {
    const Icon = i === 0 ? X : Check
    return (
      <div key={i} className={`misconception-row ${i === 0 ? 'is-belief' : 'is-fact'}`}>
        <Icon size={16} aria-hidden />
        {p}
      </div>
    )
  })
}

interface Props {
  lessonId: string
  /** a lesson body or quiz text, rendered on the server (lesson-render.ts) */
  tree: Root
  /** render inside phrasing content (a quiz choice label): paragraphs become spans */
  inline?: boolean
}

/**
 * Draw a rendered lesson body or quiz text. The `# Title` is not drawn because the panel header shows it, but it stays
 * in the source so the headings after it get the same slugs as on GitHub (a `## X` under `# X` is `x-1` there).
 */
export function Markdown({ lessonId, tree, inline = false }: Props) {
  const blob = `${CONFIG.repoUrl}/blob/${CONFIG.repoBranch}/lessons/${lessonId}/`

  const components: Components = {
    a({ href = '', children, ...rest }) {
      const internal = LESSON_LINK.exec(href)
      if (internal) return <a href={`#/p/${internal[1]}`}>{children}</a>
      // the page hash holds the route, so a section link scrolls the panel instead of changing it
      if (href.startsWith('#')) {
        const id = CONFIG.lesson.sectionIdPrefix + decodeURIComponent(href.slice(1))
        return (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault()
              scrollToSettled(document.getElementById(id))
            }}
          >
            {children}
          </a>
        )
      }
      if (/^[a-z]+:/i.test(href)) {
        return (
          <a href={href} target="_blank" rel="noreferrer" {...rest}>
            {children}
          </a>
        )
      }
      return (
        <a href={new URL(href, blob).toString()} target="_blank" rel="noreferrer">
          {children}
        </a>
      )
    },
    img({ src = '', alt = '' }) {
      return <img src={/^[a-z]+:/i.test(src) ? src : assetUrl(lessonId, src)} alt={alt} loading="lazy" />
    },
    h1: () => null,
    ...(inline && { p: ({ children }: { children?: ReactNode }) => <span>{children}</span> }),
    // `> **오해** ...` then `> **사실** ...` is a misconception box: one line for the belief, one for the fact
    blockquote({ node, children }) {
      if (leadLabel(node) !== '오해') return <blockquote>{children}</blockquote>
      return (
        <aside className="misconception">
          <span className="aside-label">흔한 오해</span>
          {misconceptionRows(children)}
        </aside>
      )
    },
    section({ className, children }) {
      if (className !== 'check') return <section className={className}>{children}</section>
      return (
        <section className="check">
          <span className="aside-label">확인 문제</span>
          {children}
        </section>
      )
    },
    summary({ className, children }) {
      if (className !== 'deep-summary') return <summary className={className}>{children}</summary>
      return (
        <summary className={className}>
          <span className="deep-badge">심화</span>
          <span>{children}</span>
        </summary>
      )
    },
    table({ children }) {
      return (
        <div className="md-table">
          <table>{children}</table>
        </div>
      )
    },
  }

  // a lesson body is a large tree; build its elements once per tree, not on every panel render
  const content = useMemo(
    () => toJsxRuntime(tree, { Fragment, jsx, jsxs, components, passNode: true, ignoreInvalidStyle: true }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tree, lessonId, inline],
  )
  const Wrapper = inline ? 'span' : 'div'
  return <Wrapper className={inline ? 'markdown-inline' : 'markdown'}>{content}</Wrapper>
}
