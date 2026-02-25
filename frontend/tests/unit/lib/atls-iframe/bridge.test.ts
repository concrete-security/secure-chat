import { describe, expect, it, vi, beforeEach, type Mock } from "vitest"
import { AtlsBridge, type AtlsFetchFn } from "@/lib/atls-iframe/bridge"

describe("AtlsBridge", () => {
  let mockFetch: Mock<AtlsFetchFn>
  let mockPort: { postMessage: ReturnType<typeof vi.fn>; onmessage: null | ((e: any) => void) }

  beforeEach(() => {
    mockFetch = vi.fn<AtlsFetchFn>()
    mockPort = { postMessage: vi.fn(), onmessage: null }
  })

  it("handles a fetch request and responds via port", async () => {
    mockFetch.mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
      })
    )
    const bridge = new AtlsBridge({
      atlsFetch: mockFetch,
      nonce: "test-nonce",
    })
    bridge.attachPort(mockPort as unknown as MessagePort)

    const handler = mockPort.onmessage!
    await handler({
      data: {
        type: "fetch-request",
        id: "req_1",
        nonce: "test-nonce",
        url: "/admin/api/models",
        method: "GET",
        headers: {},
        body: null,
      },
    })

    await new Promise((r) => setTimeout(r, 10))

    expect(mockFetch).toHaveBeenCalledWith("/admin/api/models", expect.objectContaining({ method: "GET" }))
    expect(mockPort.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "fetch-response",
        id: "req_1",
        status: 200,
      })
    )
  })

  it("rejects messages with wrong nonce", async () => {
    const bridge = new AtlsBridge({
      atlsFetch: mockFetch,
      nonce: "correct-nonce",
    })
    bridge.attachPort(mockPort as unknown as MessagePort)

    const handler = mockPort.onmessage!
    await handler({
      data: {
        type: "fetch-request",
        id: "req_1",
        nonce: "wrong-nonce",
        url: "/admin/",
        method: "GET",
        headers: {},
        body: null,
      },
    })

    await new Promise((r) => setTimeout(r, 10))
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("handles fetch errors gracefully", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"))
    const bridge = new AtlsBridge({
      atlsFetch: mockFetch,
      nonce: "test-nonce",
    })
    bridge.attachPort(mockPort as unknown as MessagePort)

    const handler = mockPort.onmessage!
    await handler({
      data: {
        type: "fetch-request",
        id: "req_1",
        nonce: "test-nonce",
        url: "/fail",
        method: "GET",
        headers: {},
        body: null,
      },
    })

    await new Promise((r) => setTimeout(r, 10))
    expect(mockPort.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "fetch-response",
        id: "req_1",
        status: 502,
      })
    )
  })

  it("can be destroyed cleanly", () => {
    const bridge = new AtlsBridge({
      atlsFetch: mockFetch,
      nonce: "nonce",
    })
    bridge.attachPort(mockPort as unknown as MessagePort)
    expect(() => bridge.destroy()).not.toThrow()
  })
})
