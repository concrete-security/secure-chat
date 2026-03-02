import { NextRequest } from "next/server"
import https from "node:https"
import { generateIframeBootstrapScript } from "@/lib/atls-iframe/iframe-scripts"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function getBaseUrl() {
  return (process.env.PRIVATE_AGENT_DEFAULT_BASE_URL?.trim() || "https://localhost").replace(/\/+$/, "")
}

function needsInsecureTls(baseUrl: string) {
  if (/-443s\.dstack-pha-[^.]+\.phala\.network/.test(baseUrl)) return true
  if (process.env.NODE_ENV !== "production" && process.env.PRIVATE_AGENT_PROXY_TLS_INSECURE === "true") {
    return baseUrl.startsWith("https://localhost") || baseUrl.startsWith("https://127.0.0.1")
  }
  return false
}

async function fetchFromCvm(
  url: string,
  options: { method: string; headers: Record<string, string>; body?: string },
): Promise<Response> {
  const baseUrl = getBaseUrl()

  if (needsInsecureTls(baseUrl)) {
    const parsed = new URL(url)
    return new Promise<Response>((resolve, reject) => {
      const req = https.request(
        {
          protocol: parsed.protocol,
          hostname: parsed.hostname,
          port: parsed.port || 443,
          path: `${parsed.pathname}${parsed.search}`,
          method: options.method,
          headers: options.headers,
          rejectUnauthorized: false,
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
          res.on("end", () => {
            const headers = new Headers()
            for (const [key, value] of Object.entries(res.headers)) {
              if (typeof value === "string") headers.set(key, value)
              else if (Array.isArray(value)) headers.set(key, value.join(", "))
            }
            resolve(new Response(Buffer.concat(chunks), { status: res.statusCode ?? 502, headers }))
          })
          res.on("error", reject)
        },
      )
      req.on("error", reject)
      if (options.body) req.write(options.body)
      req.end()
    })
  }

  return fetch(url, { method: options.method, headers: options.headers, body: options.body, cache: "no-store" })
}

function injectBootstrapScript(html: string, nonce: string): string {
  const script = `<script>${generateIframeBootstrapScript(nonce)}</script>`
  // Inject <base> so relative asset paths (./assets/...) resolve against /api/cvm/admin/
  // even when Next.js strips the trailing slash from the iframe URL.
  const base = `<base href="/api/cvm/admin/">`
  // Rewrite absolute /admin/ asset paths to relative so they route through this proxy
  html = html.replace(/(["'=])\/(admin\/)/g, "$1./")
  if (html.includes("<head>")) {
    return html.replace("<head>", `<head>${base}${script}`)
  }
  return base + script + html
}

async function proxyAdmin(request: NextRequest, pathSegments: string[]): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 })
  }

  const baseUrl = getBaseUrl()
  const cvmPath = "/admin/" + pathSegments.join("/")
  const upstreamUrl = `${baseUrl}${cvmPath}`

  // Read vault session and transport binding from cookies
  // (the auth-proxy expects the format: {32-hex-session}.{64-hex-binding})
  // The transport binding MUST match the one used by the client-side transport
  // layer — the vault registers the first binding it sees and rejects mismatches.
  const sessionId = request.cookies.get("cvm-vault-session")?.value
  const transportBinding = request.cookies.get("cvm-transport-binding")?.value
  const headers: Record<string, string> = {}
  if (sessionId && transportBinding) {
    headers["Authorization"] = `Bearer ${sessionId}.${transportBinding}`
    console.log("[admin-proxy]", { cvmPath, token: `Bearer ${sessionId.slice(0, 8)}...${transportBinding.slice(-8)}` })
  } else {
    console.log("[admin-proxy]", { cvmPath, sessionId: sessionId ? "present" : "MISSING", transportBinding: transportBinding ? "present" : "MISSING" })
  }
  // Forward accept header
  const accept = request.headers.get("accept")
  if (accept) headers["Accept"] = accept

  try {
    const upstream = await fetchFromCvm(upstreamUrl, { method: "GET", headers })
    if (!upstream.ok) {
      const body = await upstream.text()
      console.log("[admin-proxy] upstream error", { status: upstream.status, body: body.slice(0, 200), upstreamUrl })
      return new Response(body, { status: upstream.status, headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" } })
    }
    const contentType = upstream.headers.get("content-type") || "application/octet-stream"
    const isHtmlPage = contentType.includes("text/html") && (pathSegments.length === 0 || (pathSegments.length === 1 && pathSegments[0] === ""))

    if (isHtmlPage) {
      // Inject bootstrap script into the admin HTML
      const nonce = request.nextUrl.searchParams.get("nonce") || ""
      let html = await upstream.text()
      if (nonce) {
        html = injectBootstrapScript(html, nonce)
      }
      return new Response(html, {
        status: upstream.status,
        headers: {
          "Content-Type": "text/html",
          "Cache-Control": "no-store",
        },
      })
    }

    // For all other assets (JS, CSS, images), pass through
    const body = await upstream.arrayBuffer()
    return new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "CVM admin proxy failed"
    return new Response(JSON.stringify({ error: message }), { status: 502, headers: { "Content-Type": "application/json" } })
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params
  return proxyAdmin(request, path ?? [])
}
