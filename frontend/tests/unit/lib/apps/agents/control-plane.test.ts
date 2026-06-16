import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { UserCvmAssignment } from "@/lib/apps/agents/types"

function buildAssignment(overrides: Partial<UserCvmAssignment> = {}): UserCvmAssignment {
  return {
    userId: "user-1",
    cvmId: "cvm-1",
    baseUrl: "https://cvm-1.example.com",
    state: "ready",
    attestationPolicy: {
      allowedTeeTypes: ["tdx"],
      allowedMeasurementPrefixes: [],
      allowedTcbStatuses: ["uptodate"],
      requireEkmChannelBinding: true,
      maxQuoteAgeSeconds: 300,
    },
    atlasProxyUrl: "wss://proxy.example.com",
    atlasPolicy: { type: "dstack_tdx", expected_bootchain: { mrtd: "abc" } },
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

describe("control-plane atlas connection policy", () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalForcedMode = process.env.CVM_CONNECTION_MODE

  beforeEach(() => {
    vi.resetModules()
    process.env.NODE_ENV = "test"
    delete process.env.CVM_CONNECTION_MODE
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    if (originalForcedMode === undefined) {
      delete process.env.CVM_CONNECTION_MODE
    } else {
      process.env.CVM_CONNECTION_MODE = originalForcedMode
    }
  })

  it("uses per-CVM atlas policy and proxy when present", async () => {
    const { buildConnectionPolicyForAssignment } = await import("@/lib/apps/agents/control-plane")

    const connectionPolicy = buildConnectionPolicyForAssignment(buildAssignment())
    expect(connectionPolicy).toEqual({
      mode: "atlas_required",
      atlasProxyUrl: "wss://proxy.example.com",
      atlasPolicy: { type: "dstack_tdx", expected_bootchain: { mrtd: "abc" } },
    })
  })

  it("falls back to local dev mode when atlas settings are absent in non-production", async () => {
    const { buildConnectionPolicyForAssignment } = await import("@/lib/apps/agents/control-plane")

    const connectionPolicy = buildConnectionPolicyForAssignment(
      buildAssignment({ atlasProxyUrl: null, atlasPolicy: null })
    )
    expect(connectionPolicy).toEqual({
      mode: "local_dev_non_attested",
      atlasProxyUrl: null,
      atlasPolicy: null,
    })
  })

  it("fails closed in production when atlas proxy is missing", async () => {
    process.env.NODE_ENV = "production"
    const { buildConnectionPolicyForAssignment } = await import("@/lib/apps/agents/control-plane")

    expect(() =>
      buildConnectionPolicyForAssignment(buildAssignment({ atlasProxyUrl: null }))
    ).toThrow("missing atlas_proxy_url")
  })

  it("fails closed in production when atlas policy is missing", async () => {
    process.env.NODE_ENV = "production"
    const { buildConnectionPolicyForAssignment } = await import("@/lib/apps/agents/control-plane")

    expect(() =>
      buildConnectionPolicyForAssignment(buildAssignment({ atlasPolicy: null }))
    ).toThrow("missing atlas_policy")
  })

  it("validates atlas_policy shape and type from CVM records", async () => {
    const { parseAtlasPolicyFromCvmInstance } = await import("@/lib/apps/agents/control-plane")

    expect(parseAtlasPolicyFromCvmInstance({ type: "dstack_tdx" }, "cvm-1")).toEqual({ type: "dstack_tdx" })
    expect(() => parseAtlasPolicyFromCvmInstance(["bad"], "cvm-1")).toThrow("invalid atlas_policy")
    expect(() => parseAtlasPolicyFromCvmInstance({ type: "other" }, "cvm-1")).toThrow("invalid atlas_policy.type")
  })
})
