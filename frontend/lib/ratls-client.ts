/**
 * RA-TLS Client Module
 *
 * Provides a typed wrapper around the ratls-wasm package for use in Next.js.
 * Handles WASM initialization with lazy loading and client-side only execution.
 *
 * TODO: Update import path when ratls-wasm is published to npm
 * Current: local path for development
 * Future: import from "@anthropic/ratls-wasm" or similar
 */

export type RatlsAttestationResult = {
  trusted: boolean
  teeType: string
  tcbStatus: string
}

export type RatlsClientConfig = {
  proxyUrl: string
  targetHost: string
  serverName?: string
  defaultHeaders?: Record<string, string>
}

type RatlsFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response & { attestation: RatlsAttestationResult }>

type CreateRatlsFetchFn = (options: {
  proxyUrl: string
  targetHost: string
  serverName?: string
  defaultHeaders?: Record<string, string>
  onAttestation?: (attestation: RatlsAttestationResult) => void | Promise<void>
}) => RatlsFetch

// Singleton WASM initialization
let wasmInitPromise: Promise<CreateRatlsFetchFn> | null = null

async function loadWasmModule(): Promise<CreateRatlsFetchFn> {
  if (typeof window === "undefined") {
    throw new Error("RA-TLS WASM can only be used in browser environment")
  }

  if (wasmInitPromise) {
    return wasmInitPromise
  }

  wasmInitPromise = (async () => {
    // Dynamic import to prevent SSR issues
    // Path will change when package is published to npm
    const mod = await import("../ratls-wasm/ratls-fetch.js")
    // The module re-exports init from ratls_wasm.js, and init is the default export there
    // The createRatlsFetch function handles WASM initialization internally
    return mod.createRatlsFetch as CreateRatlsFetchFn
  })()

  return wasmInitPromise
}

/**
 * Create an RA-TLS enabled fetch client.
 *
 * @param config - Configuration for the RA-TLS connection
 * @param onAttestation - Optional callback invoked when attestation is received
 * @returns A fetch-compatible function that performs RA-TLS handshake
 */
export async function createRatlsClient(
  config: RatlsClientConfig,
  onAttestation?: (attestation: RatlsAttestationResult) => void | Promise<void>
): Promise<RatlsFetch> {
  const createRatlsFetch = await loadWasmModule()

  return createRatlsFetch({
    proxyUrl: config.proxyUrl,
    targetHost: config.targetHost,
    serverName: config.serverName,
    defaultHeaders: config.defaultHeaders,
    onAttestation,
  })
}

// Environment configuration
const defaultProxyUrl = process.env.NEXT_PUBLIC_RATLS_PROXY_URL ?? ""

/**
 * Get the configured RA-TLS proxy URL from environment variables.
 * Returns null if not configured.
 */
export function getRatlsProxyUrl(): string | null {
  const value = defaultProxyUrl.trim()
  return value.length > 0 ? value : null
}

/**
 * Derive the target host from a base URL.
 * Extracts the host (hostname:port) from a full URL.
 *
 * @param baseUrl - The provider base URL (e.g., "https://vllm.example.com:443")
 * @returns The host portion (e.g., "vllm.example.com:443" or "vllm.example.com")
 */
export function deriveTargetHost(baseUrl: string): string {
  try {
    const url = new URL(baseUrl)
    // Include port if specified and not default for the protocol
    if (url.port) {
      return `${url.hostname}:${url.port}`
    }
    // For https without explicit port, add :443
    if (url.protocol === "https:") {
      return `${url.hostname}:443`
    }
    return url.hostname
  } catch {
    // If URL parsing fails, return as-is
    return baseUrl
  }
}

/**
 * Check if RA-TLS is configured and available.
 */
export function isRatlsConfigured(): boolean {
  return getRatlsProxyUrl() !== null
}
