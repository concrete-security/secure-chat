import { describe, expect, it } from "vitest"
import { createAtlsWebSocketFactory } from "@/lib/atls-iframe/websocket"

describe("websocket", () => {
  it("exports a factory function", () => {
    expect(typeof createAtlsWebSocketFactory).toBe("function")
  })

  it("factory returns a function", () => {
    const factory = createAtlsWebSocketFactory({
      proxyUrl: "ws://proxy:9000",
      targetHost: "host:443",
      policy: {},
    })
    expect(typeof factory).toBe("function")
  })
})
