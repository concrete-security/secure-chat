import { describe, expect, it, vi } from "vitest"
import {
  encodeFrame,
  decodeFrame,
  OPCODE_TEXT,
  OPCODE_BINARY,
  OPCODE_CLOSE,
  OPCODE_PING,
  OPCODE_PONG,
} from "@/lib/atls-iframe/ws-frame-codec"
import {
  buildUpgradeRequest,
  parseUpgradeResponse,
} from "@/lib/atls-iframe/ws-upgrade"

/**
 * Mock AttestedStream that simulates the WASM AttestedStream API.
 * Lets us feed raw bytes and capture what the WS layer sends.
 */
function createMockStream() {
  let readController: ReadableStreamDefaultController<Uint8Array> | null = null
  const sent: Uint8Array[] = []

  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      readController = controller
    },
  })

  return {
    readable,
    sent,
    async send(data: Uint8Array) {
      sent.push(new Uint8Array(data))
    },
    async closeWrite() {},
    attestation() {
      return { trusted: true }
    },
    // Test helpers
    pushBytes(data: Uint8Array) {
      readController!.enqueue(data)
    },
    closeReadable() {
      readController!.close()
    },
    errorReadable(err: Error) {
      readController!.error(err)
    },
  }
}

describe("ws-frame-codec", () => {
  it("roundtrips a text frame (unmasked server frame)", () => {
    const payload = new TextEncoder().encode("hello")
    const frame = encodeFrame(OPCODE_TEXT, payload, false)
    const decoded = decodeFrame(frame)
    expect(decoded).not.toBeNull()
    expect(decoded!.opcode).toBe(OPCODE_TEXT)
    expect(new TextDecoder().decode(decoded!.payload)).toBe("hello")
    expect(decoded!.bytesConsumed).toBe(frame.length)
  })

  it("roundtrips a masked client frame", () => {
    const payload = new TextEncoder().encode("masked")
    const frame = encodeFrame(OPCODE_TEXT, payload, true)
    const decoded = decodeFrame(frame)
    expect(decoded).not.toBeNull()
    expect(decoded!.opcode).toBe(OPCODE_TEXT)
    expect(new TextDecoder().decode(decoded!.payload)).toBe("masked")
  })

  it("returns null for incomplete frame", () => {
    const payload = new TextEncoder().encode("hello")
    const frame = encodeFrame(OPCODE_TEXT, payload, false)
    // Truncate
    expect(decodeFrame(frame.slice(0, 1))).toBeNull()
    expect(decodeFrame(frame.slice(0, 3))).toBeNull()
  })

  it("decodes a close frame with code and reason", () => {
    const reason = new TextEncoder().encode("bye")
    const closePayload = new Uint8Array(2 + reason.length)
    closePayload[0] = (1000 >> 8) & 0xff
    closePayload[1] = 1000 & 0xff
    closePayload.set(reason, 2)
    const frame = encodeFrame(OPCODE_CLOSE, closePayload, false)
    const decoded = decodeFrame(frame)
    expect(decoded).not.toBeNull()
    expect(decoded!.opcode).toBe(OPCODE_CLOSE)
    const code = (decoded!.payload[0] << 8) | decoded!.payload[1]
    expect(code).toBe(1000)
    expect(new TextDecoder().decode(decoded!.payload.slice(2))).toBe("bye")
  })

  it("decodes ping and pong frames", () => {
    const pingPayload = new TextEncoder().encode("ping-data")
    const ping = encodeFrame(OPCODE_PING, pingPayload, false)
    const decoded = decodeFrame(ping)
    expect(decoded!.opcode).toBe(OPCODE_PING)
    expect(new TextDecoder().decode(decoded!.payload)).toBe("ping-data")

    const pong = encodeFrame(OPCODE_PONG, pingPayload, false)
    const decodedPong = decodeFrame(pong)
    expect(decodedPong!.opcode).toBe(OPCODE_PONG)
  })

  it("handles medium-length payloads (126-65535 bytes)", () => {
    const payload = new Uint8Array(200).fill(42)
    const frame = encodeFrame(OPCODE_BINARY, payload, false)
    const decoded = decodeFrame(frame)
    expect(decoded!.payload.length).toBe(200)
    expect(decoded!.payload.every((b) => b === 42)).toBe(true)
  })

  it("decodes multiple concatenated frames", () => {
    const frame1 = encodeFrame(OPCODE_TEXT, new TextEncoder().encode("one"), false)
    const frame2 = encodeFrame(OPCODE_TEXT, new TextEncoder().encode("two"), false)
    const combined = new Uint8Array(frame1.length + frame2.length)
    combined.set(frame1)
    combined.set(frame2, frame1.length)

    const decoded1 = decodeFrame(combined)
    expect(decoded1).not.toBeNull()
    expect(new TextDecoder().decode(decoded1!.payload)).toBe("one")

    const remaining = combined.slice(decoded1!.bytesConsumed)
    const decoded2 = decodeFrame(remaining)
    expect(decoded2).not.toBeNull()
    expect(new TextDecoder().decode(decoded2!.payload)).toBe("two")
  })
})

describe("ws-upgrade", () => {
  it("builds a valid HTTP upgrade request", () => {
    const req = buildUpgradeRequest("/admin/?token=abc", "host.example.com:443", "dGVzdA==")
    const text = new TextDecoder().decode(req)
    expect(text).toContain("GET /admin/?token=abc HTTP/1.1\r\n")
    expect(text).toContain("Host: host.example.com:443\r\n")
    expect(text).toContain("Upgrade: websocket\r\n")
    expect(text).toContain("Connection: Upgrade\r\n")
    expect(text).toContain("Sec-WebSocket-Key: dGVzdA==\r\n")
    expect(text).toContain("Sec-WebSocket-Version: 13\r\n")
    expect(text.endsWith("\r\n\r\n")).toBe(true)
  })

  it("includes extra headers", () => {
    const req = buildUpgradeRequest("/ws", "h:443", "k", { Authorization: "Bearer tok" })
    const text = new TextDecoder().decode(req)
    expect(text).toContain("Authorization: Bearer tok\r\n")
  })

  it("parses a 101 upgrade response", () => {
    const response =
      "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      "Sec-WebSocket-Accept: abc123\r\n" +
      "\r\n" +
      "extra-bytes"
    const data = new TextEncoder().encode(response)
    const result = parseUpgradeResponse(data)
    expect(result).not.toBeNull()
    expect(result!.status).toBe(101)
    expect(result!.headers["upgrade"]).toBe("websocket")
    expect(new TextDecoder().decode(result!.remaining)).toBe("extra-bytes")
  })

  it("parses a 403 upgrade response", () => {
    const response = "HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n"
    const data = new TextEncoder().encode(response)
    const result = parseUpgradeResponse(data)
    expect(result).not.toBeNull()
    expect(result!.status).toBe(403)
  })

  it("returns null for incomplete response", () => {
    const partial = new TextEncoder().encode("HTTP/1.1 101 Switching")
    expect(parseUpgradeResponse(partial)).toBeNull()
  })
})

describe("mock stream integration", () => {
  it("mock stream readable delivers enqueued bytes", async () => {
    const mock = createMockStream()
    const reader = mock.readable.getReader()

    mock.pushBytes(new TextEncoder().encode("hello"))
    const { value, done } = await reader.read()
    expect(done).toBe(false)
    expect(new TextDecoder().decode(value!)).toBe("hello")
  })

  it("mock stream send captures outgoing data", async () => {
    const mock = createMockStream()
    await mock.send(new Uint8Array([1, 2, 3]))
    expect(mock.sent.length).toBe(1)
    expect(Array.from(mock.sent[0])).toEqual([1, 2, 3])
  })

  it("simulates full upgrade + text frame flow", async () => {
    const mock = createMockStream()
    const reader = mock.readable.getReader()

    // Simulate: send upgrade request
    const upgradeReq = buildUpgradeRequest("/admin/", "host:443", "key123")
    await mock.send(upgradeReq)

    // Simulate: CVM responds with 101
    const upgradeResponse = new TextEncoder().encode(
      "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      "\r\n"
    )
    mock.pushBytes(upgradeResponse)

    // Read upgrade response
    let buffer = new Uint8Array(0)
    let result = null
    while (!result) {
      const { value, done } = await reader.read()
      if (done) throw new Error("stream closed during upgrade")
      const newBuf = new Uint8Array(buffer.length + value!.length)
      newBuf.set(buffer)
      newBuf.set(value!, buffer.length)
      buffer = newBuf
      result = parseUpgradeResponse(buffer)
    }
    expect(result.status).toBe(101)

    // Simulate: CVM sends a text frame
    const textFrame = encodeFrame(OPCODE_TEXT, new TextEncoder().encode('{"status":"ok"}'), false)
    mock.pushBytes(textFrame)

    // Read the frame
    buffer = new Uint8Array(result.remaining)
    const { value: frameBytes } = await reader.read()
    const fullBuf = new Uint8Array(buffer.length + frameBytes!.length)
    fullBuf.set(buffer)
    fullBuf.set(frameBytes!, buffer.length)

    const decoded = decodeFrame(fullBuf)
    expect(decoded).not.toBeNull()
    expect(decoded!.opcode).toBe(OPCODE_TEXT)
    expect(new TextDecoder().decode(decoded!.payload)).toBe('{"status":"ok"}')
  })

  it("simulates ping/pong exchange", async () => {
    const mock = createMockStream()

    // Send a ping frame from the "server"
    const pingPayload = new TextEncoder().encode("heartbeat")
    const pingFrame = encodeFrame(OPCODE_PING, pingPayload, false)

    // Decode it
    const decoded = decodeFrame(pingFrame)
    expect(decoded!.opcode).toBe(OPCODE_PING)

    // Build pong response (masked, as client)
    const pongFrame = encodeFrame(OPCODE_PONG, decoded!.payload, true)
    await mock.send(pongFrame)

    // Verify pong was sent
    expect(mock.sent.length).toBe(1)
    const sentPong = decodeFrame(mock.sent[0])
    expect(sentPong!.opcode).toBe(OPCODE_PONG)
    expect(new TextDecoder().decode(sentPong!.payload)).toBe("heartbeat")
  })

  it("handles close frame with code extraction", () => {
    const reason = "going away"
    const reasonBytes = new TextEncoder().encode(reason)
    const closePayload = new Uint8Array(2 + reasonBytes.length)
    closePayload[0] = (1001 >> 8) & 0xff
    closePayload[1] = 1001 & 0xff
    closePayload.set(reasonBytes, 2)
    const closeFrame = encodeFrame(OPCODE_CLOSE, closePayload, false)

    const decoded = decodeFrame(closeFrame)
    expect(decoded!.opcode).toBe(OPCODE_CLOSE)
    const code = (decoded!.payload[0] << 8) | decoded!.payload[1]
    expect(code).toBe(1001)
    const decodedReason = new TextDecoder().decode(decoded!.payload.slice(2))
    expect(decodedReason).toBe("going away")
  })
})
