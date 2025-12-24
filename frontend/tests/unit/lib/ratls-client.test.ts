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
})
