import { describe, expect, it } from "vitest"

import { canAutoSendDemo, parseDemoHandoffPayload } from "@/lib/demo-handoff"

describe("demo-handoff", () => {
  describe("parseDemoHandoffPayload", () => {
    it("returns null for invalid payloads", () => {
      expect(parseDemoHandoffPayload(null)).toBeNull()
      expect(parseDemoHandoffPayload("not-json")).toBeNull()
      expect(parseDemoHandoffPayload(JSON.stringify({ exampleId: "unknown" }))).toBeNull()
      expect(parseDemoHandoffPayload(JSON.stringify({ autoSend: true }))).toBeNull()
    })

    it("returns normalized payload for valid input", () => {
      expect(
        parseDemoHandoffPayload(JSON.stringify({ exampleId: "market-study", autoSend: true }))
      ).toEqual({
        exampleId: "market-study",
        autoSend: true,
      })
    })
  })

  describe("canAutoSendDemo", () => {
    const baseReadiness = {
      pendingDemoSend: true,
      secureChannelReady: true,
      providerConfigured: true,
      guestRestricted: false,
      isSending: false,
    }

    it("returns true when every gate is satisfied", () => {
      expect(canAutoSendDemo(baseReadiness)).toBe(true)
    })

    it("returns false when any gate blocks auto-send", () => {
      expect(canAutoSendDemo({ ...baseReadiness, pendingDemoSend: false })).toBe(false)
      expect(canAutoSendDemo({ ...baseReadiness, secureChannelReady: false })).toBe(false)
      expect(canAutoSendDemo({ ...baseReadiness, providerConfigured: false })).toBe(false)
      expect(canAutoSendDemo({ ...baseReadiness, guestRestricted: true })).toBe(false)
      expect(canAutoSendDemo({ ...baseReadiness, isSending: true })).toBe(false)
    })
  })
})
