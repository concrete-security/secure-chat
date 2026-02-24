type PasskeyStatusResponse = {
  minRequired: number
  count: number
  passkeys: Array<{
    id: string
    credentialIdB64Url: string
    createdAt: string
  }>
}

type RegisterChallengeResponse = {
  challengeToken: string
  expiresAt: number
  minRequired: number
  currentCount: number
  publicKey: {
    challengeB64Url: string
    rp: {
      id: string
      name: string
    }
    user: {
      idB64Url: string
      name: string
      displayName: string
    }
    timeoutMs: number
    pubKeyCredParams: Array<{ type: "public-key"; alg: number }>
    authenticatorSelection: {
      residentKey: "required" | "preferred" | "discouraged"
      userVerification: "required" | "preferred" | "discouraged"
    }
    attestation: "none" | "direct" | "indirect" | "enterprise"
    excludeCredentials: Array<{
      type: "public-key"
      credentialIdB64Url: string
    }>
  }
}

type RegisterVerifyResponse = {
  created: boolean
  minRequired: number
  count: number | null
  passkey: {
    id: string
    credentialIdB64Url: string
    createdAt: string
  }
}

type DeletePasskeysResponse = {
  deletedCount: number
  count: number
}

export type PasskeyStatus = PasskeyStatusResponse

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

function toTransports(response: AuthenticatorAttestationResponse) {
  if (typeof response.getTransports === "function") {
    return response.getTransports()
  }
  return [] as string[]
}

function assertPasskeyRegistrationSupport() {
  if (typeof window === "undefined") {
    throw new Error("Passkey enrollment requires a browser context")
  }
  if (!window.PublicKeyCredential || !navigator.credentials || typeof navigator.credentials.create !== "function") {
    throw new Error("Passkeys are not supported in this browser")
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = typeof payload?.error === "string" ? payload.error : `Passkey API request failed (${response.status})`
    throw new Error(message)
  }
  return payload as T
}

export async function fetchPasskeyStatus(): Promise<PasskeyStatusResponse> {
  return apiFetch<PasskeyStatusResponse>("/api/passkeys", {
    method: "GET",
    cache: "no-store",
  })
}

export async function enrollPasskey(): Promise<RegisterVerifyResponse> {
  assertPasskeyRegistrationSupport()

  const challenge = await apiFetch<RegisterChallengeResponse>("/api/passkeys/register/challenge", {
    method: "POST",
  })

  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge: decodeBase64Url(challenge.publicKey.challengeB64Url),
    rp: challenge.publicKey.rp,
    user: {
      id: decodeBase64Url(challenge.publicKey.user.idB64Url),
      name: challenge.publicKey.user.name,
      displayName: challenge.publicKey.user.displayName,
    },
    timeout: challenge.publicKey.timeoutMs,
    pubKeyCredParams: challenge.publicKey.pubKeyCredParams,
    authenticatorSelection: challenge.publicKey.authenticatorSelection,
    attestation: challenge.publicKey.attestation,
    excludeCredentials: challenge.publicKey.excludeCredentials.map((item) => ({
      type: "public-key",
      id: decodeBase64Url(item.credentialIdB64Url),
    })),
  }

  const createdCredential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null
  if (!createdCredential) {
    throw new Error("No passkey credential was returned by the browser")
  }

  const response = createdCredential.response
  if (!(response instanceof AuthenticatorAttestationResponse)) {
    throw new Error("Passkey registration returned an unexpected credential response")
  }

  return apiFetch<RegisterVerifyResponse>("/api/passkeys/register/verify", {
    method: "POST",
    body: JSON.stringify({
      challengeToken: challenge.challengeToken,
      credential: {
        credentialIdB64Url: encodeBase64Url(createdCredential.rawId),
        clientDataJsonB64Url: encodeBase64Url(response.clientDataJSON),
        attestationObjectB64Url: encodeBase64Url(response.attestationObject),
        transports: toTransports(response),
      },
    }),
  })
}

export async function resetPasskeys(): Promise<DeletePasskeysResponse> {
  return apiFetch<DeletePasskeysResponse>("/api/passkeys?all=true", {
    method: "DELETE",
  })
}
