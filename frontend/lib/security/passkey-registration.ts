import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

const CHALLENGE_TTL_SECONDS = 120
const DEFAULT_RP_NAME = "Umbra Private Workspace"

type PasskeyChallengePayload = {
  sub: string
  challenge_b64url: string
  rp_id: string
  iat: number
  exp: number
}

export class PasskeyChallengeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PasskeyChallengeError"
  }
}

function toBase64Url(raw: Uint8Array | Buffer) {
  return Buffer.from(raw).toString("base64url")
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url")
}

function getChallengeSecret() {
  const fromEnv = process.env.PASSKEY_CHALLENGE_SECRET?.trim()
  if (fromEnv) {
    return fromEnv
  }
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (fallback) {
    return fallback
  }
  throw new PasskeyChallengeError(
    "Passkey challenge secret is not configured. Set PASSKEY_CHALLENGE_SECRET.",
  )
}

function normalizeOrigin(value: string | null | undefined) {
  if (!value) return null
  try {
    const url = new URL(value)
    url.hash = ""
    url.pathname = ""
    url.search = ""
    return `${url.protocol}//${url.host}`.toLowerCase()
  } catch {
    return null
  }
}

function hostToRpId(host: string) {
  const trimmed = host.trim().toLowerCase()
  if (!trimmed) return null
  if (trimmed.startsWith("[")) {
    const closing = trimmed.indexOf("]")
    if (closing > 1) {
      return trimmed.slice(1, closing)
    }
  }
  const separator = trimmed.lastIndexOf(":")
  if (separator > 0 && !trimmed.includes("]")) {
    return trimmed.slice(0, separator)
  }
  return trimmed
}

export function getWebAuthnRpId(request: Request) {
  const configured = process.env.WEBAUTHN_RP_ID?.trim()
  if (configured) {
    return configured.toLowerCase()
  }

  const appUrlRpId = (() => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
    if (!appUrl) return null
    try {
      const url = new URL(appUrl)
      return url.hostname.toLowerCase()
    } catch {
      return null
    }
  })()
  if (appUrlRpId) {
    return appUrlRpId
  }

  const origin = normalizeOrigin(request.headers.get("origin"))
  if (origin) {
    return new URL(origin).hostname.toLowerCase()
  }

  const host = request.headers.get("host")
  if (host) {
    const rpId = hostToRpId(host)
    if (rpId) return rpId
  }

  const fallback = new URL(request.url).hostname.toLowerCase()
  if (!fallback) {
    throw new PasskeyChallengeError("Unable to determine WebAuthn RP ID.")
  }
  return fallback
}

export function getWebAuthnAllowedOrigins(request: Request) {
  const configured = process.env.WEBAUTHN_ALLOWED_ORIGINS?.trim()
  if (configured) {
    const values = configured
      .split(",")
      .map((item) => normalizeOrigin(item))
      .filter((item): item is string => Boolean(item))
    if (values.length > 0) {
      return new Set(values)
    }
  }

  const appOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL?.trim())
  if (appOrigin) {
    return new Set([appOrigin])
  }

  const requestOrigin = normalizeOrigin(request.headers.get("origin"))
  if (requestOrigin) {
    return new Set([requestOrigin])
  }

  const requestUrlOrigin = normalizeOrigin(request.url)
  if (requestUrlOrigin) {
    return new Set([requestUrlOrigin])
  }

  return new Set<string>()
}

export function getWebAuthnRpName() {
  return process.env.WEBAUTHN_RP_NAME?.trim() || DEFAULT_RP_NAME
}

export function getMinOwnerPasskeys() {
  const parsed = Number.parseInt(process.env.CVM_MIN_OWNER_PASSKEYS ?? "1", 10)
  if (Number.isFinite(parsed) && parsed >= 1) {
    return Math.floor(parsed)
  }
  return 1
}

export function issuePasskeyChallengeToken(params: { userId: string; rpId: string }) {
  const now = Math.floor(Date.now() / 1000)
  const payload: PasskeyChallengePayload = {
    sub: params.userId,
    challenge_b64url: toBase64Url(randomBytes(32)),
    rp_id: params.rpId,
    iat: now,
    exp: now + CHALLENGE_TTL_SECONDS,
  }

  const encodedPayload = toBase64Url(Buffer.from(JSON.stringify(payload), "utf-8"))
  const signature = createHmac("sha256", getChallengeSecret()).update(encodedPayload).digest()
  return {
    challengeToken: `${encodedPayload}.${toBase64Url(signature)}`,
    challengeB64Url: payload.challenge_b64url,
    expiresAt: payload.exp,
  }
}

export function verifyPasskeyChallengeToken(token: string, expectedUserId: string) {
  const parts = token.split(".")
  if (parts.length !== 2) {
    throw new PasskeyChallengeError("Challenge token is malformed.")
  }

  const [encodedPayload, encodedSignature] = parts
  if (!encodedPayload || !encodedSignature) {
    throw new PasskeyChallengeError("Challenge token is incomplete.")
  }

  const expected = createHmac("sha256", getChallengeSecret()).update(encodedPayload).digest()
  const provided = fromBase64Url(encodedSignature)
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    throw new PasskeyChallengeError("Challenge token signature mismatch.")
  }

  let payload: PasskeyChallengePayload
  try {
    payload = JSON.parse(fromBase64Url(encodedPayload).toString("utf-8")) as PasskeyChallengePayload
  } catch {
    throw new PasskeyChallengeError("Challenge token payload is invalid.")
  }

  if (!payload || typeof payload !== "object") {
    throw new PasskeyChallengeError("Challenge token payload is missing.")
  }
  if (payload.sub !== expectedUserId) {
    throw new PasskeyChallengeError("Challenge token user mismatch.")
  }
  if (typeof payload.exp !== "number" || typeof payload.iat !== "number" || payload.exp <= payload.iat) {
    throw new PasskeyChallengeError("Challenge token timestamps are invalid.")
  }

  const now = Math.floor(Date.now() / 1000)
  if (now > payload.exp) {
    throw new PasskeyChallengeError("Challenge token expired.")
  }

  if (
    typeof payload.challenge_b64url !== "string" ||
    payload.challenge_b64url.length < 16 ||
    typeof payload.rp_id !== "string" ||
    payload.rp_id.length < 1
  ) {
    throw new PasskeyChallengeError("Challenge token payload is incomplete.")
  }

  return payload
}
