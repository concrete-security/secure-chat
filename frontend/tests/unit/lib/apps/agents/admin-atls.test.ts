import { describe, expect, it } from "vitest"

import type { CvmManifest } from "@/lib/apps/agents/types"
import { getAdminAtlsWebSocketConfig } from "@/lib/apps/agents/admin-atls"

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
      atlasPolicy: { type: "dstack_tdx" },
    },
    openclaw: { responsesPath: "/v1/responses" },
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

describe("getAdminAtlsWebSocketConfig", () => {
  it("returns manifest-driven proxy/policy config in atlas mode", () => {
    const config = getAdminAtlsWebSocketConfig(buildManifest())
    expect(config).toEqual({
      proxyUrl: "wss://proxy.example.com",
      targetHost: "cvm-1.example.com:443",
      policy: { type: "dstack_tdx" },
    })
  })

  it("returns null for local dev non-attested mode", () => {
    const config = getAdminAtlsWebSocketConfig(
      buildManifest({
        connectionPolicy: {
          mode: "local_dev_non_attested",
          atlasProxyUrl: null,
          atlasPolicy: null,
        },
      })
    )
    expect(config).toBeNull()
  })

  it("returns null when atlas policy is malformed", () => {
    const config = getAdminAtlsWebSocketConfig(
      buildManifest({
        connectionPolicy: {
          mode: "atlas_required",
          atlasProxyUrl: "wss://proxy.example.com",
          atlasPolicy: null as unknown as Record<string, unknown>,
        },
      })
    )
    expect(config).toBeNull()
  })
})
