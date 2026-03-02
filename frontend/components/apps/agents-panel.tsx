"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useWorkspace } from "@/components/workspace/workspace-provider"
import { AtlsBridge } from "@/lib/atls-iframe/bridge"
import { createAtlsWebSocketFactory } from "@/lib/atls-iframe/websocket"
import { getAtlasProxyUrl, deriveTargetHost, getPolicy } from "@/lib/atlas-client"

type AdminPanelState = "loading" | "ready" | "error"

/**
 * Local dev WebSocket factory — connects through the instrumentation.ts WS proxy
 * on port 3001, which tunnels to the CVM with rejectUnauthorized: false.
 */
function createLocalDevWsFactory(
  sessionId: string,
  binding: string,
): (url: string) => Promise<{
  send: (data: string | ArrayBuffer) => void
  onMessage: (cb: (data: string | ArrayBuffer) => void) => void
  close: (code?: number, reason?: string) => void
}> {
  return (url: string) => {
    const parsed = new URL(url, "https://placeholder")
    const token = `${sessionId}.${binding}`
    const proxyUrl = `wss://localhost.concrete-security.com:3001${parsed.pathname}?token=${encodeURIComponent(token)}`
    console.log("[AdminPanel] local dev WS:", url, "→", proxyUrl)

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(proxyUrl)
      const timeout = setTimeout(() => {
        ws.close()
        reject(new Error("WS proxy connection timeout"))
      }, 10000)

      ws.onopen = () => {
        clearTimeout(timeout)
        let messageCallback: ((data: string | ArrayBuffer) => void) | null = null
        ws.onmessage = (e) => messageCallback?.(e.data)
        resolve({
          send(data: string | ArrayBuffer) { ws.send(data) },
          onMessage(cb: (data: string | ArrayBuffer) => void) { messageCallback = cb },
          close(code?: number, reason?: string) { ws.close(code, reason) },
        })
      }
      ws.onerror = () => {
        clearTimeout(timeout)
        reject(new Error("WS proxy connection failed"))
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
    if (vaultSessionId && transportBindingHex) {
      document.cookie = `cvm-vault-session=${vaultSessionId}; path=/api/cvm/admin; SameSite=Lax`
      document.cookie = `cvm-transport-binding=${transportBindingHex}; path=/api/cvm/admin; SameSite=Lax`
      setCookieReady(true)
    } else {
      setCookieReady(false)
    }
  }, [vaultSessionId, transportBindingHex])

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
  // - local_dev: tunnel through instrumentation.ts WS proxy on port 3001
  // - atlas_required: use aTLS WebSocket via Atlas WASM
  const wsFactory = useMemo(() => {
    if (!manifest?.baseUrl) return undefined
    if (manifest.connectionPolicy.mode === "local_dev_non_attested") {
      if (!vaultSessionId || !transportBindingHex) return undefined
      return createLocalDevWsFactory(vaultSessionId, transportBindingHex)
    }
    const proxyUrl = getAtlasProxyUrl()
    if (!proxyUrl) return undefined
    return createAtlsWebSocketFactory({
      proxyUrl,
      targetHost: deriveTargetHost(manifest.baseUrl),
      policy: getPolicy(),
    })
  }, [manifest?.baseUrl, manifest?.connectionPolicy.mode, vaultSessionId, transportBindingHex])

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
