import { memo, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import hljs from 'highlight.js/lib/common'
import 'katex/dist/katex.min.css'

/** Renders assistant message content as Markdown with GFM tables/lists, LaTeX
 *  math (KaTeX), Mermaid diagrams, and syntax-highlighted code blocks. */
export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{ pre: CodeBlock as never }}
      >
        {preprocess(content)}
      </ReactMarkdown>
    </div>
  )
})

// Clean up + math-normalize, leaving fenced/inline code untouched.
// - strip zero-width chars and blank out whitespace-only lines (incl. nbsp /
//   full-width space) so they don't render as empty paragraphs ("多余空行");
// - collapse runs of blank lines;
// - convert \( … \) / \[ … \] to $ / $$ (remark-math only knows the latter).
function preprocess(src: string): string {
  return src
    .split(/(```[\s\S]*?```|`[^`]*`)/g)
    .map((seg, i) =>
      i % 2 === 1
        ? seg
        : seg
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .replace(/^[ \t\u00A0\u3000]+$/gm, '')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `$$${m}$$`)
            .replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m}$`),
    )
    .join('')
}

// Pull the raw text + language straight off the hast node so we're not at the
// mercy of the (possibly transformed) rendered children.
function CodeBlock({ node, children }: { node?: HastNode; children?: ReactNode }) {
  const code = node?.children?.find((c) => c.tagName === 'code')
  const raw = textOf(code) ?? ''
  const cls = classOf(code)
  const lang = /language-([\w-]+)/.exec(cls)?.[1]

  if (lang === 'mermaid') return <Mermaid chart={raw.replace(/\n$/, '')} />

  if (raw) {
    const html =
      lang && hljs.getLanguage(lang)
        ? hljs.highlight(raw, { language: lang }).value
        : hljs.highlightAuto(raw).value
    return (
      <pre className="md__pre">
        <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    )
  }
  // Fallback (shouldn't normally hit): render whatever children we got.
  return <pre className="md__pre">{children}</pre>
}

function Mermaid({ chart }: { chart: string }) {
  const id = 'mmd-' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const [svg, setSvg] = useState('')
  const [failed, setFailed] = useState(false)
  const lastOk = useRef('')

  useEffect(() => {
    let cancelled = false
    // Lazy-load mermaid (heavy) only when a diagram actually renders.
    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default
        const dark = document.documentElement.dataset.theme === 'dark'
        mermaid.initialize({
          startOnLoad: false,
          theme: dark ? 'dark' : 'default',
          securityLevel: 'strict',
        })
        const { svg } = await mermaid.render(id, chart)
        if (cancelled) return
        lastOk.current = svg
        setSvg(svg)
        setFailed(false)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [chart, id])

  // While a diagram is still streaming in it won't parse — show the source
  // until it renders cleanly (then swap to the SVG).
  if (svg && !failed) return <div className="md__mermaid" dangerouslySetInnerHTML={{ __html: svg }} />
  if (lastOk.current) return <div className="md__mermaid" dangerouslySetInnerHTML={{ __html: lastOk.current }} />
  return (
    <pre className="md__pre">
      <code className="hljs">{chart}</code>
    </pre>
  )
}

// --- minimal hast helpers (avoid pulling in @types/hast) ---
interface HastNode {
  tagName?: string
  value?: string
  properties?: { className?: string[] | string }
  children?: HastNode[]
}

function textOf(node?: HastNode): string | undefined {
  if (!node) return undefined
  if (typeof node.value === 'string') return node.value
  return (node.children ?? []).map((c) => textOf(c) ?? '').join('')
}

function classOf(node?: HastNode): string {
  const c = node?.properties?.className
  return Array.isArray(c) ? c.join(' ') : (c ?? '')
}
