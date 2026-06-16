import { describe, expect, it } from "vitest"
import { generateIframeBootstrapScript } from "@/lib/atls-iframe/iframe-scripts"

describe("iframe-scripts", () => {
  it("generates a valid JavaScript string", () => {
    const script = generateIframeBootstrapScript("test-nonce-123")
    expect(typeof script).toBe("string")
    expect(script.length).toBeGreaterThan(100)
    expect(() => new Function(script)).not.toThrow()
  })

  it("includes the nonce in the script", () => {
    const script = generateIframeBootstrapScript("my-secret-nonce")
    expect(script).toContain("my-secret-nonce")
  })

  it("overrides window.fetch", () => {
    const script = generateIframeBootstrapScript("nonce")
    expect(script).toContain("window.fetch")
  })

  it("overrides window.WebSocket", () => {
    const script = generateIframeBootstrapScript("nonce")
    expect(script).toContain("window.WebSocket")
  })

  it("sets up MessageChannel listener", () => {
    const script = generateIframeBootstrapScript("nonce")
    expect(script).toContain("addEventListener")
    expect(script).toContain("message")
  })
})
