import type { OwnerStatus } from "./types"

type OwnerChallengeContext = "claim" | "unlock"

type OwnerChallengeResponse = {
  challenge_id: string
  challenge_b64url: string
  rp_id: string
  context: OwnerChallengeContext
  allow_credentials: Array<{
    type: "public-key"
    credential_id_b64url: string
  }>
  expires_in_seconds: number
}

type OwnerAssertionPayload = {
  credential_id_b64url: string
  client_data_json_b64url: string
  authenticator_data_b64url: string
  signature_b64url: string
  user_handle_b64url: string | null
}

type OwnerVerifyResponse = {
  vault_session_id: string
  expires_at: string
  claimed_now: boolean
}

type OwnerFetchOptions = {
  fetchImpl?: typeof fetch
}

function decodeBase64Url(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4)
  const encoded = normalized + padding

  if (typeof atob === "function") {
    const raw = atob(encoded)
    const bytes = new Uint8Array(raw.length)
    for (let index = 0; index < raw.length; index += 1) {
      bytes[index] = raw.charCodeAt(index)
    }
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  }

  throw new Error("Base64url decoding is unavailable in this environment")
}

function encodeBase64Url(value: ArrayBuffer | ArrayBufferView): string {
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)

  let binary = ""
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]!)
  }

  if (typeof btoa !== "function") {
    throw new Error("Base64url encoding is unavailable in this environment")
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

async function ownerFetch<T>(
  baseUrl: string,
  path: string,
  options?: { method?: string; body?: unknown; fetchImpl?: typeof fetch },
): Promise<T> {
  const method = options?.method ?? "GET"
  const headers: Record<string, string> = {}
  const fetchFn = options?.fetchImpl ?? fetch

  const init: RequestInit = { method, headers }
  if (options?.body !== undefined) {
    headers["Content-Type"] = "application/json"
    init.body = JSON.stringify(options.body)
  }

  const target = baseUrl ? `${baseUrl}${path}` : path
  const response = await fetchFn(target, init)
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message = typeof payload?.detail === "string" ? payload.detail : `Owner request failed (${response.status})`
    throw new Error(message)
  }

  return payload as T
}

export async function fetchOwnerStatus(baseUrl: string, options?: OwnerFetchOptions): Promise<OwnerStatus> {
  return ownerFetch<OwnerStatus>(baseUrl, "/owner/status", { fetchImpl: options?.fetchImpl })
}

export async function requestOwnerChallenge(
  baseUrl: string,
  context?: OwnerChallengeContext,
  transport?: OwnerFetchOptions,
): Promise<OwnerChallengeResponse> {
  return ownerFetch<OwnerChallengeResponse>(baseUrl, "/owner/auth/challenge", {
    method: "POST",
    body: context ? { context } : {},
    fetchImpl: transport?.fetchImpl,
  })
}

export async function verifyOwnerAssertion(
  baseUrl: string,
  challengeId: string,
  assertion: OwnerAssertionPayload,
  transport?: OwnerFetchOptions,
): Promise<OwnerVerifyResponse> {
  return ownerFetch<OwnerVerifyResponse>(baseUrl, "/owner/auth/verify", {
    method: "POST",
    body: {
      challenge_id: challengeId,
      assertion,
    },
    fetchImpl: transport?.fetchImpl,
  })
}

function assertPasskeyBrowserSupport() {
  if (typeof window === "undefined") {
    throw new Error("Passkey authentication requires a browser context")
  }
  if (!window.PublicKeyCredential || !navigator.credentials || typeof navigator.credentials.get !== "function") {
    throw new Error("Passkeys are not supported in this browser")
  }
}

function buildAssertionPayload(credential: PublicKeyCredential): OwnerAssertionPayload {
  const response = credential.response as AuthenticatorAssertionResponse
  return {
    credential_id_b64url: encodeBase64Url(credential.rawId),
    client_data_json_b64url: encodeBase64Url(response.clientDataJSON),
    authenticator_data_b64url: encodeBase64Url(response.authenticatorData),
    signature_b64url: encodeBase64Url(response.signature),
    user_handle_b64url: response.userHandle ? encodeBase64Url(response.userHandle) : null,
  }
}

export async function authenticateOwnerWithPasskey(params: {
  baseUrl: string
  context?: OwnerChallengeContext
  fetchImpl?: typeof fetch
}): Promise<OwnerVerifyResponse> {
  assertPasskeyBrowserSupport()

  const challenge = await requestOwnerChallenge(params.baseUrl, params.context, { fetchImpl: params.fetchImpl })

  const publicKeyRequestOptions: PublicKeyCredentialRequestOptions = {
    challenge: decodeBase64Url(challenge.challenge_b64url),
    rpId: challenge.rp_id,
    userVerification: "required",
    timeout: Math.max(1, challenge.expires_in_seconds) * 1000,
    allowCredentials: challenge.allow_credentials.map((credential) => ({
      type: "public-key",
      id: decodeBase64Url(credential.credential_id_b64url),
    })),
  }

  const credential = (await navigator.credentials.get({
    publicKey: publicKeyRequestOptions,
  })) as PublicKeyCredential | null

  if (!credential) {
    throw new Error("No passkey assertion was returned by the browser")
  }

  const assertion = buildAssertionPayload(credential)
  return verifyOwnerAssertion(params.baseUrl, challenge.challenge_id, assertion, { fetchImpl: params.fetchImpl })
}
