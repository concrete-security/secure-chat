#!/usr/bin/env node
/**
 * Dev-only WebSocket tunnel proxy.
 * Relays wss://localhost.concrete-security.com:3001/... → wss://CVM/...
 * with rejectUnauthorized: false for self-signed CVM certs.
 *
 * Started automatically by `pnpm dev:https`.
 */
import { createServer } from "node:https"
import { request as httpsRequest } from "node:https"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = 3001
const WS_MAGIC = "258EAFA5-E914-47DA-95CA-5AB9FFE11171"

const baseUrl = process.env.PRIVATE_AGENT_DEFAULT_BASE_URL?.trim()?.replace(/\/+$/, "")
if (!baseUrl) {
  console.error("[ws-proxy] PRIVATE_AGENT_DEFAULT_BASE_URL not set")
  process.exit(1)
}

const upstream = new URL(baseUrl)
const certDir = join(__dirname, "..", "certs")

const server = createServer(
  {
    key: readFileSync(join(certDir, "localhost.concrete-security.com+2-key.pem")),
    cert: readFileSync(join(certDir, "localhost.concrete-security.com+2.pem")),
  },
  (_req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" })
    res.end("ws-proxy ok")
  },
)

server.on("upgrade", (req, socket, head) => {
  const key = req.headers["sec-websocket-key"]
  if (!key) { socket.destroy(); return }

  const reqUrl = new URL(req.url || "/", "https://localhost")
  const token = reqUrl.searchParams.get("token") || ""
  const upstreamPath = `${reqUrl.pathname}?token=${encodeURIComponent(token)}`

  console.log("[ws-proxy] upgrade:", reqUrl.pathname, "→", upstream.hostname, "token:", token ? token.slice(0, 8) + "..." : "(none)")

  const upstreamReq = httpsRequest({
    hostname: upstream.hostname,
    port: upstream.port || 443,
    path: upstreamPath,
    method: "GET",
    headers: {
      Upgrade: "websocket",
      Connection: "Upgrade",
      "Sec-WebSocket-Key": key,
      "Sec-WebSocket-Version": "13",
      Host: upstream.host,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    rejectUnauthorized: false,
  })

  upstreamReq.on("upgrade", (_res, upstreamSocket, upstreamHead) => {
    const accept = createHash("sha1").update(key + WS_MAGIC).digest("base64")
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      "\r\n",
    )

    if (head.length > 0) upstreamSocket.write(head)
    if (upstreamHead.length > 0) socket.write(upstreamHead)

    socket.pipe(upstreamSocket)
    upstreamSocket.pipe(socket)

    socket.on("error", () => upstreamSocket.destroy())
    upstreamSocket.on("error", () => socket.destroy())
    socket.on("close", () => upstreamSocket.destroy())
    upstreamSocket.on("close", () => socket.destroy())

    console.log("[ws-proxy] tunnel established:", reqUrl.pathname)
  })

  upstreamReq.on("response", (res) => {
    const chunks = []
    res.on("data", (c) => chunks.push(c))
    res.on("end", () => {
      const body = Buffer.concat(chunks).toString().slice(0, 300)
      console.log("[ws-proxy] upstream rejected upgrade:", res.statusCode, body)
      socket.destroy()
    })
  })

  upstreamReq.on("error", (err) => {
    console.log("[ws-proxy] upstream error:", err.message)
    socket.destroy()
  })

  upstreamReq.setTimeout(10000, () => {
    console.log("[ws-proxy] upstream timeout")
    upstreamReq.destroy()
    socket.destroy()
  })

  upstreamReq.end()
})

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[ws-proxy] listening on wss://localhost.concrete-security.com:${PORT} → ${upstream.hostname}`)
})
