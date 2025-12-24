import { describe, expect, it, beforeEach, afterEach, vi } from "vitest"

// Mock the WASM module before importing the client
vi.mock("@/ratls-wasm/ratls-fetch.js", () => ({
  createRatlsFetch: vi.fn(() => vi.fn()),
}))

describe("ratls-client helper functions", () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe("deriveTargetHost", () => {
    it("extracts hostname and explicit port from URL", async () => {
      const { deriveTargetHost } = await import("@/lib/ratls-client")
      expect(deriveTargetHost("https://example.com:8443")).toBe("example.com:8443")
    })

    it("adds :443 for https URLs without explicit port", async () => {
      const { deriveTargetHost } = await import("@/lib/ratls-client")
      expect(deriveTargetHost("https://example.com")).toBe("example.com:443")
      expect(deriveTargetHost("https://example.com/path")).toBe("example.com:443")
    })

    it("returns hostname without port for http URLs", async () => {
      const { deriveTargetHost } = await import("@/lib/ratls-client")
      expect(deriveTargetHost("http://example.com")).toBe("example.com")
    })

    it("preserves custom ports", async () => {
      const { deriveTargetHost } = await import("@/lib/ratls-client")
      expect(deriveTargetHost("https://vllm.example.com:9443")).toBe("vllm.example.com:9443")
      expect(deriveTargetHost("http://localhost:3000")).toBe("localhost:3000")
    })

    it("returns input as-is for invalid URLs", async () => {
      const { deriveTargetHost } = await import("@/lib/ratls-client")
      expect(deriveTargetHost("not-a-url")).toBe("not-a-url")
      expect(deriveTargetHost("")).toBe("")
    })
  })

  describe("getRatlsProxyUrl", () => {
    it("returns null when env var is not set", async () => {
      delete process.env.NEXT_PUBLIC_RATLS_PROXY_URL
      const { getRatlsProxyUrl } = await import("@/lib/ratls-client")
      expect(getRatlsProxyUrl()).toBeNull()
    })

    it("returns null for empty string", async () => {
      process.env.NEXT_PUBLIC_RATLS_PROXY_URL = ""
      const { getRatlsProxyUrl } = await import("@/lib/ratls-client")
      expect(getRatlsProxyUrl()).toBeNull()
    })

    it("returns null for whitespace-only string", async () => {
      process.env.NEXT_PUBLIC_RATLS_PROXY_URL = "   "
      const { getRatlsProxyUrl } = await import("@/lib/ratls-client")
      expect(getRatlsProxyUrl()).toBeNull()
    })

    it("returns trimmed URL when set", async () => {
      process.env.NEXT_PUBLIC_RATLS_PROXY_URL = " wss://proxy.example.com "
      const { getRatlsProxyUrl } = await import("@/lib/ratls-client")
      expect(getRatlsProxyUrl()).toBe("wss://proxy.example.com")
    })
  })

  describe("isRatlsConfigured", () => {
    it("returns false when proxy URL is not configured", async () => {
      delete process.env.NEXT_PUBLIC_RATLS_PROXY_URL
      const { isRatlsConfigured } = await import("@/lib/ratls-client")
      expect(isRatlsConfigured()).toBe(false)
    })

    it("returns true when proxy URL is configured", async () => {
      process.env.NEXT_PUBLIC_RATLS_PROXY_URL = "wss://proxy.example.com"
      const { isRatlsConfigured } = await import("@/lib/ratls-client")
      expect(isRatlsConfigured()).toBe(true)
    })
  })

  describe("parseAppComposeServices", () => {
    it("returns empty array when app_compose is not set", async () => {
      const { parseAppComposeServices } = await import("@/lib/ratls-client")
      const result = parseAppComposeServices({ type: "dstack_tdx" })
      expect(result).toEqual([])
    })

    it("returns empty array when docker_compose_file is empty", async () => {
      const { parseAppComposeServices } = await import("@/lib/ratls-client")
      const result = parseAppComposeServices({ type: "dstack_tdx", app_compose: {} })
      expect(result).toEqual([])
    })

    it("parses services from docker-compose YAML", async () => {
      const { parseAppComposeServices } = await import("@/lib/ratls-client")
      const dockerCompose = `
services:
  auth-service:
    image: ghcr.io/concrete-security/auth-service@sha256:29a10d75abc123
  vllm:
    image: vllm/vllm-openai:v0.13.0
`
      const result = parseAppComposeServices({
        type: "dstack_tdx",
        app_compose: { docker_compose_file: dockerCompose }
      })

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        name: "auth-service",
        image: "ghcr.io/concrete-security/auth-service@sha256:29a10d75abc123",
        imageWithoutDigest: "ghcr.io/concrete-security/auth-service",
        digest: "sha256:29a10d75abc123",
        version: undefined
      })
      expect(result[1]).toEqual({
        name: "vllm",
        image: "vllm/vllm-openai:v0.13.0",
        imageWithoutDigest: "vllm/vllm-openai:v0.13.0",
        digest: undefined,
        version: "v0.13.0"
      })
    })

    it("handles invalid YAML gracefully", async () => {
      const { parseAppComposeServices } = await import("@/lib/ratls-client")
      const result = parseAppComposeServices({
        type: "dstack_tdx",
        app_compose: { docker_compose_file: "not: valid: yaml: [" }
      })
      expect(result).toEqual([])
    })
  })

  describe("getImageUrl", () => {
    it("generates GHCR versions URL for ghcr.io images", async () => {
      const { getImageUrl } = await import("@/lib/ratls-client")
      expect(getImageUrl("ghcr.io/concrete-security/auth-service@sha256:abc123"))
        .toBe("https://github.com/concrete-security/auth-service/pkgs/container/auth-service/versions")
      expect(getImageUrl("ghcr.io/concrete-security/cert-manager:latest"))
        .toBe("https://github.com/concrete-security/cert-manager/pkgs/container/cert-manager/versions")
    })

    it("generates Docker Hub tags URL for org/image format", async () => {
      const { getImageUrl } = await import("@/lib/ratls-client")
      expect(getImageUrl("vllm/vllm-openai:v0.13.0"))
        .toBe("https://hub.docker.com/r/vllm/vllm-openai/tags")
    })

    it("generates Docker Hub tags URL for official images", async () => {
      const { getImageUrl } = await import("@/lib/ratls-client")
      expect(getImageUrl("nginx:latest")).toBe("https://hub.docker.com/_/nginx/tags")
      expect(getImageUrl("postgres")).toBe("https://hub.docker.com/_/postgres/tags")
    })
  })
})
