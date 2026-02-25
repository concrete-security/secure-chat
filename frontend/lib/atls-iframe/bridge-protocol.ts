/** Nonce sent from parent to iframe during handshake. */
export type BridgeHandshake = {
  type: "bridge-handshake"
  nonce: string
  port: MessagePort
}

// --- HTTP Fetch Messages ---

export type FetchRequest = {
  type: "fetch-request"
  id: string
  nonce: string
  url: string
  method: string
  headers: Record<string, string>
  body: string | null
}

export type FetchResponse = {
  type: "fetch-response"
  id: string
  status: number
  statusText: string
  headers: Record<string, string>
  body: string | null
}

// --- WebSocket Messages ---

export type WsOpenRequest = {
  type: "ws-open"
  id: string
  nonce: string
  url: string
  protocols?: string[]
}

export type WsOpenResult = {
  type: "ws-open-result"
  id: string
  success: boolean
  error?: string
}

export type WsFrameToParent = {
  type: "ws-frame-to-parent"
  id: string
  data: string | ArrayBuffer
}

export type WsFrameToIframe = {
  type: "ws-frame-to-iframe"
  id: string
  data: string | ArrayBuffer
}

export type WsClose = {
  type: "ws-close"
  id: string
  code?: number
  reason?: string
}

export type WsError = {
  type: "ws-error"
  id: string
  error: string
}

// --- Union types ---

export type IframeToParentMessage =
  | FetchRequest
  | WsOpenRequest
  | WsFrameToParent
  | WsClose

export type ParentToIframeMessage =
  | FetchResponse
  | WsOpenResult
  | WsFrameToIframe
  | WsClose
  | WsError
