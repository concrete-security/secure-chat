import type { CvmManifest } from "./types"

export type CvmTransport = {
  mode: "atlas_required" | "local_dev_non_attested"
  channelBindingSatisfied: boolean
  fetch: (input: string | URL | RequestInfo, init?: RequestInit) => Promise<Response>
}

type AtlasModule = Record<string, unknown>
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

async function loadAtlasBrowserModule(): Promise<AtlasModule> {
  const configuredModule = process.env.NEXT_PUBLIC_ATLAS_BROWSER_MODULE?.trim()
  const moduleName = configuredModule && configuredModule.length > 0 ? configuredModule : "@concrete-security/atlas-wasm"

  try {
    const dynamicImport = new Function("moduleName", "return import(moduleName)") as (
      moduleName: string,
    ) => Promise<unknown>
    return (await dynamicImport(moduleName)) as AtlasModule
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to load Atlas browser module "${moduleName}": ${reason}`)
  }
}

async function initAtlasModule(mod: AtlasModule): Promise<void> {
  const initFn =
    (typeof mod.init === "function" ? (mod.init as () => Promise<unknown> | unknown) : null) ??
    (typeof mod.default === "function" ? (mod.default as () => Promise<unknown> | unknown) : null)

  if (!initFn) return
  await Promise.resolve(initFn())
}

function createAtlasFetch(mod: AtlasModule, options: {
  proxyUrl: string
  targetHost: string
  serverName: string
  policy: Record<string, unknown>
}): (path: string, init?: RequestInit) => Promise<Response> {
  const factory =
    (typeof mod.createAtlsFetch === "function"
      ? (mod.createAtlsFetch as (params: Record<string, unknown>) => (path: string, init?: RequestInit) => Promise<Response>)
      : null) ??
    (typeof mod.createRatlsFetch === "function"
      ? (mod.createRatlsFetch as (params: Record<string, unknown>) => (path: string, init?: RequestInit) => Promise<Response>)
      : null)

  if (!factory) {
    throw new Error("Atlas module does not export createAtlsFetch/createRatlsFetch.")
  }

  return factory({
    proxyUrl: options.proxyUrl,
    targetHost: options.targetHost,
    serverName: options.serverName,
    policy: options.policy,
  })
}

async function createAtlasTransport(manifest: CvmManifest): Promise<CvmTransport> {
  const atlasProxyUrl = manifest.connectionPolicy.atlasProxyUrl
  const atlasPolicy = manifest.connectionPolicy.atlasPolicy

  if (!atlasProxyUrl || !atlasPolicy) {
    throw new Error("Atlas configuration is missing from manifest connectionPolicy.")
  }
  if (!manifest.baseUrl.startsWith("https://")) {
    throw new Error("Atlas mode requires an https:// CVM base URL.")
  }

  const { serverName, targetHost } = targetHostFromBaseUrl(manifest.baseUrl)
  const transportBindingHex = generateTransportBindingHex()
  const atlasModule = await loadAtlasBrowserModule()
  await initAtlasModule(atlasModule)
  const atlsFetch = createAtlasFetch(atlasModule, {
    proxyUrl: atlasProxyUrl,
    targetHost,
    serverName,
    policy: atlasPolicy,
  })

  // Establish and validate the attested channel before subsequent CVM calls.
  await atlsFetch("/owner/status", { method: "GET", cache: "no-store" })

  return {
    mode: "atlas_required",
    channelBindingSatisfied: true,
    fetch: (input, init) => {
      const normalizedPath = normalizePath(String(input))
      return atlsFetch(normalizedPath, withTransportBinding(normalizedPath, init, transportBindingHex))
    },
  }
}

function createLocalDevTransport(_manifest: CvmManifest): CvmTransport {
  const transportBindingHex = generateTransportBindingHex()
  return {
    mode: "local_dev_non_attested",
    channelBindingSatisfied: false,
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
