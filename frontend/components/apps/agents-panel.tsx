"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useWorkspace } from "@/components/workspace/workspace-provider"
import { AtlsBridge } from "@/lib/atls-iframe/bridge"

type AdminPanelState = "loading" | "ready" | "error"

/**
 * Direct WebSocket factory for local Docker dev (no proxy).
 * Connects to wss://{baseUrl}/admin/?token=... using a native WebSocket.
 * Requires mkcert CA trusted by the browser (`mkcert -install`).
 */
function createDirectWsFactory(
  baseUrl: string,
  sessionId: string,
  binding: string,
): (url: string) => Promise<{
  send: (data: string | ArrayBuffer) => void
  onMessage: (cb: (data: string | ArrayBuffer) => void) => void
  onClose?: (cb: (code: number, reason: string) => void) => void
  close: (code?: number, reason?: string) => void
}> {
  return (url: string) => {
    const parsed = new URL(url, "https://placeholder")
    const token = `${sessionId}.${binding}`
    const wsBase = baseUrl.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://")
    const wsUrl = `${wsBase}${parsed.pathname}?token=${encodeURIComponent(token)}`
    console.log("[AdminPanel] direct WS:", url, "→", wsUrl)

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl)
      const timeout = setTimeout(() => {
        ws.close()
        reject(new Error("WebSocket connection timeout"))
      }, 10000)

      ws.onopen = () => {
        console.log("[AdminPanel] direct WS opened:", wsUrl)
        clearTimeout(timeout)
        const messageQueue: Array<string | ArrayBuffer> = []
        let messageCallback: ((data: string | ArrayBuffer) => void) | null = null
        let closeCallback: ((code: number, reason: string) => void) | null = null

        ws.onmessage = (e) => {
          if (messageCallback) {
            messageCallback(e.data)
          } else {
            messageQueue.push(e.data)
          }
        }
        ws.onclose = (e) => {
          console.log("[AdminPanel] direct WS closed:", e.code, e.reason)
          closeCallback?.(e.code, e.reason)
        }
        ws.onerror = () => {
          console.log("[AdminPanel] direct WS error after open")
          closeCallback?.(1006, "WebSocket error")
        }

        resolve({
          send(data: string | ArrayBuffer) { ws.send(data) },
          onMessage(cb: (data: string | ArrayBuffer) => void) {
            messageCallback = cb
            messageQueue.splice(0).forEach(cb)
          },
          onClose(cb: (code: number, reason: string) => void) { closeCallback = cb },
          close(code?: number, reason?: string) { ws.close(code, reason) },
        })
      }
      ws.onerror = (e) => {
        console.error("[AdminPanel] direct WS error (before open):", wsUrl, e)
        clearTimeout(timeout)
        reject(new Error("WebSocket connection failed"))
      }
    })
  }
}

export function AdminPanel() {
  const { secureChannelReady, transportFetch, transportBindingHex, vaultSessionId, manifest } = useWorkspace()
  const [state, setState] = useState<AdminPanelState>("loading")
  const [error, setError] = useState<string | null>(null)
  const bridgeRef = useRef<AtlsBridge | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const nonceRef = useRef(crypto.randomUUID())

  // Sync vault session to cookie, then enable iframe loading
  const [cookieReady, setCookieReady] = useState(false)

  useEffect(() => {
    if (vaultSessionId && transportBindingHex && manifest?.baseUrl) {
      document.cookie = `cvm-vault-session=${vaultSessionId}; path=/api/cvm/admin; SameSite=Lax`
      document.cookie = `cvm-transport-binding=${transportBindingHex}; path=/api/cvm/admin; SameSite=Lax`
      document.cookie = `cvm-base-url=${encodeURIComponent(manifest.baseUrl)}; path=/api/cvm/admin; SameSite=Lax`
      setCookieReady(true)
    } else {
      setCookieReady(false)
    }
  }, [vaultSessionId, transportBindingHex, manifest?.baseUrl])

  // Only build iframe src after the cookie is set (avoids race condition)
  const iframeSrc = cookieReady
    ? `/api/cvm/admin/?nonce=${encodeURIComponent(nonceRef.current)}`
    : null

  useEffect(() => {
    if (secureChannelReady && iframeSrc) {
      setState("ready")
    }
    return () => {
      bridgeRef.current?.destroy()
    }
  }, [secureChannelReady, iframeSrc])

  // Create WS factory depending on connection mode:
  // - local_dev_non_attested: direct WebSocket to Docker nginx (mkcert cert)
  // - atlas_required: not supported — a second aTLS connection has different EKM,
  //   so the CVM rejects the vault session (EKM channel binding mismatch).
  //   Admin UI HTTP calls still work through the bridge via the existing transport.
  const wsFactory = useMemo(() => {
    if (!manifest?.baseUrl) return undefined
    if (manifest.connectionPolicy.mode === "local_dev_non_attested") {
      if (!vaultSessionId || !transportBindingHex) return undefined
      return createDirectWsFactory(manifest.baseUrl, vaultSessionId, transportBindingHex)
    }
    // atlas_required: aTLS WebSocket requires a second TLS connection with different
    // EKM keying material — the CVM's vault rejects it. Skip WS factory; the admin
    // UI's fetch calls still work through the bridge over the primary aTLS transport.
    return undefined
  }, [
    manifest?.baseUrl,
    manifest?.connectionPolicy.mode,
    vaultSessionId,
    transportBindingHex,
  ])

  const handleIframeLoad = useCallback(() => {
    if (!iframeRef.current?.contentWindow || !transportFetch) return

    const bridge = new AtlsBridge({
      atlsFetch: transportFetch,
      nonce: nonceRef.current,
      createAtlsWebSocket: wsFactory,
    })

    const channel = new MessageChannel()
    bridge.attachPort(channel.port1)

    const authToken = vaultSessionId && transportBindingHex
      ? `${vaultSessionId}.${transportBindingHex}`
      : undefined

    iframeRef.current.contentWindow.postMessage(
      { type: "bridge-handshake", nonce: nonceRef.current, authToken },
      "*",
      [channel.port2]
    )

    bridgeRef.current = bridge
  }, [transportFetch, wsFactory, vaultSessionId, transportBindingHex])

  const handleIframeError = useCallback(() => {
    setError("Failed to load Control UI")
    setState("error")
  }, [])

  if (!secureChannelReady) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Establishing secure connection...
      </div>
    )
  }

  if (state === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading Control UI...
      </div>
    )
  }

  if (state === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <p className="text-destructive">Failed to load Control UI</p>
        <p className="text-sm text-muted-foreground">{error}</p>
        <button
          className="mt-2 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          onClick={() => {
            setState("loading")
            setError(null)
            nonceRef.current = crypto.randomUUID()
            setState("ready")
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <iframe
      ref={iframeRef}
      src={iframeSrc ?? undefined}
      onLoad={handleIframeLoad}
      onError={handleIframeError}
      sandbox="allow-scripts allow-same-origin"
      className="h-full w-full border-0"
      title="OpenClaw Control UI"
    />
  )
}
