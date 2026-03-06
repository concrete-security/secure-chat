import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CvmManifest } from "@/lib/apps/agents/types"

const { createAtlasClientMock } = vi.hoisted(() => ({
  createAtlasClientMock: vi.fn(),
}))

vi.mock("@/lib/atlas-client", () => ({
  createAtlasClient: createAtlasClientMock,
}))

function buildManifest(overrides: Partial<CvmManifest> = {}): CvmManifest {
  return {
    cvmId: "cvm-1",
    baseUrl: "https://cvm-1.example.com",
    expiresAt: null,
    attestationPolicy: {
      allowedTeeTypes: ["tdx"],
      allowedMeasurementPrefixes: [],
      allowedTcbStatuses: ["uptodate"],
      requireEkmChannelBinding: true,
      maxQuoteAgeSeconds: 300,
    },
    connectionPolicy: {
      mode: "atlas_required",
      atlasProxyUrl: "wss://proxy.example.com",
      atlasPolicy: { type: "dstack_tdx", expected_bootchain: { mrtd: "abc" } },
    },
    openclaw: {
      responsesPath: "/v1/responses",
      toolsPath: "/tools/invoke",
    },
    modelRoutingPolicy: {
      mode: "remote",
      allowRemoteProviders: true,
      allowedRemoteProviders: [],
      defaultModel: "model",
      remoteProvider: "provider",
      remoteBaseUrl: "https://provider.example.com",
    },
    ...overrides,
  }
}

describe("agents transport", () => {
  beforeEach(() => {
    vi.resetModules()
    createAtlasClientMock.mockReset()
    vi.stubGlobal("crypto", {
      getRandomValues(bytes: Uint8Array) {
        for (let i = 0; i < bytes.length; i += 1) {
          bytes[i] = i % 255
        }
        return bytes
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("uses manifest atlas proxy and policy in atlas mode", async () => {
    const atlsFetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    createAtlasClientMock.mockResolvedValue(atlsFetchMock)

    const { createCvmTransport } = await import("@/lib/apps/agents/transport")
    const manifest = buildManifest()
    const transport = await createCvmTransport(manifest)

    expect(transport.mode).toBe("atlas_required")
    expect(createAtlasClientMock).toHaveBeenCalledWith({
      proxyUrl: "wss://proxy.example.com",
      targetHost: "cvm-1.example.com:443",
      serverName: "cvm-1.example.com",
      policy: { type: "dstack_tdx", expected_bootchain: { mrtd: "abc" } },
    })
    expect(atlsFetchMock).toHaveBeenCalledWith("/owner/status", { method: "GET", cache: "no-store" })
  })

  it("throws when atlas policy is missing in atlas_required mode", async () => {
    const { createCvmTransport } = await import("@/lib/apps/agents/transport")
    const manifest = buildManifest({
      connectionPolicy: {
        mode: "atlas_required",
        atlasProxyUrl: "wss://proxy.example.com",
        atlasPolicy: null as unknown as Record<string, unknown>,
      },
    })

    await expect(createCvmTransport(manifest)).rejects.toThrow("Atlas policy is missing or invalid")
  })

  it("throws when atlas policy type is invalid", async () => {
    const { createCvmTransport } = await import("@/lib/apps/agents/transport")
    const manifest = buildManifest({
      connectionPolicy: {
        mode: "atlas_required",
        atlasProxyUrl: "wss://proxy.example.com",
        atlasPolicy: { type: "other" },
      },
    })

    await expect(createCvmTransport(manifest)).rejects.toThrow('Atlas policy type must be "dstack_tdx"')
  })
})
