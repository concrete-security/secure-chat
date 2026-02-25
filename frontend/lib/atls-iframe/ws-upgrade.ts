export function generateWebSocketKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes))
}

export function buildUpgradeRequest(
  path: string,
  host: string,
  key: string,
  extraHeaders?: Record<string, string>
): Uint8Array {
  let request =
    `GET ${path} HTTP/1.1\r\n` +
    `Host: ${host}\r\n` +
    `Upgrade: websocket\r\n` +
    `Connection: Upgrade\r\n` +
    `Sec-WebSocket-Key: ${key}\r\n` +
    `Sec-WebSocket-Version: 13\r\n`

  if (extraHeaders) {
    for (const [name, value] of Object.entries(extraHeaders)) {
      request += `${name}: ${value}\r\n`
    }
  }

  request += "\r\n"
  return new TextEncoder().encode(request)
}

export type UpgradeResponse = {
  status: number
  headers: Record<string, string>
  remaining: Uint8Array
}

export function parseUpgradeResponse(data: Uint8Array): UpgradeResponse | null {
  const text = new TextDecoder().decode(data)
  const headerEnd = text.indexOf("\r\n\r\n")
  if (headerEnd === -1) return null

  const headerText = text.slice(0, headerEnd)
  const lines = headerText.split("\r\n")
  const statusLine = lines[0]
  const statusMatch = statusLine.match(/^HTTP\/1\.1 (\d+)/)
  if (!statusMatch) return null

  const status = parseInt(statusMatch[1], 10)
  const headers: Record<string, string> = {}
  for (let i = 1; i < lines.length; i++) {
    const colonIdx = lines[i].indexOf(":")
    if (colonIdx > 0) {
      const name = lines[i].slice(0, colonIdx).trim().toLowerCase()
      const value = lines[i].slice(colonIdx + 1).trim()
      headers[name] = value
    }
  }

  const headerBytes = new TextEncoder().encode(headerText + "\r\n\r\n")
  const remaining = data.slice(headerBytes.byteLength)

  return { status, headers, remaining }
}
