/**
 * RA-TLS Client Module
 *
 * Provides a typed wrapper around the ratls-wasm package for use in Next.js.
 * Handles WASM initialization with lazy loading and client-side only execution.
 *
 * The ratls-wasm library handles all attestation verification and policy validation.
 * This wrapper provides:
 * - WASM integrity verification (essential - WASM can't verify itself)
 * - Convenience helpers for building policies from environment variables
 * - TypeScript types
 */

import YAML from "yaml"

export type RatlsAttestationResult = {
  trusted: boolean
  teeType: string
  tcbStatus: string
}

/** Verification policy for RA-TLS connections */
export type RatlsPolicy = {
  type: "dstack_tdx"
  /** Expected bootchain measurements */
  expected_bootchain?: {
    mrtd?: string
    rtmr0?: string
    rtmr1?: string
    rtmr2?: string
  }
  /** Expected OS image hash */
  os_image_hash?: string
  /** App compose configuration */
  app_compose?: {
    docker_compose_file?: string
    allowed_envs?: string[]
  }
  /** Allowed TCB status values (defaults to ["UpToDate"] in the library) */
  allowed_tcb_status?: string[]
  /** Skip runtime verification - for development only */
  disable_runtime_verification?: boolean
}

/**
 * Development policy - for local development/testing only.
 * The library requires explicit opt-in for relaxed verification.
 */
export const DEV_POLICY: RatlsPolicy = {
  type: "dstack_tdx",
  disable_runtime_verification: true,
  allowed_tcb_status: ["UpToDate", "SWHardeningNeeded", "OutOfDate"],
}

/**
 * Create a policy from environment variables.
 *
 * Environment variables:
 * - NEXT_PUBLIC_RATLS_EXPECTED_MRTD
 * - NEXT_PUBLIC_RATLS_EXPECTED_RTMR0
 * - NEXT_PUBLIC_RATLS_EXPECTED_RTMR1
 * - NEXT_PUBLIC_RATLS_EXPECTED_RTMR2
 * - NEXT_PUBLIC_RATLS_EXPECTED_OS_HASH
 * - NEXT_PUBLIC_RATLS_APP_COMPOSE (base64 encoded JSON string - preferred)
 * - NEXT_PUBLIC_RATLS_DOCKER_COMPOSE (base64 encoded - legacy, use APP_COMPOSE instead)
 * - NEXT_PUBLIC_RATLS_ALLOWED_ENVS (comma-separated - legacy, use APP_COMPOSE instead)
 * - NEXT_PUBLIC_RATLS_ALLOWED_TCB_STATUS (comma-separated, defaults to "UpToDate")
 */
export function createPolicyFromEnv(): RatlsPolicy {
  const mrtd = process.env.NEXT_PUBLIC_RATLS_EXPECTED_MRTD?.trim()
  const rtmr0 = process.env.NEXT_PUBLIC_RATLS_EXPECTED_RTMR0?.trim()
  const rtmr1 = process.env.NEXT_PUBLIC_RATLS_EXPECTED_RTMR1?.trim()
  const rtmr2 = process.env.NEXT_PUBLIC_RATLS_EXPECTED_RTMR2?.trim()
  const osHash = process.env.NEXT_PUBLIC_RATLS_EXPECTED_OS_HASH?.trim()
  const appComposeRaw = process.env.NEXT_PUBLIC_RATLS_APP_COMPOSE?.trim()
  const dockerCompose = process.env.NEXT_PUBLIC_RATLS_DOCKER_COMPOSE?.trim()
  const allowedEnvsRaw = process.env.NEXT_PUBLIC_RATLS_ALLOWED_ENVS?.trim()
  const allowedTcbRaw = process.env.NEXT_PUBLIC_RATLS_ALLOWED_TCB_STATUS?.trim()

  const policy: RatlsPolicy = {
    type: "dstack_tdx",
  }

  // Add bootchain measurements if configured
  if (mrtd || rtmr0 || rtmr1 || rtmr2) {
    policy.expected_bootchain = {}
    if (mrtd) policy.expected_bootchain.mrtd = mrtd
    if (rtmr0) policy.expected_bootchain.rtmr0 = rtmr0
    if (rtmr1) policy.expected_bootchain.rtmr1 = rtmr1
    if (rtmr2) policy.expected_bootchain.rtmr2 = rtmr2
  }

  // Add OS image hash if configured
  if (osHash) {
    policy.os_image_hash = osHash
  }

  // Add app compose - prefer NEXT_PUBLIC_RATLS_APP_COMPOSE (full JSON)
  if (appComposeRaw) {
    try {
      const decoded = atob(appComposeRaw)
      policy.app_compose = JSON.parse(decoded)
    } catch {
      // Try as plain JSON string
      try {
        policy.app_compose = JSON.parse(appComposeRaw)
      } catch {
        console.error("[RA-TLS] Failed to parse NEXT_PUBLIC_RATLS_APP_COMPOSE")
      }
    }
  } else if (dockerCompose || allowedEnvsRaw) {
    // Legacy: separate env vars for docker_compose_file and allowed_envs
    policy.app_compose = {}
    if (dockerCompose) {
      try {
        policy.app_compose.docker_compose_file = atob(dockerCompose)
      } catch {
        policy.app_compose.docker_compose_file = dockerCompose
      }
    }
    if (allowedEnvsRaw) {
      policy.app_compose.allowed_envs = allowedEnvsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    }
  }

  // Add TCB status if configured
  if (allowedTcbRaw) {
    policy.allowed_tcb_status = allowedTcbRaw.split(",").map((s) => s.trim()).filter(Boolean)
  }

  return policy
}

/**
 * Get the appropriate policy for the current environment.
 * - If measurements are configured via env vars, uses those
 * - Otherwise in development, uses DEV_POLICY
 * - In production without measurements, returns default policy (library will require measurements)
 */
export function getPolicy(): RatlsPolicy {
  const hasMeasurements = Boolean(
    process.env.NEXT_PUBLIC_RATLS_EXPECTED_MRTD ||
    process.env.NEXT_PUBLIC_RATLS_EXPECTED_RTMR0 ||
    process.env.NEXT_PUBLIC_RATLS_EXPECTED_OS_HASH
  )

  if (hasMeasurements) {
    return createPolicyFromEnv()
  }

  // Development without measurements - use dev policy
  if (process.env.NODE_ENV !== "production") {
    if (typeof window !== "undefined") {
      console.warn(
        "[RA-TLS] Using development policy without measurement verification. " +
        "Configure NEXT_PUBLIC_RATLS_EXPECTED_* for production."
      )
    }
    return DEV_POLICY
  }

  // Production without measurements - return minimal policy, let library enforce requirements
  return { type: "dstack_tdx" }
}

export type RatlsClientConfig = {
  proxyUrl: string
  targetHost: string
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

/**
 * Expected SHA-384 hash of the WASM binary.
 * Update when WASM is rebuilt: shasum -a 384 lib/ratls-wasm/ratls_wasm_bg.wasm | awk '{print $1}'
 */
const EXPECTED_WASM_HASH = "6cacb2d6cadb1eefc22f622857961fa6082c0d62011a8d4c472d87bff9f9acccfd46db6c66f5f6f5fec5a15bf57759c1"

const SKIP_WASM_INTEGRITY_CHECK = process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_SKIP_WASM_INTEGRITY_CHECK === "true"

function arrayBufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")
}

async function verifyWasmIntegrity(wasmUrl: string): Promise<void> {
  if (SKIP_WASM_INTEGRITY_CHECK) {
    console.warn("[RA-TLS] Skipping WASM integrity check (development mode)")
    return
  }

  // crypto.subtle requires a secure context (HTTPS or localhost)
  // In development on HTTP, skip the check with a warning
  if (!crypto?.subtle) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[RA-TLS] crypto.subtle not available (requires HTTPS). Skipping WASM integrity check in development.")
      return
    }
    throw new Error("WASM integrity verification requires a secure context (HTTPS)")
  }

  const response = await fetch(wasmUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch WASM: ${response.status}`)
  }
  const wasmBytes = await response.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest("SHA-384", wasmBytes)
  const actualHash = arrayBufferToHex(hashBuffer)

  if (actualHash !== EXPECTED_WASM_HASH) {
    throw new Error("WASM integrity check failed")
  }
}

type WarmupConnectionFn = (options: {
  proxyUrl: string
  targetHost: string
  policy: RatlsPolicy
  serverName?: string
  onAttestation?: (attestation: RatlsAttestationResult) => void | Promise<void>
}) => Promise<RatlsAttestationResult>

let wasmInitPromise: Promise<{ createRatlsFetch: CreateRatlsFetchFn; warmupConnection: WarmupConnectionFn }> | null = null
let wasmIntegrityVerified = false

async function loadWasmModule(): Promise<{ createRatlsFetch: CreateRatlsFetchFn; warmupConnection: WarmupConnectionFn }> {
  if (typeof window === "undefined") {
    throw new Error("RA-TLS WASM can only be used in browser environment")
  }

  if (wasmInitPromise) {
    return wasmInitPromise
  }

  wasmInitPromise = (async () => {
    // Verify WASM integrity before loading
    if (!wasmIntegrityVerified) {
      const wasmPath = new URL("./ratls-wasm/ratls_wasm_bg.wasm", import.meta.url).href
      await verifyWasmIntegrity(wasmPath)
      wasmIntegrityVerified = true
    }

    const mod = await import("./ratls-wasm/ratls-fetch.js")
    return {
      createRatlsFetch: mod.createRatlsFetch as CreateRatlsFetchFn,
      warmupConnection: mod.warmupConnection as WarmupConnectionFn,
    }
  })()

  return wasmInitPromise
}

/**
 * Create an RA-TLS enabled fetch client.
 * Policy validation is handled by the WASM library.
 */
export async function createRatlsClient(
  config: RatlsClientConfig,
  onAttestation?: (attestation: RatlsAttestationResult) => void | Promise<void>
): Promise<RatlsFetch> {
  const { createRatlsFetch } = await loadWasmModule()

  return createRatlsFetch({
    proxyUrl: config.proxyUrl,
    targetHost: config.targetHost,
    policy: config.policy,
    serverName: config.serverName,
    defaultHeaders: config.defaultHeaders,
    onAttestation,
  })
}

/**
 * Pre-establish the RA-TLS connection on page load.
 * This performs the TLS handshake and attestation verification immediately,
 * so users don't have to wait when they send their first message.
 *
 * The connection is cached and reused by subsequent createRatlsClient calls.
 */
export async function warmupRatlsConnection(
  config: RatlsClientConfig,
  onAttestation?: (attestation: RatlsAttestationResult) => void | Promise<void>
): Promise<RatlsAttestationResult> {
  const { warmupConnection } = await loadWasmModule()

  return warmupConnection({
    proxyUrl: config.proxyUrl,
    targetHost: config.targetHost,
    policy: config.policy,
    serverName: config.serverName,
    onAttestation,
  })
}

const defaultProxyUrl = process.env.NEXT_PUBLIC_RATLS_PROXY_URL ?? ""

export function getRatlsProxyUrl(): string | null {
  const value = defaultProxyUrl.trim()
  return value.length > 0 ? value : null
}

export function deriveTargetHost(baseUrl: string): string {
  try {
    const url = new URL(baseUrl)
    if (url.port) {
      return `${url.hostname}:${url.port}`
    }
    if (url.protocol === "https:") {
      return `${url.hostname}:443`
    }
    return url.hostname
  } catch {
    return baseUrl
  }
}

export function isRatlsConfigured(): boolean {
  return getRatlsProxyUrl() !== null
}

/** Parsed service from docker-compose */
export type ParsedService = {
  name: string
  image: string
  imageWithoutDigest: string
  digest?: string
  version?: string
}

type DockerComposeFile = {
  services?: Record<string, { image?: string }>
}

/**
 * Parse the app_compose docker_compose_file to extract service information.
 */
export function parseAppComposeServices(policy: RatlsPolicy): ParsedService[] {
  if (!policy.app_compose?.docker_compose_file) return []

  try {
    const parsed = YAML.parse(policy.app_compose.docker_compose_file) as DockerComposeFile
    if (!parsed?.services) return []

    const services: ParsedService[] = []
    for (const [name, config] of Object.entries(parsed.services)) {
      if (!config?.image) continue

      const image = config.image
      let imageWithoutDigest = image
      let digest: string | undefined
      let version: string | undefined

      // Parse digest (sha256:xxx)
      const digestMatch = image.match(/@(sha256:[a-f0-9]+)$/)
      if (digestMatch) {
        digest = digestMatch[1]
        imageWithoutDigest = image.replace(/@sha256:[a-f0-9]+$/, "")
      }

      // Parse version tag (e.g., :v0.13.0 or :latest)
      const tagMatch = imageWithoutDigest.match(/:([^:]+)$/)
      if (tagMatch) {
        version = tagMatch[1]
      }

      services.push({ name, image, imageWithoutDigest, digest, version })
    }

    return services
  } catch {
    console.error("[RA-TLS] Failed to parse docker-compose file")
    return []
  }
}

/**
 * Generate a URL to view the container image on GHCR or Docker Hub.
 * When a digest is provided, links to the versions page where users can search for the exact hash.
 */
export function getImageUrl(image: string, digest?: string): string | null {
  // Remove digest if present in image string
  const imageWithoutDigest = image.replace(/@sha256:[a-f0-9]+$/, "")

  // ghcr.io/org/package:tag -> https://github.com/org/package/pkgs/container/package/versions
  const ghcrMatch = imageWithoutDigest.match(/^ghcr\.io\/([^/]+)\/([^:]+)/)
  if (ghcrMatch) {
    const [, org, pkg] = ghcrMatch
    // Link to versions page where users can search for the specific digest
    return `https://github.com/${org}/${pkg}/pkgs/container/${pkg}/versions`
  }

  // Docker Hub: org/image:tag or just image:tag
  // vllm/vllm-openai -> https://hub.docker.com/r/vllm/vllm-openai/tags
  // nginx -> https://hub.docker.com/_/nginx/tags
  const dockerMatch = imageWithoutDigest.match(/^([^/]+\/[^:]+|[^/:]+)/)
  if (dockerMatch) {
    const imageName = dockerMatch[1]
    // Link to tags page where users can verify the digest
    if (imageName.includes("/")) {
      return `https://hub.docker.com/r/${imageName}/tags`
    }
    return `https://hub.docker.com/_/${imageName}/tags`
  }

  return null
}

/** GitHub repository URL for the project */
export const GITHUB_REPO_URL = "https://github.com/concrete-security/umbra"

/** URL for the docker-compose.yml in the repository */
export const DOCKER_COMPOSE_URL = `${GITHUB_REPO_URL}/blob/main/cvm/docker-compose.yml`
