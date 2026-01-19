/**
 * RA-TLS Client Module
 *
 * Provides a typed wrapper around the ratls-wasm package for use in Next.js.
 * Handles WASM initialization with lazy loading and client-side only execution.
 */

export type RatlsAttestationResult = {
  trusted: boolean
  teeType: string
  tcbStatus: string
}

/** Verification policy for RA-TLS connections */
export type RatlsPolicy = {
  type: "dstack_tdx"
  /** Expected bootchain measurements (optional if disable_runtime_verification is true) */
  expected_bootchain?: {
    mrtd?: string
    rtmr0?: string
    rtmr1?: string
    rtmr2?: string
  }
  /** Expected OS image hash (optional if disable_runtime_verification is true) */
  os_image_hash?: string
  /** App compose configuration (optional if disable_runtime_verification is true) */
  app_compose?: {
    docker_compose_file?: string
    allowed_envs?: string[]
  }
  /** Allowed TCB status values */
  allowed_tcb_status?: string[]
  /** DEVELOPMENT ONLY: Skip bootchain/app_compose/os_image verification */
  disable_runtime_verification?: boolean
}

/** Default development policy - ONLY USE FOR DEVELOPMENT/TESTING */
export const DEV_POLICY: RatlsPolicy = {
  type: "dstack_tdx",
  disable_runtime_verification: true,
  allowed_tcb_status: ["UpToDate", "SWHardeningNeeded", "OutOfDate"]
}

export type RatlsClientConfig = {
  proxyUrl: string
  targetHost: string
  /** Verification policy (required) */
  policy: RatlsPolicy
  serverName?: string
  defaultHeaders?: Record<string, string>
}

type RatlsFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response & { attestation: RatlsAttestationResult }>

type CreateRatlsFetchFn = (options: {
  proxyUrl: string
  targetHost: string
  policy: RatlsPolicy
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
    const mod = await import("./ratls-wasm/ratls-fetch.js")
    return mod.createRatlsFetch as CreateRatlsFetchFn
  })()

  return wasmInitPromise
}

/**
 * Create an RA-TLS enabled fetch client.
 *
 * @param config - Configuration for the RA-TLS connection (including policy)
 * @param onAttestation - Optional callback invoked when attestation is received (only on new connections)
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
    policy: config.policy,
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
