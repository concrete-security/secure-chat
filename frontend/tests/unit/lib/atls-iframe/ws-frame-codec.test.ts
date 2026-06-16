import { describe, expect, it } from "vitest"
import {
  encodeFrame,
  decodeFrame,
  OPCODE_TEXT,
  OPCODE_BINARY,
  OPCODE_CLOSE,
  OPCODE_PING,
  OPCODE_PONG,
} from "@/lib/atls-iframe/ws-frame-codec"

describe("ws-frame-codec", () => {
  describe("encodeFrame", () => {
    it("encodes a small text frame with masking", () => {
      const payload = new TextEncoder().encode("hello")
      const frame = encodeFrame(OPCODE_TEXT, payload, true)
      expect(frame.byteLength).toBe(2 + 4 + 5)
      expect(frame[0]).toBe(0x81)
      expect(frame[1] & 0x80).toBe(0x80)
      expect(frame[1] & 0x7f).toBe(5)
    })

    it("encodes an unmasked binary frame", () => {
      const payload = new Uint8Array([1, 2, 3])
      const frame = encodeFrame(OPCODE_BINARY, payload, false)
      expect(frame.byteLength).toBe(2 + 3)
      expect(frame[0]).toBe(0x82)
      expect(frame[1]).toBe(3)
      expect(frame[2]).toBe(1)
      expect(frame[3]).toBe(2)
      expect(frame[4]).toBe(3)
    })

    it("encodes a 126-byte payload with extended length", () => {
      const payload = new Uint8Array(126)
      const frame = encodeFrame(OPCODE_TEXT, payload, false)
      expect(frame[1] & 0x7f).toBe(126)
      expect(frame.byteLength).toBe(2 + 2 + 126)
    })

    it("encodes a 65536-byte payload with 64-bit length", () => {
      const payload = new Uint8Array(65536)
      const frame = encodeFrame(OPCODE_BINARY, payload, false)
      expect(frame[1] & 0x7f).toBe(127)
      expect(frame.byteLength).toBe(2 + 8 + 65536)
    })

    it("encodes a close frame", () => {
      const frame = encodeFrame(OPCODE_CLOSE, new Uint8Array(0), true)
      expect(frame[0]).toBe(0x88)
    })
  })

  describe("decodeFrame", () => {
    it("decodes an unmasked text frame", () => {
      const payload = new TextEncoder().encode("hello")
      const encoded = encodeFrame(OPCODE_TEXT, payload, false)
      const result = decodeFrame(encoded)
      expect(result).not.toBeNull()
      expect(result!.opcode).toBe(OPCODE_TEXT)
      expect(result!.fin).toBe(true)
      expect(new TextDecoder().decode(result!.payload)).toBe("hello")
      expect(result!.bytesConsumed).toBe(encoded.byteLength)
    })

    it("decodes a masked frame by unmasking", () => {
      const payload = new TextEncoder().encode("test")
      const encoded = encodeFrame(OPCODE_TEXT, payload, true)
      const result = decodeFrame(encoded)
      expect(new TextDecoder().decode(result!.payload)).toBe("test")
    })

    it("returns null for incomplete frames", () => {
      const result = decodeFrame(new Uint8Array([0x81]))
      expect(result).toBeNull()
    })

    it("decodes a ping frame", () => {
      const frame = encodeFrame(OPCODE_PING, new Uint8Array([1, 2]), false)
      const result = decodeFrame(frame)
      expect(result!.opcode).toBe(OPCODE_PING)
    })

    it("round-trips binary data correctly", () => {
      const payload = new Uint8Array([0, 127, 128, 255])
      const encoded = encodeFrame(OPCODE_BINARY, payload, true)
      const decoded = decodeFrame(encoded)
      expect(decoded!.payload).toEqual(payload)
    })
  })
})
