import {
  encodeFrame,
  decodeFrame,
  OPCODE_TEXT,
  OPCODE_BINARY,
  OPCODE_CLOSE,
  OPCODE_PING,
  OPCODE_PONG,
} from "./ws-frame-codec"
import {
  buildUpgradeRequest,
  parseUpgradeResponse,
  generateWebSocketKey,
} from "./ws-upgrade"

type AtlsWs = {
  send: (data: string | ArrayBuffer) => void
  onMessage: (cb: (data: string | ArrayBuffer) => void) => void
  close: (code?: number, reason?: string) => void
}

type AtlsWebSocketConfig = {
  proxyUrl: string
  targetHost: string
  policy: Record<string, unknown>
}

async function loadAttestedStream(): Promise<any> {
  const configuredModule = process.env.NEXT_PUBLIC_ATLAS_BROWSER_MODULE?.trim()
  const moduleName = configuredModule && configuredModule.length > 0 ? configuredModule : "@concrete-security/atlas-wasm"

  const dynamicImport = new Function("moduleName", "return import(moduleName)") as (
    moduleName: string,
  ) => Promise<any>
  const mod = await dynamicImport(moduleName)
  return mod.AttestedStream
}

/**
 * Create a factory function that opens WebSocket connections over aTLS.
 * Uses AttestedStream to establish a raw byte stream through the attested TLS tunnel,
 * then performs an HTTP Upgrade handshake to switch to WebSocket protocol.
 */
export function createAtlsWebSocketFactory(
  config: AtlsWebSocketConfig
): (url: string) => Promise<AtlsWs> {
  return async (url: string): Promise<AtlsWs> => {
    const parsed = new URL(url, "https://placeholder")
    const path = parsed.pathname + parsed.search

    // Load AttestedStream from the atlas-wasm module
    const AttestedStream = await loadAttestedStream()

    // Connect via aTLS
    const wsUrl = `${config.proxyUrl}?target=${encodeURIComponent(config.targetHost)}`
    const serverName = config.targetHost.split(":")[0]
    const stream = await AttestedStream.connect(wsUrl, serverName, config.policy)

    // Send HTTP Upgrade request
    const key = generateWebSocketKey()
    const upgradeReq = buildUpgradeRequest(path, config.targetHost, key)
    await stream.send(upgradeReq)

    // Read upgrade response from stream
    const reader = stream.readable.getReader()
    let buffer = new Uint8Array(0)

    const upgradeTimeout = setTimeout(() => {
      reader.cancel()
    }, 10000)

    let upgradeResult = null
    while (!upgradeResult) {
      const { value, done } = await reader.read()
      if (done) {
        clearTimeout(upgradeTimeout)
        throw new Error("Stream closed during upgrade")
      }
      const newBuf = new Uint8Array(buffer.length + value.length)
      newBuf.set(buffer)
      newBuf.set(value, buffer.length)
      buffer = newBuf
      upgradeResult = parseUpgradeResponse(buffer)
    }
    clearTimeout(upgradeTimeout)

    if (upgradeResult.status !== 101) {
      throw new Error(`WebSocket upgrade failed: ${upgradeResult.status}`)
    }

    // Any remaining bytes after the HTTP response are WebSocket frames
    buffer = new Uint8Array(upgradeResult.remaining)

    let messageCallback: ((data: string | ArrayBuffer) => void) | null = null
    let closed = false

    // Start reading WebSocket frames
    const readLoop = async () => {
      try {
        while (!closed) {
          // Try to decode frames from buffer
          let decoded = decodeFrame(buffer)
          while (decoded) {
            buffer = buffer.slice(decoded.bytesConsumed)
            if (decoded.opcode === OPCODE_TEXT) {
              messageCallback?.(new TextDecoder().decode(decoded.payload))
            } else if (decoded.opcode === OPCODE_BINARY) {
              messageCallback?.(decoded.payload.buffer as ArrayBuffer)
            } else if (decoded.opcode === OPCODE_PING) {
              await stream.send(encodeFrame(OPCODE_PONG, decoded.payload, true))
            } else if (decoded.opcode === OPCODE_CLOSE) {
              closed = true
              return
            }
            decoded = decodeFrame(buffer)
          }

          // Read more data
          const { value, done } = await reader.read()
          if (done) {
            closed = true
            return
          }
          const newBuf = new Uint8Array(buffer.length + value.length)
          newBuf.set(buffer)
          newBuf.set(value, buffer.length)
          buffer = newBuf
        }
      } catch {
        closed = true
      }
    }

    // Start reading in background
    readLoop()

    return {
      send(data: string | ArrayBuffer) {
        if (closed) return
        const payload =
          typeof data === "string"
            ? new TextEncoder().encode(data)
            : new Uint8Array(data)
        const opcode = typeof data === "string" ? OPCODE_TEXT : OPCODE_BINARY
        const frame = encodeFrame(opcode, payload, true) // client frames must be masked
        stream.send(frame)
      },
      onMessage(cb) {
        messageCallback = cb
      },
      close(code = 1000, reason = "") {
        if (closed) return
        closed = true
        const reasonBytes = new TextEncoder().encode(reason)
        const payload = new Uint8Array(2 + reasonBytes.length)
        payload[0] = (code >> 8) & 0xff
        payload[1] = code & 0xff
        payload.set(reasonBytes, 2)
        stream.send(encodeFrame(OPCODE_CLOSE, payload, true))
        stream.closeWrite()
      },
    }
  }
}
