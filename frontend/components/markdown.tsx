"use client"

import { memo } from "react"

const LIST_CLASS = "space-y-1 list-outside"

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function sanitizeUrl(rawUrl: string) {
  const url = rawUrl.trim()
  if (!url) return ""
  const lower = url.toLowerCase()
  if (lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("mailto:")) {
    return url
  }
  return ""
}

function renderInlineSegment(text: string): string {
  let escaped = escapeHtml(text)

  const brPlaceholders: string[] = []
  escaped = escaped.replace(/&lt;br\s*\/?&gt;/gi, () => {
    brPlaceholders.push("<br />")
    return `%%BR${brPlaceholders.length - 1}%%`
  })

  const codePlaceholders: string[] = []
  escaped = escaped.replace(/`([^`]+)`/g, (_, inner) => {
    codePlaceholders.push(`<code>${escapeHtml(inner)}</code>`)
    return `%%CODE${codePlaceholders.length - 1}%%`
  })

  const linkPlaceholders: string[] = []
  escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const safeUrl = sanitizeUrl(url)
    if (!safeUrl) {
      return escapeHtml(label)
    }
    const linkHtml = `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="underline decoration-dashed decoration-foreground/40 hover:decoration-foreground">${escapeHtml(label)}</a>`
    linkPlaceholders.push(linkHtml)
    return `%%LINK${linkPlaceholders.length - 1}%%`
  })

  escaped = escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/~~(.+?)~~/g, "<del>$1</del>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/_(.+?)_/g, "<em>$1</em>")

  escaped = escaped.replace(/%%CODE(\d+)%%/g, (_, idx) => codePlaceholders[Number(idx)] ?? "")
  escaped = escaped.replace(/%%LINK(\d+)%%/g, (_, idx) => linkPlaceholders[Number(idx)] ?? "")
  escaped = escaped.replace(/%%BR(\d+)%%/g, (_, idx) => brPlaceholders[Number(idx)] ?? "")

  return escaped
}

function markdownToHtml(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  let html = ""
  let inUl = false
  let inOl = false
  let inCodeBlock = false
  let codeFenceLanguage = ""
  const codeLines: string[] = []
  const paragraphLines: string[] = []

  const closeLists = () => {
    if (inUl) {
      html += "</ul>"
      inUl = false
    }
    if (inOl) {
      html += "</ol>"
      inOl = false
    }
  }

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      const paragraph = paragraphLines.join("<br />")
      html += `<p class="leading-relaxed">${paragraph}</p>`
      paragraphLines.length = 0
    }
  }

  const flushCodeBlock = () => {
    if (!inCodeBlock) return
    const languageClass = codeFenceLanguage ? ` class="language-${escapeHtml(codeFenceLanguage)}"` : ""
    html += `<pre class="rounded-md bg-muted/70 px-3 py-2 text-xs leading-5 overflow-x-auto"><code${languageClass}>${escapeHtml(codeLines.join("\n"))}</code></pre>`
    codeLines.length = 0
    inCodeBlock = false
    codeFenceLanguage = ""
  }

  const isTableSeparator = (line: string) => {
    return /^\s*\|?\s*:?[-\s|:]+:?\s*\|?\s*$/.test(line)
  }

  const splitTableCells = (row: string) => {
    const trimmed = row.trim()
    const withoutEdges = trimmed.startsWith("|") && trimmed.endsWith("|")
      ? trimmed.slice(1, -1)
      : trimmed
    return withoutEdges.split("|").map((cell) => renderInlineSegment(cell.trim()))
  }

  const parseAlignment = (separator: string) => {
    const cells = splitTableCells(separator)
    return cells.map((cell) => {
      const text = cell.replace(/<[^>]+>/g, "")
      const startsWithColon = /^:/.test(text)
      const endsWithColon = /:$/.test(text)
      if (startsWithColon && endsWithColon) return "center"
      if (endsWithColon) return "right"
      if (startsWithColon) return "left"
      return "left"
    })
  }

  for (let index = 0; index < lines.length; index++) {
    const rawLine = lines[index]
    const line = rawLine

    if (inCodeBlock) {
      if (/^```/.test(line.trim())) {
        flushCodeBlock()
        continue
      }
      codeLines.push(line)
      continue
    }

    if (/^```/.test(line.trim())) {
      flushParagraph()
      closeLists()
      inCodeBlock = true
      const fenceMatch = line.trim().match(/^```(\S+)?/)
      codeFenceLanguage = fenceMatch?.[1] ?? ""
      continue
    }

    if (line.trim() === "") {
      flushParagraph()
      closeLists()
      continue
    }

    // Table detection
    const nextLine = lines[index + 1]
    if (nextLine && isTableSeparator(nextLine)) {
      const headerCells = splitTableCells(line)
      const alignments = parseAlignment(nextLine)
      let bodyRows: string[][] = []
      let bodyIndex = index + 2

      while (bodyIndex < lines.length && /\|/.test(lines[bodyIndex])) {
        const rowLine = lines[bodyIndex]
        if (rowLine.trim() === "") break
        bodyRows.push(splitTableCells(rowLine))
        bodyIndex += 1
      }

      if (headerCells.length > 1 && bodyRows.length > 0) {
        flushParagraph()
        closeLists()
        html += '<div class="markdown-table-wrapper"><table class="markdown-table">'
        html += '<thead><tr>'
        headerCells.forEach((cell, idx) => {
          const align = alignments[idx] ?? "left"
          html += `<th class="align-${align}">${cell}</th>`
        })
        html += '</tr></thead><tbody>'
        bodyRows.forEach((row) => {
          html += '<tr>'
          row.forEach((cell, idx) => {
            const align = alignments[idx] ?? "left"
            html += `<td class="align-${align}">${cell}</td>`
          })
          html += '</tr>'
        })
        html += '</tbody></table></div>'
        index = bodyIndex - 1
        continue
      }
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 6)
      const content = renderInlineSegment(headingMatch[2])
      flushParagraph()
      closeLists()
      html += `<h${level} class="font-semibold">${content}</h${level}>`
      continue
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const content = line.replace(/^\s*[-*+]\s+/, "")
      flushParagraph()
      if (inOl) {
        html += "</ol>"
        inOl = false
      }
      if (!inUl) {
        html += `<ul class="${LIST_CLASS} list-disc pl-4">`
        inUl = true
      }
      html += `<li>${renderInlineSegment(content)}</li>`
      continue
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const content = line.replace(/^\s*\d+\.\s+/, "")
      flushParagraph()
      if (inUl) {
        html += "</ul>"
        inUl = false
      }
      if (!inOl) {
        html += `<ol class="${LIST_CLASS} list-decimal pl-5">`
        inOl = true
      }
      html += `<li>${renderInlineSegment(content)}</li>`
      continue
    }

    paragraphLines.push(renderInlineSegment(line))
  }

  flushCodeBlock()
  flushParagraph()
  closeLists()

  if (!html) {
    return ""
  }

  return html
}

export const Markdown = memo(function Markdown({ content, className }: { content: string; className?: string }) {
  const html = markdownToHtml(content)

  if (!html) {
    return <div className={className}>{content}</div>
  }

  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
})

export type { Markdown as MarkdownComponent }
