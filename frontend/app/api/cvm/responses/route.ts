import { NextResponse } from "next/server"
import https from "node:https"
import { CrossOriginRequestError, UnsupportedContentTypeError, assertJsonRequest, ensureSameOrigin } from "@/lib/security/origin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ProxyMessage = {
  role: "user" | "assistant" | "system"
  content: string
}

type ProxyRequest = {
  baseUrl?: string
  accessToken?: string
  model?: string | null
  responsesPath?: string | null
  messages?: ProxyMessage[]
}

function isDevResponsesProxyEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.CVM_ALLOW_DEV_RESPONSES_PROXY !== "false"
}

function isCvmTlsPassthrough(baseUrl: string) {
  return /-443s\.dstack-pha-[^.]+\.phala\.network/.test(baseUrl)
}

function isAllowedBaseUrl(baseUrl: string) {
  return (
    baseUrl.startsWith("https://localhost") ||
    baseUrl.startsWith("https://127.0.0.1") ||
    baseUrl.startsWith("http://localhost") ||
    baseUrl.startsWith("http://127.0.0.1") ||
    isCvmTlsPassthrough(baseUrl)
  )
}

function shouldUseInsecureLocalTls(baseUrl: string) {
  if (isCvmTlsPassthrough(baseUrl)) return true
  if (process.env.NODE_ENV === "production") return false
  if (process.env.PRIVATE_AGENT_PROXY_TLS_INSECURE !== "true") return false
  return baseUrl.startsWith("https://localhost") || baseUrl.startsWith("https://127.0.0.1")
}

function normalizeUrl(baseUrl: string, path: string) {
  const trimmedBase = baseUrl.replace(/\/+$/, "")
  return `${trimmedBase}${path.startsWith("/") ? path : `/${path}`}`
}

function getProxyOrigin() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (appUrl && appUrl.length > 0) {
    return appUrl.replace(/\/+$/, "")
  }

  return "http://localhost:3000"
}

function buildInput(messages: ProxyMessage[]) {
  return messages.map((message) => ({
    type: "message",
    role: message.role,
    content: [{ type: "input_text", text: message.content }],
  }))
}

async function fetchWithInsecureLocalTls(
  upstreamUrl: string,
  init: {
    method: string
    headers: Record<string, string>
    body: string
  },
): Promise<Response> {
  const requestUrl = new URL(upstreamUrl)

  return new Promise<Response>((resolve, reject) => {
    const request = https.request(
      {
        protocol: requestUrl.protocol,
        hostname: requestUrl.hostname,
        port: requestUrl.port || 443,
        path: `${requestUrl.pathname}${requestUrl.search}`,
        method: init.method,
        headers: init.headers,
        rejectUnauthorized: false,
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        response.on("end", () => {
          const headers = new Headers()
          for (const [key, value] of Object.entries(response.headers)) {
            if (typeof value === "string") {
              headers.set(key, value)
            } else if (Array.isArray(value)) {
              headers.set(key, value.join(", "))
            }
          }
          resolve(
            new Response(Buffer.concat(chunks), {
              status: response.statusCode ?? 502,
              headers,
            }),
          )
        })
        response.on("error", reject)
      },
    )

    request.on("error", reject)
    request.write(init.body)
    request.end()
  })
}

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request)
    assertJsonRequest(request)
  } catch (error) {
    if (error instanceof CrossOriginRequestError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof UnsupportedContentTypeError) {
      return NextResponse.json({ error: error.message }, { status: 415 })
    }
    throw error
  }

  if (!isDevResponsesProxyEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  let payload: ProxyRequest
  try {
    payload = (await request.json()) as ProxyRequest
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 })
  }

  const baseUrl = payload.baseUrl?.trim() ?? ""
  const accessToken = payload.accessToken?.trim() || ""
  const responsesPath = payload.responsesPath?.trim() || "/v1/responses"
  const messages = Array.isArray(payload.messages) ? payload.messages : []

  if (!baseUrl || messages.length === 0) {
    return NextResponse.json({ error: "Missing baseUrl or messages" }, { status: 400 })
  }
  if (!isAllowedBaseUrl(baseUrl)) {
    return NextResponse.json({ error: "Unsupported baseUrl for dev responses proxy" }, { status: 400 })
  }

  const upstreamUrl = normalizeUrl(baseUrl, responsesPath)
  const body: Record<string, unknown> = {
    stream: true,
    input: buildInput(messages),
  }

  if (typeof payload.model === "string" && payload.model.trim().length > 0) {
    body.model = payload.model.trim()
  }

  let upstream: Response
  try {
    const upstreamHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      Origin: getProxyOrigin(),
    }
    const upstreamBody = JSON.stringify(body)

    if (shouldUseInsecureLocalTls(baseUrl)) {
      upstream = await fetchWithInsecureLocalTls(upstreamUrl, {
        method: "POST",
        headers: upstreamHeaders,
        body: upstreamBody,
      })
    } else {
      upstream = await fetch(upstreamUrl, {
        method: "POST",
        headers: upstreamHeaders,
        body: upstreamBody,
        cache: "no-store",
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reach OpenClaw upstream"
    return NextResponse.json({ error: message }, { status: 502 })
  }

  if (!upstream.ok) {
    const errorText = await upstream.text().catch(() => "")
    return new Response(errorText || `OpenClaw upstream failed (${upstream.status})`, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    })
  }

  if (!upstream.body) {
    return NextResponse.json({ error: "OpenClaw stream body unavailable" }, { status: 502 })
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    },
  })
}
