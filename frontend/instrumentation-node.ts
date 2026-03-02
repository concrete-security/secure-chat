/**
 * Node.js-only instrumentation — imported by instrumentation.ts only when NEXT_RUNTIME === "nodejs".
 * Starts a WebSocket tunnel proxy on port 3001 (dev only) that relays
 * WebSocket connections from the browser to the CVM backend with rejectUnauthorized: false.
 * Uses the same TLS certs as the Next.js dev server to avoid mixed-content blocking.
 */
import { createServer as createHttpsServer } from "node:https"
import { request as httpsRequest } from "node:https"
import { createHash } from "node:crypto"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const WS_MAGIC = "258EAFA5-E914-47DA-95CA-5AB9FFE11171"
const PORT = 3001

if (process.env.NODE_ENV !== "production") {
  const baseUrl = process.env.PRIVATE_AGENT_DEFAULT_BASE_URL?.trim()?.replace(/\/+$/, "")

  if (!baseUrl) {
    console.log("[ws-proxy] PRIVATE_AGENT_DEFAULT_BASE_URL not set, skipping WebSocket proxy")
  } else {
    // Load the same TLS certs used by `next dev --experimental-https`
    const certDir = join(process.cwd(), "certs")
    const keyPath = join(certDir, "localhost.concrete-security.com+2-key.pem")
    const certPath = join(certDir, "localhost.concrete-security.com+2.pem")

    if (!existsSync(keyPath) || !existsSync(certPath)) {
      console.log("[ws-proxy] TLS certs not found at", certDir, "— skipping WebSocket proxy")
    } else {
      const upstream = new URL(baseUrl)

      const server = createHttpsServer(
        {
          key: readFileSync(keyPath),
          cert: readFileSync(certPath),
        },
        (_req, res) => {
          res.writeHead(200, { "Content-Type": "text/plain" })
          res.end("WebSocket dev proxy (TLS)")
        },
      )

      server.on("upgrade", (req, socket, head) => {
        const key = req.headers["sec-websocket-key"]
        if (!key) {
          socket.destroy()
          return
        }

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

        upstreamReq.on("upgrade", (_upstreamRes, upstreamSocket, upstreamHead) => {
          // Clear the connect timeout now that the upgrade succeeded
          upstreamReq.setTimeout(0)

          const accept = createHash("sha1").update(key + WS_MAGIC).digest("base64")
          socket.write(
            "HTTP/1.1 101 Switching Protocols\r\n" +
              "Upgrade: websocket\r\n" +
              "Connection: Upgrade\r\n" +
              `Sec-WebSocket-Accept: ${accept}\r\n` +
              "\r\n",
          )

          if (head.length > 0) upstreamSocket.write(head)
          if (upstreamHead.length > 0) {
            console.log("[ws-proxy] upstreamHead:", upstreamHead.length, "bytes")
            socket.write(upstreamHead)
          }

          socket.pipe(upstreamSocket)
          upstreamSocket.pipe(socket)

          socket.on("error", (err) => {
            console.log("[ws-proxy] browser socket error:", err.message)
            upstreamSocket.destroy()
          })
          upstreamSocket.on("error", (err) => {
            console.log("[ws-proxy] upstream socket error:", err.message)
            socket.destroy()
          })
          socket.on("close", () => {
            console.log("[ws-proxy] browser socket closed:", reqUrl.pathname)
            upstreamSocket.destroy()
          })
          upstreamSocket.on("close", () => {
            console.log("[ws-proxy] upstream socket closed:", reqUrl.pathname)
            socket.destroy()
          })

          console.log("[ws-proxy] tunnel established:", reqUrl.pathname)
        })

        upstreamReq.on("response", (res) => {
          console.log("[ws-proxy] upstream rejected upgrade:", res.statusCode)
          socket.destroy()
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

      server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          console.log(`[ws-proxy] Port ${PORT} already in use (proxy may already be running)`)
          return
        }
        console.error("[ws-proxy] Server error:", err)
      })

      server.listen(PORT, "0.0.0.0", () => {
        console.log(`[ws-proxy] WebSocket dev proxy listening on wss://localhost.concrete-security.com:${PORT} → ${upstream.hostname}`)
      })
    }
  }
}
