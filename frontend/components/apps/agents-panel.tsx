"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useWorkspace } from "@/components/workspace/workspace-provider"
import { createAdminBlobUrl } from "@/lib/atls-iframe/iframe-loader"
import { AtlsBridge } from "@/lib/atls-iframe/bridge"
import { createAtlsWebSocketFactory } from "@/lib/atls-iframe/websocket"
import { getAtlasProxyUrl, deriveTargetHost, getPolicy } from "@/lib/atlas-client"

type AdminPanelState = "loading" | "ready" | "error"

export function AdminPanel() {
  const { secureChannelReady, transportFetch, manifest } = useWorkspace()
  const [state, setState] = useState<AdminPanelState>("loading")
  const [error, setError] = useState<string | null>(null)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const bridgeRef = useRef<AtlsBridge | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const nonceRef = useRef(crypto.randomUUID())

  const initAdmin = useCallback(async () => {
    if (!transportFetch || !secureChannelReady) return

    setState("loading")
    setError(null)

    try {
      const url = await createAdminBlobUrl(transportFetch, nonceRef.current)
      setBlobUrl(url)
      setState("ready")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Control UI")
      setState("error")
    }
  }, [transportFetch, secureChannelReady])

  useEffect(() => {
    initAdmin()
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
      bridgeRef.current?.destroy()
    }
  }, [initAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  // Create WS factory if atlas config is available
  const wsFactory = useMemo(() => {
    if (!manifest?.baseUrl) return undefined
    const proxyUrl = getAtlasProxyUrl()
    if (!proxyUrl) return undefined
    return createAtlsWebSocketFactory({
      proxyUrl,
      targetHost: deriveTargetHost(manifest.baseUrl),
      policy: getPolicy(),
    })
  }, [manifest?.baseUrl])

  const handleIframeLoad = useCallback(() => {
    if (!iframeRef.current?.contentWindow || !transportFetch) return

    const bridge = new AtlsBridge({
      atlsFetch: transportFetch,
      nonce: nonceRef.current,
      createAtlsWebSocket: wsFactory,
    })

    const channel = new MessageChannel()
    bridge.attachPort(channel.port1)

    iframeRef.current.contentWindow.postMessage(
      { type: "bridge-handshake", nonce: nonceRef.current },
      "*",
      [channel.port2]
    )

    bridgeRef.current = bridge
  }, [transportFetch, wsFactory])

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
          onClick={initAdmin}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <iframe
      ref={iframeRef}
      src={blobUrl ?? undefined}
      onLoad={handleIframeLoad}
      sandbox="allow-scripts"
      className="h-full w-full border-0"
      title="OpenClaw Control UI"
    />
  )
}
