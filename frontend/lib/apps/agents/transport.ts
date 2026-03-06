import { createAtlasClient, type AtlasPolicy } from "@/lib/atlas-client"
import type { CvmManifest } from "./types"

export type CvmTransport = {
  mode: "atlas_required" | "local_dev_non_attested"
  channelBindingSatisfied: boolean
  transportBindingHex: string
  fetch: (input: string | URL | RequestInfo, init?: RequestInit) => Promise<Response>
}

/**
 * Serialize requests through a single HTTP/1.1 connection.
 * AtlsHttp uses HTTP/1.1 keep-alive over one WebSocket — concurrent requests
 * on the same connection cause a WASM panic. This queue ensures at most one
 * in-flight request at a time.
 */
function createSerializedFetch(
  inner: (input: string | URL | RequestInfo, init?: RequestInit) => Promise<Response>,
): (input: string | URL | RequestInfo, init?: RequestInit) => Promise<Response> {
  let pending: Promise<unknown> = Promise.resolve()

  return (input, init) => {
    const next = pending.then(
      () => inner(input, init),
      () => inner(input, init),
    )
    pending = next.then(() => undefined, () => undefined)
    return next
  }
}

const SESSION_TOKEN_PATTERN = /^([a-f0-9]{32})(?:\.([a-f0-9]{64}))?$/i
const TRANSPORT_BINDING_BODY_PATHS = new Set([
  "/owner/auth/verify",
  "/vault/lock",
  "/vault/store",
  "/vault/retrieve",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function normalizePath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) {
    return "/"
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const asUrl = new URL(trimmed)
    return `${asUrl.pathname}${asUrl.search}`
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`
}

function targetHostFromBaseUrl(baseUrl: string): { serverName: string; targetHost: string } {
  const parsed = new URL(baseUrl)
  const serverName = parsed.hostname
  const defaultPort = parsed.protocol === "https:" ? "443" : "80"
  const targetHost = `${parsed.hostname}:${parsed.port || defaultPort}`
  return { serverName, targetHost }
}

function generateTransportBindingHex(): string {
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new Error("Web Crypto getRandomValues is required to initialize CVM transport binding.")
  }

  const bytes = new Uint8Array(32)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function maybeInjectTransportBindingBody(
  path: string,
  method: string,
  body: RequestInit["body"],
  transportBindingHex: string,
): RequestInit["body"] {
  if (method !== "POST" || !TRANSPORT_BINDING_BODY_PATHS.has(path) || typeof body !== "string") {
    return body
  }

  try {
    const parsed = JSON.parse(body) as unknown
    if (!isRecord(parsed)) {
      return body
    }

    if (typeof parsed.transport_binding !== "string" || parsed.transport_binding.trim().length === 0) {
      parsed.transport_binding = transportBindingHex
    }
    return JSON.stringify(parsed)
  } catch {
    return body
  }
}

function rewriteBearerSessionToken(
  headers: Headers,
  transportBindingHex: string,
) {
  const existing = headers.get("Authorization") ?? headers.get("authorization")
  if (!existing) return

  const bearerMatch = /^\s*Bearer\s+(.+)\s*$/i.exec(existing)
  if (!bearerMatch) return

  const token = bearerMatch[1]!.trim()
  const tokenMatch = SESSION_TOKEN_PATTERN.exec(token)
  if (!tokenMatch) return

  const sessionId = tokenMatch[1]!.toLowerCase()
  headers.set("Authorization", `Bearer ${sessionId}.${transportBindingHex}`)
}

function withTransportBinding(path: string, init: RequestInit | undefined, transportBindingHex: string): RequestInit {
  const method = (init?.method ?? "GET").toUpperCase()
  const headers = new Headers(init?.headers)
  rewriteBearerSessionToken(headers, transportBindingHex)

  return {
    ...init,
    method,
    headers,
    body: maybeInjectTransportBindingBody(path, method, init?.body, transportBindingHex),
  }
}

async function createAtlasTransport(manifest: CvmManifest): Promise<CvmTransport> {
  if (manifest.connectionPolicy.mode !== "atlas_required") {
    throw new Error("Atlas transport requires manifest connectionPolicy.mode=atlas_required.")
  }

  const { atlasProxyUrl, atlasPolicy } = manifest.connectionPolicy

  if (!atlasProxyUrl) {
    throw new Error("Atlas proxy URL is missing from manifest connectionPolicy.")
  }
  if (!isRecord(atlasPolicy)) {
    throw new Error("Atlas policy is missing or invalid in manifest connectionPolicy.")
  }
  if (atlasPolicy.type !== "dstack_tdx") {
    throw new Error('Atlas policy type must be "dstack_tdx".')
  }
  if (!manifest.baseUrl.startsWith("https://")) {
    throw new Error("Atlas mode requires an https:// CVM base URL.")
  }

  const { serverName, targetHost } = targetHostFromBaseUrl(manifest.baseUrl)
  const transportBindingHex = generateTransportBindingHex()

  // If app_compose is stored as a raw JSON string (to preserve key ordering through
  // Supabase JSONB which reorders keys), parse it back to an object for Atlas WASM.
  const resolvedPolicy = { ...atlasPolicy } as Record<string, unknown>
  if (typeof resolvedPolicy.app_compose === "string") {
    try {
      resolvedPolicy.app_compose = JSON.parse(resolvedPolicy.app_compose as string)
    } catch {
      // leave as-is if parsing fails
    }
  }

  const atlsFetch = await createAtlasClient({
    proxyUrl: atlasProxyUrl,
    targetHost,
    serverName,
    policy: resolvedPolicy as AtlasPolicy,
  })

  // Establish and validate the attested channel before subsequent CVM calls.
  await atlsFetch("/owner/status", { method: "GET", cache: "no-store" })

  const serializedFetch = createSerializedFetch((input, init) => {
    const normalizedPath = normalizePath(String(input))
    return atlsFetch(normalizedPath, withTransportBinding(normalizedPath, init, transportBindingHex))
  })

  return {
    mode: "atlas_required",
    channelBindingSatisfied: true,
    transportBindingHex,
    fetch: serializedFetch,
  }
}

function createLocalDevTransport(_manifest: CvmManifest): CvmTransport {
  const transportBindingHex = generateTransportBindingHex()
  return {
    mode: "local_dev_non_attested",
    channelBindingSatisfied: false,
    transportBindingHex,
    fetch: (input, init) => {
      const normalizedPath = normalizePath(String(input))
      const boundInit = withTransportBinding(normalizedPath, init, transportBindingHex)
      const proxyUrl = `/api/cvm/proxy?path=${encodeURIComponent(normalizedPath)}`
      return fetch(proxyUrl, boundInit)
    },
  }
}

export async function createCvmTransport(manifest: CvmManifest): Promise<CvmTransport> {
  if (manifest.connectionPolicy.mode === "atlas_required") {
    return createAtlasTransport(manifest)
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("local_dev_non_attested transport mode is not allowed in production.")
  }

  return createLocalDevTransport(manifest)
}
