"use client"

import type { ReactElement, ReactNode } from "react"
import clsx from "clsx"
import { memo, useCallback, useEffect, useMemo, useRef, useState, isValidElement, createContext, useContext } from "react"
import { Check, Copy, ExternalLink } from "lucide-react"
import ReactMarkdown from "react-markdown"
import type { Components } from "react-markdown"
import rehypeSanitize, { defaultSchema } from "rehype-sanitize"
import remarkGfm from "remark-gfm"

type HastElement = { properties?: Record<string, unknown> }
type Schema = Record<string, unknown>
type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
type MarkdownVariant = "default" | "inverted"

const MarkdownVariantContext = createContext<MarkdownVariant>("default")

const SUSPICIOUS_CONTENT_PATTERN = /<(?:script|iframe|object|embed)|javascript:|data:text\/html|on[a-z]+\s*=|style=/i

const SANITIZE_SCHEMA: Schema = {
  ...defaultSchema,
  allowComments: false,
  tagNames: [
    "a",
    "blockquote",
    "br",
    "code",
    "del",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "kbd",
    "hr",
    "input",
    "li",
    "ol",
    "p",
    "pre",
    "span",
    "strong",
    "sub",
    "sup",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "ul",
  ],
  attributes: {
    ...defaultSchema.attributes,
    "*": [
      ...(defaultSchema.attributes?.["*"] ?? []),
      ["align", ["left", "center", "right"]],
      ["className"],
    ],
    a: [
      ...(defaultSchema.attributes?.a ?? []),
      ["href"],
      ["title"],
      ["rel"],
      ["target"],
    ],
    th: [
      ["align"],
      ["colspan"],
      ["rowspan"],
    ],
    td: [
      ["align"],
      ["colspan"],
      ["rowspan"],
    ],
    code: [["className"]],
    pre: [["className"]],
    span: [["className"]],
    input: [
      ["type", ["checkbox"]],
      ["disabled"],
      ["checked"],
    ],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto", "tel"],
  },
}

function alignClass(node?: HastElement) {
  const align = (node?.properties?.align as string | undefined)?.toLowerCase()
  if (align === "center" || align === "right") {
    return `text-${align}`
  }
  return "text-left"
}

function createHeading(level: number) {
  const base = "font-semibold tracking-tight text-foreground last:mb-0"
  const spacing = level === 1 ? "mt-7 mb-4 text-xl" : level === 2 ? "mt-6 mb-3.5 text-lg" : "mt-5 mb-3 text-base"
  return function Heading({ children }: { children?: ReactNode }) {
    const Tag = `h${level}` as HeadingTag
    return <Tag className={clsx(base, spacing)}>{children}</Tag>
  }
}

function extractText(node: ReactNode): string {
  if (node === undefined || node === null) {
    return ""
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map(extractText).join("")
  }
  if (isValidElement(node)) {
    const element = node as ReactElement
    const child = (element.props as { children?: ReactNode }).children
    return extractText(child ?? "")
  }
  return ""
}

async function copyToClipboard(text: string): Promise<boolean> {
  // Try modern clipboard API first (requires HTTPS)
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback for HTTP or older browsers
  try {
    const textarea = document.createElement("textarea")
    textarea.value = text
    textarea.style.position = "fixed"
    textarea.style.left = "-9999px"
    textarea.style.top = "-9999px"
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const success = document.execCommand("copy")
    document.body.removeChild(textarea)
    return success
  } catch {
    return false
  }
}

function MarkdownCodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false)
  const variant = useContext(MarkdownVariantContext)
  const preRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (!copied) return
    const timeout = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timeout)
  }, [copied])

  const handleCopy = useCallback(async () => {
    const text = preRef.current?.textContent?.trim()
    if (!text) return

    const success = await copyToClipboard(text)
    if (success) {
      setCopied(true)
    } else {
      console.warn("[Markdown] Failed to copy code block")
    }
  }, [])

  const isInverted = variant === "inverted"

  return (
    <div className="relative mt-3 mb-4 last:mb-0">
      <div className="absolute right-2 top-2 z-20">
        <button
          type="button"
          onClick={handleCopy}
          className={clsx(
            "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] shadow-sm transition-all duration-200 cursor-pointer select-none",
            copied
              ? "border border-emerald-500/50 bg-emerald-500 text-white"
              : isInverted
                ? "border border-white/30 bg-white/10 text-white/90 hover:bg-white/20"
                : "border border-border/60 bg-white/90 text-foreground/80 hover:bg-white hover:text-foreground dark:bg-[hsl(250_40%_18%)] dark:text-[hsl(210_20%_85%)] dark:hover:bg-[hsl(250_40%_22%)]",
            "focus:outline-none focus:ring-2 focus:ring-offset-1"
          )}
          aria-label={copied ? "Code copied" : "Copy code"}
        >
          {copied ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre
        ref={preRef}
        className={clsx(
          "overflow-x-auto rounded-xl px-4 py-3 pr-20 text-[13px] leading-relaxed font-mono",
          isInverted
            ? "border border-white/20 bg-black/30 backdrop-blur-sm text-white/95"
            : "border border-border/40 bg-[hsl(250_30%_97%)] text-[hsl(250_30%_15%)] dark:bg-[hsl(250_40%_12%)] dark:text-[hsl(210_20%_92%)]"
        )}
      >
        {children}
      </pre>
    </div>
  )
}

export function safeUrl(href?: string | null) {
  if (typeof href !== "string") {
    return undefined
  }
  const trimmed = href.trim()
  if (!trimmed) {
    return undefined
  }
  const lower = trimmed.toLowerCase()
  if (trimmed.startsWith("#") || trimmed.startsWith("/")) {
    return trimmed
  }
  if (lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("mailto:") || lower.startsWith("tel:")) {
    return trimmed
  }
  return undefined
}

function InlineCode({ className, children }: { className?: string; children?: ReactNode }) {
  const variant = useContext(MarkdownVariantContext)
  const isInverted = variant === "inverted"

  return (
    <code
      className={clsx(
        "rounded-md px-1.5 py-0.5 font-mono text-[13px]",
        isInverted
          ? "bg-white/15 text-white/95"
          : "bg-[hsl(250_40%_94%)] text-[hsl(262_88%_28%)] dark:bg-[hsl(250_40%_20%)] dark:text-[hsl(250_70%_80%)]",
        className
      )}
    >
      {children}
    </code>
  )
}

function MarkdownBlockquote({ children }: { children?: ReactNode }) {
  const variant = useContext(MarkdownVariantContext)
  const isInverted = variant === "inverted"

  return (
    <blockquote
      className={clsx(
        "mt-4 mb-4 last:mb-0 border-l-2 pl-4 text-sm italic leading-[1.7]",
        isInverted
          ? "border-white/40 text-white/80"
          : "border-[hsl(262_88%_28%)]/30 text-muted-foreground"
      )}
    >
      {children}
    </blockquote>
  )
}

function MarkdownTable({ children }: { children?: ReactNode }) {
  const variant = useContext(MarkdownVariantContext)
  const isInverted = variant === "inverted"

  return (
    <div
      className={clsx(
        "mt-4 mb-4 last:mb-0 overflow-auto rounded-xl",
        isInverted
          ? "border border-white/20"
          : "border border-border/50"
      )}
    >
      <table
        className={clsx(
          "w-full min-w-[480px] border-collapse text-sm leading-[1.4]",
          isInverted ? "text-white/95" : "text-foreground"
        )}
      >
        {children}
      </table>
    </div>
  )
}

function MarkdownThead({ children }: { children?: ReactNode }) {
  const variant = useContext(MarkdownVariantContext)
  const isInverted = variant === "inverted"

  return (
    <thead
      className={clsx(
        "text-xs uppercase tracking-wide",
        isInverted
          ? "bg-white/10 text-white/70"
          : "bg-[hsl(250_40%_94%)] text-muted-foreground dark:bg-[hsl(250_40%_16%)]"
      )}
    >
      {children}
    </thead>
  )
}

function MarkdownTh({ node, children }: { node?: HastElement; children?: ReactNode }) {
  const variant = useContext(MarkdownVariantContext)
  const isInverted = variant === "inverted"

  return (
    <th
      className={clsx(
        "px-3 py-2 text-left font-semibold",
        isInverted ? "border-b border-white/20" : "border-b border-border/50",
        alignClass(node)
      )}
    >
      {children}
    </th>
  )
}

function MarkdownTd({ node, children }: { node?: HastElement; children?: ReactNode }) {
  const variant = useContext(MarkdownVariantContext)
  const isInverted = variant === "inverted"

  return (
    <td
      className={clsx(
        "px-3 py-2 align-top",
        isInverted ? "border-b border-white/15" : "border-b border-border/40",
        alignClass(node)
      )}
    >
      {children}
    </td>
  )
}

function MarkdownHr() {
  const variant = useContext(MarkdownVariantContext)
  const isInverted = variant === "inverted"

  return <hr className={clsx("mt-6 mb-6 last:mb-0", isInverted ? "border-white/20" : "border-border/60")} />
}

function MarkdownLink({ href, children, ...props }: { href?: string; children?: ReactNode }) {
  const variant = useContext(MarkdownVariantContext)
  const isInverted = variant === "inverted"
  const sanitizedHref = safeUrl(href)
  const isExternal = Boolean(sanitizedHref && sanitizedHref.startsWith("http"))
  const rel = isExternal ? "noopener noreferrer nofollow ugc" : "nofollow ugc"

  return (
    <a
      {...props}
      href={sanitizedHref}
      className={clsx(
        "inline-flex items-center gap-1 underline decoration-dashed hover:decoration-solid",
        isInverted
          ? "decoration-white/50 hover:decoration-white"
          : "decoration-foreground/40 hover:decoration-foreground"
      )}
      target={isExternal ? "_blank" : undefined}
      rel={rel}
      onClick={
        sanitizedHref
          ? undefined
          : (event) => {
              event.preventDefault()
            }
      }
    >
      {children}
      {isExternal && <ExternalLink className="h-3 w-3" aria-hidden />}
    </a>
  )
}

const components: Components = {
  h1: createHeading(1),
  h2: createHeading(2),
  h3: createHeading(3),
  h4: createHeading(4),
  h5: createHeading(5),
  h6: createHeading(6),
  p: ({ children }) => (
    <p className="whitespace-pre-wrap mb-4 text-sm leading-[1.9] last:mb-0">{children}</p>
  ),
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => (
    <ul className="ml-4 mb-4 last:mb-0 list-disc space-y-2 text-sm leading-[1.6]">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="ml-4 mb-4 last:mb-0 list-decimal space-y-2 text-sm leading-[1.6]">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-[1.6]">{children}</li>,
  blockquote: MarkdownBlockquote,
  hr: MarkdownHr,
  a: MarkdownLink,
  code: ({ inline = false, className, children }: { inline?: boolean; className?: string; children?: ReactNode }) =>
    inline ? (
      <InlineCode className={className}>{children}</InlineCode>
    ) : (
      <code className={clsx("font-mono text-[13px]", className)}>{children}</code>
    ),
  pre: ({ children }) => <MarkdownCodeBlock>{children}</MarkdownCodeBlock>,
  table: MarkdownTable,
  thead: MarkdownThead,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  th: MarkdownTh,
  td: MarkdownTd,
  br: () => <br />,
}

const MARKDOWN_PLUGINS = [remarkGfm]
const SANITIZE_PLUGIN: [typeof rehypeSanitize, Schema] = [rehypeSanitize, SANITIZE_SCHEMA]

export const Markdown = memo(function Markdown({
  content,
  className,
  variant = "default",
}: {
  content: string
  className?: string
  variant?: MarkdownVariant
}) {
  const trimmed = content.trim()
  const flagged = useMemo(() => SUSPICIOUS_CONTENT_PATTERN.test(content), [content])
  useEffect(() => {
    if (flagged) {
      console.warn("[Markdown] Received content containing potentially unsafe patterns", {
        preview: content.slice(0, 200),
      })
    }
  }, [flagged, content])

  if (!trimmed) {
    return <div className={className}>{content}</div>
  }

  return (
    <MarkdownVariantContext.Provider value={variant}>
      <div className={clsx("markdown-root whitespace-normal", className)}>
        <ReactMarkdown remarkPlugins={MARKDOWN_PLUGINS} rehypePlugins={[SANITIZE_PLUGIN]} components={components}>
          {trimmed}
        </ReactMarkdown>
      </div>
    </MarkdownVariantContext.Provider>
  )
})

export type { Markdown as MarkdownComponent, MarkdownVariant }
