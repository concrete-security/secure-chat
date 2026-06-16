import { describe, expect, it } from "vitest"
import {
  buildUpgradeRequest,
  parseUpgradeResponse,
  generateWebSocketKey,
} from "@/lib/atls-iframe/ws-upgrade"

describe("ws-upgrade", () => {
  describe("generateWebSocketKey", () => {
    it("returns a 24-char base64 string", () => {
      const key = generateWebSocketKey()
      expect(key.length).toBe(24)
      expect(() => atob(key)).not.toThrow()
    })
  })

  describe("buildUpgradeRequest", () => {
    it("builds a valid HTTP Upgrade request", () => {
      const key = "dGhlIHNhbXBsZSBub25jZQ=="
      const request = buildUpgradeRequest("/admin/ws", "example.com", key)
      const text = new TextDecoder().decode(request)
      expect(text).toContain("GET /admin/ws HTTP/1.1\r\n")
      expect(text).toContain("Host: example.com\r\n")
      expect(text).toContain("Upgrade: websocket\r\n")
      expect(text).toContain("Connection: Upgrade\r\n")
      expect(text).toContain(`Sec-WebSocket-Key: ${key}\r\n`)
      expect(text).toContain("Sec-WebSocket-Version: 13\r\n")
      expect(text.endsWith("\r\n\r\n")).toBe(true)
    })

    it("includes extra headers when provided", () => {
      const key = generateWebSocketKey()
      const request = buildUpgradeRequest("/admin/ws", "host", key, {
        Authorization: "Bearer token123",
      })
      const text = new TextDecoder().decode(request)
      expect(text).toContain("Authorization: Bearer token123\r\n")
    })
  })

  describe("parseUpgradeResponse", () => {
    it("parses a 101 Switching Protocols response", () => {
      const response = new TextEncoder().encode(
        "HTTP/1.1 101 Switching Protocols\r\n" +
          "Upgrade: websocket\r\n" +
          "Connection: Upgrade\r\n" +
          "Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n" +
          "\r\n"
      )
      const result = parseUpgradeResponse(response)
      expect(result).not.toBeNull()
      expect(result!.status).toBe(101)
      expect(result!.headers["upgrade"]).toBe("websocket")
      expect(result!.remaining.byteLength).toBe(0)
    })

    it("captures remaining bytes after headers", () => {
      const response = new TextEncoder().encode(
        "HTTP/1.1 101 Switching Protocols\r\n" +
          "Upgrade: websocket\r\n" +
          "\r\n" +
          "leftover"
      )
      const result = parseUpgradeResponse(response)
      expect(result!.remaining.byteLength).toBe(8)
      expect(new TextDecoder().decode(result!.remaining)).toBe("leftover")
    })

    it("returns null for incomplete response", () => {
      const partial = new TextEncoder().encode("HTTP/1.1 101 Switch")
      expect(parseUpgradeResponse(partial)).toBeNull()
    })

    it("returns status for non-101 response", () => {
      const response = new TextEncoder().encode(
        "HTTP/1.1 401 Unauthorized\r\n\r\n"
      )
      const result = parseUpgradeResponse(response)
      expect(result!.status).toBe(401)
    })
  })
})
