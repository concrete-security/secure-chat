/**
 * aTLS Client Module
 *
 * Provides a typed wrapper around the @concrete-security/atlas-wasm package for use in Next.js.
 * Handles WASM initialization with lazy loading and client-side only execution.
 *
 * The atlas-wasm library handles all attestation verification and policy validation.
 * This wrapper provides:
 * - Convenience helpers for building policies from environment variables
 * - TypeScript types
 *
 * Package integrity is verified by npm/pnpm during installation.
 */

import YAML from "yaml"

export type AtlasAttestationResult = {
  trusted: boolean
  teeType: string
  tcbStatus: string
}

/** Verification policy for aTLS connections */
export type AtlasPolicy = {
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
export const DEV_POLICY: AtlasPolicy = {
  type: "dstack_tdx",
  disable_runtime_verification: true,
  allowed_tcb_status: ["UpToDate", "SWHardeningNeeded", "OutOfDate"],
}

/**
 * Create a policy from environment variables.
 *
 * Environment variables:
 * - NEXT_PUBLIC_ATLAS_EXPECTED_MRTD
 * - NEXT_PUBLIC_ATLAS_EXPECTED_RTMR0
 * - NEXT_PUBLIC_ATLAS_EXPECTED_RTMR1
 * - NEXT_PUBLIC_ATLAS_EXPECTED_RTMR2
 * - NEXT_PUBLIC_ATLAS_EXPECTED_OS_HASH
 * - NEXT_PUBLIC_ATLAS_APP_COMPOSE (base64 encoded JSON string - preferred)
 * - NEXT_PUBLIC_ATLAS_DOCKER_COMPOSE (base64 encoded - legacy, use APP_COMPOSE instead)
 * - NEXT_PUBLIC_ATLAS_ALLOWED_ENVS (comma-separated - legacy, use APP_COMPOSE instead)
 * - NEXT_PUBLIC_ATLAS_ALLOWED_TCB_STATUS (comma-separated, defaults to "UpToDate")
 */
export function createPolicyFromEnv(): AtlasPolicy {
  const mrtd = process.env.NEXT_PUBLIC_ATLAS_EXPECTED_MRTD?.trim()
  const rtmr0 = process.env.NEXT_PUBLIC_ATLAS_EXPECTED_RTMR0?.trim()
  const rtmr1 = process.env.NEXT_PUBLIC_ATLAS_EXPECTED_RTMR1?.trim()
  const rtmr2 = process.env.NEXT_PUBLIC_ATLAS_EXPECTED_RTMR2?.trim()
  const osHash = process.env.NEXT_PUBLIC_ATLAS_EXPECTED_OS_HASH?.trim()
  const appComposeRaw = process.env.NEXT_PUBLIC_ATLAS_APP_COMPOSE?.trim()
  const dockerCompose = process.env.NEXT_PUBLIC_ATLAS_DOCKER_COMPOSE?.trim()
  const allowedEnvsRaw = process.env.NEXT_PUBLIC_ATLAS_ALLOWED_ENVS?.trim()
  const allowedTcbRaw = process.env.NEXT_PUBLIC_ATLAS_ALLOWED_TCB_STATUS?.trim()

  const policy: AtlasPolicy = {
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

  // Add app compose - prefer NEXT_PUBLIC_ATLAS_APP_COMPOSE (full JSON)
  if (appComposeRaw) {
    try {
      const decoded = atob(appComposeRaw)
      policy.app_compose = JSON.parse(decoded)
    } catch {
      // Try as plain JSON string
      try {
        policy.app_compose = JSON.parse(appComposeRaw)
      } catch {
        console.error("[aTLS] Failed to parse NEXT_PUBLIC_ATLAS_APP_COMPOSE")
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
export function getPolicy(): AtlasPolicy {
  const hasMeasurements = Boolean(
    process.env.NEXT_PUBLIC_ATLAS_EXPECTED_MRTD ||
    process.env.NEXT_PUBLIC_ATLAS_EXPECTED_RTMR0 ||
    process.env.NEXT_PUBLIC_ATLAS_EXPECTED_OS_HASH
  )

  if (hasMeasurements) {
    return createPolicyFromEnv()
  }

  // Development without measurements - use dev policy
  if (process.env.NODE_ENV !== "production") {
    if (typeof window !== "undefined") {
      console.warn(
        "[aTLS] Using development policy without measurement verification. " +
        "Configure NEXT_PUBLIC_ATLAS_EXPECTED_* for production."
      )
    }
    return DEV_POLICY
  }

  // Production without measurements - return minimal policy, let library enforce requirements
  return { type: "dstack_tdx" }
}

export type AtlasClientConfig = {
  proxyUrl: string
  targetHost: string
  policy: AtlasPolicy
  serverName?: string
  defaultHeaders?: Record<string, string>
}

type AtlasFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response & { attestation: AtlasAttestationResult }>

type CreateAtlasFetchFn = (options: {
  proxyUrl: string
  targetHost: string
  policy: AtlasPolicy
  serverName?: string
  defaultHeaders?: Record<string, string>
  onAttestation?: (attestation: AtlasAttestationResult) => void | Promise<void>
}) => AtlasFetch

let wasmInitPromise: Promise<{ createAtlasFetch: CreateAtlasFetchFn }> | null = null

async function loadWasmModule(): Promise<{ createAtlasFetch: CreateAtlasFetchFn }> {
  if (typeof window === "undefined") {
    throw new Error("aTLS WASM can only be used in browser environment")
  }

  if (wasmInitPromise) {
    return wasmInitPromise
  }

  wasmInitPromise = (async () => {
    // Package integrity is verified by npm/pnpm during installation
    const mod = await import("@concrete-security/atlas-wasm")
    return {
      createAtlasFetch: mod.createRatlsFetch as CreateAtlasFetchFn,
    }
  })()

  return wasmInitPromise
}

/**
 * Create an aTLS enabled fetch client.
 * Policy validation is handled by the WASM library.
 */
export async function createAtlasClient(
  config: AtlasClientConfig,
  onAttestation?: (attestation: AtlasAttestationResult) => void | Promise<void>
): Promise<AtlasFetch> {
  const { createAtlasFetch } = await loadWasmModule()

  return createAtlasFetch({
    proxyUrl: config.proxyUrl,
    targetHost: config.targetHost,
    policy: config.policy,
    serverName: config.serverName,
    defaultHeaders: config.defaultHeaders,
    onAttestation,
  })
}

/**
 * Pre-establish the aTLS connection on page load.
 * This performs the TLS handshake and attestation verification immediately,
 * so users don't have to wait when they send their first message.
 *
 * The connection is cached and reused by subsequent createAtlasClient calls.
 */
export async function warmupAtlasConnection(
  config: AtlasClientConfig,
  onAttestation?: (attestation: AtlasAttestationResult) => void | Promise<void>
): Promise<AtlasAttestationResult> {
  const { createAtlasFetch } = await loadWasmModule()

  // Capture attestation result from callback
  let attestationResult: AtlasAttestationResult | null = null

  const fetch = createAtlasFetch({
    proxyUrl: config.proxyUrl,
    targetHost: config.targetHost,
    policy: config.policy,
    serverName: config.serverName,
    onAttestation: async (att) => {
      attestationResult = att
      if (onAttestation) {
        await onAttestation(att)
      }
    },
  })

  // Make a lightweight request to establish the connection
  // Use GET /health which should return a proper response with body
  try {
    const response = await fetch("/health", { method: "GET" })
    // If we got a response, attestation should have been captured
    if (attestationResult) {
      return attestationResult
    }
    // Fallback: extract attestation from response
    return (response as Response & { attestation: AtlasAttestationResult }).attestation
  } catch (error) {
    // Even if the request fails (e.g., 404), attestation should still be available
    // since it happens during TLS handshake before HTTP request
    if (attestationResult) {
      return attestationResult
    }
    // Preserve the original error message for debugging
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to establish aTLS connection: ${message}`)
  }
}

const defaultProxyUrl = process.env.NEXT_PUBLIC_ATLAS_PROXY_URL ?? ""

export function getAtlasProxyUrl(): string | null {
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

export function isAtlasConfigured(): boolean {
  return getAtlasProxyUrl() !== null
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
export function parseAppComposeServices(policy: AtlasPolicy): ParsedService[] {
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
    console.error("[aTLS] Failed to parse docker-compose file")
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
