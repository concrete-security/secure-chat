import { generateIframeBootstrapScript } from "./iframe-scripts"

type FetchImpl = (url: string) => Promise<Response>

function resolveUrl(href: string, basePath: string): string {
  if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("data:")) {
    return href
  }
  const base = basePath.endsWith("/") ? basePath : basePath + "/"
  if (href.startsWith("./")) href = href.slice(2)
  if (href.startsWith("/")) return href
  return base + href
}

export async function inlineAssets(
  html: string,
  basePath: string,
  fetchImpl: FetchImpl
): Promise<string> {
  // Inline <script src="...">
  const scriptRegex = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/gi
  const scriptMatches = [...html.matchAll(scriptRegex)]
  for (const match of scriptMatches) {
    const src = match[1]
    const url = resolveUrl(src, basePath)
    try {
      const resp = await fetchImpl(url)
      const code = await resp.text()
      html = html.replace(match[0], `<script>${code}</script>`)
    } catch {
      // Leave original tag if fetch fails
    }
  }

  // Inline <link rel="stylesheet" href="...">
  const linkCssRegex =
    /<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*\/?>/gi
  const cssMatches = [...html.matchAll(linkCssRegex)]
  for (const match of cssMatches) {
    const href = match[1]
    const url = resolveUrl(href, basePath)
    try {
      const resp = await fetchImpl(url)
      const css = await resp.text()
      html = html.replace(match[0], `<style>${css}</style>`)
    } catch {
      // Leave original tag
    }
  }

  // Inline <img src="..."> (skip data: URIs)
  const imgRegex = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*/gi
  const imgMatches = [...html.matchAll(imgRegex)]
  for (const match of imgMatches) {
    const src = match[1]
    if (src.startsWith("data:")) continue
    const url = resolveUrl(src, basePath)
    try {
      const resp = await fetchImpl(url)
      const contentType = resp.headers.get("content-type") || "image/png"
      const buffer = await resp.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))
      html = html.replace(src, `data:${contentType};base64,${base64}`)
    } catch {
      // Leave original src
    }
  }

  // Inline <link rel="icon" href="...">
  const iconRegex =
    /<link\b[^>]*\brel=["']icon["'][^>]*\bhref=["']([^"']+)["'][^>]*\/?>/gi
  const iconMatches = [...html.matchAll(iconRegex)]
  for (const match of iconMatches) {
    const href = match[1]
    if (href.startsWith("data:")) continue
    const url = resolveUrl(href, basePath)
    try {
      const resp = await fetchImpl(url)
      const contentType = resp.headers.get("content-type") || "image/svg+xml"
      const buffer = await resp.arrayBuffer()
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))
      html = html.replace(href, `data:${contentType};base64,${base64}`)
    } catch {
      // Leave original
    }
  }

  return html
}

export async function createAdminBlobUrl(
  fetchImpl: FetchImpl,
  nonce: string,
  basePath: string = "/admin/"
): Promise<string> {
  const resp = await fetchImpl(basePath)
  if (!resp.ok) {
    throw new Error(`Failed to fetch Control UI: ${resp.status} ${resp.statusText}`)
  }
  let html = await resp.text()

  html = await inlineAssets(html, basePath, fetchImpl)

  const bootstrapScript = `<script>${generateIframeBootstrapScript(nonce)}</script>`
  if (html.includes("</head>")) {
    html = html.replace("</head>", bootstrapScript + "</head>")
  } else {
    html = bootstrapScript + html
  }

  const blob = new Blob([html], { type: "text/html" })
  return URL.createObjectURL(blob)
}
