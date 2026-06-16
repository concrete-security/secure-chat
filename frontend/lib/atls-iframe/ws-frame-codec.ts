export const OPCODE_CONTINUATION = 0x0
export const OPCODE_TEXT = 0x1
export const OPCODE_BINARY = 0x2
export const OPCODE_CLOSE = 0x8
export const OPCODE_PING = 0x9
export const OPCODE_PONG = 0xa

export type DecodedFrame = {
  fin: boolean
  opcode: number
  payload: Uint8Array
  bytesConsumed: number
}

export function encodeFrame(
  opcode: number,
  payload: Uint8Array,
  mask: boolean
): Uint8Array {
  const len = payload.byteLength
  let headerLen = 2
  if (len >= 126 && len < 65536) headerLen += 2
  else if (len >= 65536) headerLen += 8
  if (mask) headerLen += 4

  const frame = new Uint8Array(headerLen + len)
  frame[0] = 0x80 | (opcode & 0x0f)

  let offset = 1
  if (len < 126) {
    frame[offset++] = (mask ? 0x80 : 0) | len
  } else if (len < 65536) {
    frame[offset++] = (mask ? 0x80 : 0) | 126
    frame[offset++] = (len >> 8) & 0xff
    frame[offset++] = len & 0xff
  } else {
    frame[offset++] = (mask ? 0x80 : 0) | 127
    // Upper 4 bytes are zero for lengths that fit in 32 bits
    frame[offset++] = 0
    frame[offset++] = 0
    frame[offset++] = 0
    frame[offset++] = 0
    frame[offset++] = (len >> 24) & 0xff
    frame[offset++] = (len >> 16) & 0xff
    frame[offset++] = (len >> 8) & 0xff
    frame[offset++] = len & 0xff
  }

  if (mask) {
    const maskBytes = crypto.getRandomValues(new Uint8Array(4))
    frame.set(maskBytes, offset)
    offset += 4
    for (let i = 0; i < len; i++) {
      frame[offset + i] = payload[i] ^ maskBytes[i & 3]
    }
  } else {
    frame.set(payload, offset)
  }

  return frame
}

export function decodeFrame(buffer: Uint8Array): DecodedFrame | null {
  if (buffer.byteLength < 2) return null

  const fin = (buffer[0] & 0x80) !== 0
  const opcode = buffer[0] & 0x0f
  const masked = (buffer[1] & 0x80) !== 0
  let payloadLen = buffer[1] & 0x7f
  let offset = 2

  if (payloadLen === 126) {
    if (buffer.byteLength < 4) return null
    payloadLen = (buffer[2] << 8) | buffer[3]
    offset = 4
  } else if (payloadLen === 127) {
    if (buffer.byteLength < 10) return null
    // Read lower 4 bytes (upper 4 are expected to be zero for practical sizes)
    payloadLen =
      (buffer[6] << 24) | (buffer[7] << 16) | (buffer[8] << 8) | buffer[9]
    offset = 10
  }

  if (masked) {
    if (buffer.byteLength < offset + 4 + payloadLen) return null
    const maskBytes = buffer.slice(offset, offset + 4)
    offset += 4
    const payload = new Uint8Array(payloadLen)
    for (let i = 0; i < payloadLen; i++) {
      payload[i] = buffer[offset + i] ^ maskBytes[i & 3]
    }
    return { fin, opcode, payload, bytesConsumed: offset + payloadLen }
  }

  if (buffer.byteLength < offset + payloadLen) return null
  const payload = buffer.slice(offset, offset + payloadLen)
  return { fin, opcode, payload, bytesConsumed: offset + payloadLen }
}
