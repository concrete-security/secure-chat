import { NextResponse } from "next/server"
import https from "node:https"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function isProxyEnabled() {
  return process.env.NODE_ENV !== "production"
}

function getBaseUrl() {
  return (process.env.PRIVATE_AGENT_DEFAULT_BASE_URL?.trim() || "https://localhost").replace(/\/+$/, "")
}

function isCvmTlsPassthrough(baseUrl: string) {
  // dstack -443s endpoints use TLS passthrough to the CVM's cert-manager,
  // which serves a self-signed cert. Trust comes from TDX attestation, not the CA chain.
  return /-443s\.dstack-pha-[^.]+\.phala\.network/.test(baseUrl)
}

function shouldUseInsecureTls(baseUrl: string) {
  if (process.env.NODE_ENV === "production") return false
  if (process.env.PRIVATE_AGENT_PROXY_TLS_INSECURE !== "true") return false
  return baseUrl.startsWith("https://localhost") || baseUrl.startsWith("https://127.0.0.1")
}

async function fetchInsecure(url: string, init: { method: string; headers: Record<string, string>; body?: string }): Promise<Response> {
  const parsed = new URL(url)
  return new Promise<Response>((resolve, reject) => {
    const req = https.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method: init.method,
        headers: init.headers,
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
    if (init.body) req.write(init.body)
    req.end()
  })
}

async function proxyRequest(request: Request): Promise<Response> {
  if (!isProxyEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const url = new URL(request.url)
  const cvmPath = url.searchParams.get("path")
  if (!cvmPath || !cvmPath.startsWith("/")) {
    return NextResponse.json({ error: "Missing or invalid ?path= parameter" }, { status: 400 })
  }

  const baseUrl = getBaseUrl()
  const upstreamUrl = `${baseUrl}${cvmPath}`

  const headers: Record<string, string> = { "Content-Type": request.headers.get("content-type") ?? "application/json" }
  const authHeader = request.headers.get("authorization")
  if (authHeader) {
    headers["Authorization"] = authHeader
  }

  let body: string | undefined
  if (request.method === "POST" || request.method === "PUT" || request.method === "PATCH") {
    body = await request.text()
  }

  try {
    let upstream: Response
    if (isCvmTlsPassthrough(baseUrl) || shouldUseInsecureTls(baseUrl)) {
      upstream = await fetchInsecure(upstreamUrl, { method: request.method, headers, body })
    } else {
      upstream = await fetch(upstreamUrl, { method: request.method, headers, body, cache: "no-store" })
    }

    const responseBody = await upstream.text()
    return new Response(responseBody, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "CVM proxy request failed"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export async function GET(request: Request) {
  return proxyRequest(request)
}

export async function POST(request: Request) {
  return proxyRequest(request)
}
