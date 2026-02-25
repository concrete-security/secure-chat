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

  it("returns websocket configuration errors when websocket factory is missing", async () => {
    const bridge = new AtlsBridge({
      atlsFetch: mockFetch,
      nonce: "test-nonce",
    })
    bridge.attachPort(mockPort as unknown as MessagePort)

    const handler = mockPort.onmessage!
    await handler({
      data: {
        type: "ws-open",
        id: "ws_1",
        nonce: "test-nonce",
        url: "wss://cvm.local/admin/ws",
      },
    })

    expect(mockPort.postMessage).toHaveBeenCalledWith({
      type: "ws-open-result",
      id: "ws_1",
      success: false,
      error: "WebSocket over aTLS not configured",
    })
  })

  it("opens websocket, relays frames in both directions, and closes it", async () => {
    const wsSend = vi.fn()
    const wsClose = vi.fn()
    let onMessage: ((data: string | ArrayBuffer) => void) | null = null
    const createAtlsWebSocket = vi.fn(async () => ({
      send: wsSend,
      close: wsClose,
      onMessage(cb: (data: string | ArrayBuffer) => void) {
        onMessage = cb
      },
    }))

    const bridge = new AtlsBridge({
      atlsFetch: mockFetch,
      nonce: "test-nonce",
      createAtlsWebSocket,
    })
    bridge.attachPort(mockPort as unknown as MessagePort)

    const handler = mockPort.onmessage!
    await handler({
      data: {
        type: "ws-open",
        id: "ws_1",
        nonce: "test-nonce",
        url: "wss://cvm.local/admin/ws",
      },
    })

    expect(createAtlsWebSocket).toHaveBeenCalledWith("wss://cvm.local/admin/ws")
    expect(mockPort.postMessage).toHaveBeenCalledWith({
      type: "ws-open-result",
      id: "ws_1",
      success: true,
    })

    expect(onMessage).not.toBeNull()
    onMessage?.("server-message")

    expect(mockPort.postMessage).toHaveBeenCalledWith({
      type: "ws-frame-to-iframe",
      id: "ws_1",
      data: "server-message",
    })

    await handler({
      data: {
        type: "ws-frame-to-parent",
        id: "ws_1",
        data: "client-message",
      },
    })

    expect(wsSend).toHaveBeenCalledWith("client-message")

    await handler({
      data: {
        type: "ws-close",
        id: "ws_1",
        code: 1000,
        reason: "done",
      },
    })

    expect(wsClose).toHaveBeenCalledWith(1000, "done")

    await handler({
      data: {
        type: "ws-frame-to-parent",
        id: "ws_1",
        data: "ignored-after-close",
      },
    })

    expect(wsSend).toHaveBeenCalledTimes(1)
  })

  it("does not open websocket when nonce is invalid", async () => {
    const createAtlsWebSocket = vi.fn()
    const bridge = new AtlsBridge({
      atlsFetch: mockFetch,
      nonce: "correct-nonce",
      createAtlsWebSocket,
    })
    bridge.attachPort(mockPort as unknown as MessagePort)

    const handler = mockPort.onmessage!
    await handler({
      data: {
        type: "ws-open",
        id: "ws_1",
        nonce: "wrong-nonce",
        url: "wss://cvm.local/admin/ws",
      },
    })

    expect(createAtlsWebSocket).not.toHaveBeenCalled()
    expect(mockPort.postMessage).not.toHaveBeenCalled()
  })

  it("can be destroyed cleanly and closes active websockets", async () => {
    const wsClose = vi.fn()
    const createAtlsWebSocket = vi.fn(async () => ({
      send: vi.fn(),
      close: wsClose,
      onMessage: vi.fn(),
    }))

    const bridge = new AtlsBridge({
      atlsFetch: mockFetch,
      nonce: "nonce",
      createAtlsWebSocket,
    })
    bridge.attachPort(mockPort as unknown as MessagePort)

    const handler = mockPort.onmessage!
    await handler({
      data: {
        type: "ws-open",
        id: "ws_1",
        nonce: "nonce",
        url: "wss://cvm.local/admin/ws",
      },
    })

    bridge.destroy()

    expect(wsClose).toHaveBeenCalledWith(1001, "Bridge destroyed")
    expect(mockPort.onmessage).toBeNull()
  })
})
