import type {
  FetchRequest,
  WsOpenRequest,
  WsFrameToParent,
  WsClose,
  IframeToParentMessage,
} from "./bridge-protocol"

export type AtlsFetchFn = (
  input: string | URL | RequestInfo,
  init?: RequestInit
) => Promise<Response>

type AtlsBridgeConfig = {
  atlsFetch: AtlsFetchFn
  nonce: string
  createAtlsWebSocket?: (url: string) => Promise<{
    send: (data: string | ArrayBuffer) => void
    onMessage: (cb: (data: string | ArrayBuffer) => void) => void
    close: (code?: number, reason?: string) => void
  }>
}

export class AtlsBridge {
  private config: AtlsBridgeConfig
  private port: MessagePort | null = null
  private activeWebSockets = new Map<
    string,
    { close: (code?: number, reason?: string) => void }
  >()

  constructor(config: AtlsBridgeConfig) {
    this.config = config
  }

  attachPort(port: MessagePort) {
    this.port = port
    this.port.onmessage = (event) => this.handleMessage(event.data)
  }

  private async handleMessage(msg: IframeToParentMessage) {
    if (!msg || !msg.type) return

    switch (msg.type) {
      case "fetch-request":
        await this.handleFetch(msg)
        break
      case "ws-open":
        await this.handleWsOpen(msg)
        break
      case "ws-frame-to-parent":
        this.handleWsFrame(msg)
        break
      case "ws-close":
        this.handleWsClose(msg)
        break
    }
  }

  private async handleFetch(msg: FetchRequest) {
    if (msg.nonce !== this.config.nonce) return

    try {
      const resp = await this.config.atlsFetch(msg.url, {
        method: msg.method,
        headers: msg.headers,
        body: msg.body || undefined,
      })
      const body = await resp.text()
      const headers: Record<string, string> = {}
      resp.headers.forEach((value, key) => {
        headers[key] = value
      })
      this.port?.postMessage({
        type: "fetch-response",
        id: msg.id,
        status: resp.status,
        statusText: resp.statusText,
        headers,
        body,
      })
    } catch (err) {
      this.port?.postMessage({
        type: "fetch-response",
        id: msg.id,
        status: 502,
        statusText: "Bridge Error",
        headers: {},
        body: err instanceof Error ? err.message : "Unknown error",
      })
    }
  }

  private async handleWsOpen(msg: WsOpenRequest) {
    if (msg.nonce !== this.config.nonce) return

    if (!this.config.createAtlsWebSocket) {
      this.port?.postMessage({
        type: "ws-open-result",
        id: msg.id,
        success: false,
        error: "WebSocket over aTLS not configured",
      })
      return
    }

    try {
      const ws = await this.config.createAtlsWebSocket(msg.url)
      this.activeWebSockets.set(msg.id, ws)

      ws.onMessage((data) => {
        this.port?.postMessage({
          type: "ws-frame-to-iframe",
          id: msg.id,
          data,
        })
      })

      this.port?.postMessage({
        type: "ws-open-result",
        id: msg.id,
        success: true,
      })
    } catch (err) {
      this.port?.postMessage({
        type: "ws-open-result",
        id: msg.id,
        success: false,
        error: err instanceof Error ? err.message : "Connection failed",
      })
    }
  }

  private handleWsFrame(msg: WsFrameToParent) {
    const ws = this.activeWebSockets.get(msg.id)
    if (ws) {
      (ws as any).send(msg.data)
    }
  }

  private handleWsClose(msg: WsClose) {
    const ws = this.activeWebSockets.get(msg.id)
    if (ws) {
      ws.close(msg.code, msg.reason)
      this.activeWebSockets.delete(msg.id)
    }
  }

  destroy() {
    for (const [, ws] of this.activeWebSockets) {
      ws.close(1001, "Bridge destroyed")
    }
    this.activeWebSockets.clear()
    if (this.port) {
      this.port.onmessage = null
      this.port = null
    }
  }
}
