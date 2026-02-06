import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { atlsHttpConnectMock } = vi.hoisted(() => ({
  atlsHttpConnectMock: vi.fn(),
}))

vi.mock("@concrete-security/atlas-wasm", () => ({
  default: vi.fn(async () => ({})),
  AtlsHttp: {
    connect: atlsHttpConnectMock,
  },
}))

describe("atlas-client attestation error handling", () => {
  beforeEach(() => {
    vi.resetModules()
    atlsHttpConnectMock.mockReset()
    vi.stubGlobal("window", {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("wraps malformed /tdx_quote errors from warmupAtlasConnection", async () => {
    atlsHttpConnectMock.mockRejectedValue(
      new Error(
        "quote verification failed: Failed to parse /tdx_quote response: missing field `quote` at line 1 column 240"
      )
    )

    const { warmupAtlasConnection } = await import("@/lib/atlas-client")

    await expect(
      warmupAtlasConnection({
        proxyUrl: "wss://proxy.example.com",
        targetHost: "tee.example.com:443",
        policy: { type: "dstack_tdx" },
      })
    ).rejects.toThrow(
      "Failed to establish aTLS connection: quote verification failed: Failed to parse /tdx_quote response: missing field `quote`"
    )

    expect(atlsHttpConnectMock).toHaveBeenCalledTimes(1)
  })

  it("categorizes malformed /tdx_quote payload errors as attestation mismatch", async () => {
    const { categorizeAtlsError } = await import("@/lib/atlas-client")

    const categorized = categorizeAtlsError(
      new Error(
        "Failed to establish aTLS connection: quote verification failed: Failed to parse /tdx_quote response: missing field `quote` at line 1 column 240"
      )
    )

    expect(categorized.category).toBe("attestation_mismatch")
    expect(categorized.message).toBe("Malformed attestation quote response")
    expect(categorized.hint).toContain("invalid quote payload")
  })

  it("still categorizes network transport failures as proxy connection errors", async () => {
    const { categorizeAtlsError } = await import("@/lib/atlas-client")

    const categorized = categorizeAtlsError(new Error("connect ECONNREFUSED 127.0.0.1:8080"))

    expect(categorized.category).toBe("proxy_connection")
    expect(categorized.message).toBe("Failed to connect to secure proxy")
  })
})
