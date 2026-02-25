import { createHash } from "crypto"

type JsonLike = null | boolean | number | string | JsonLike[] | { [key: string]: JsonLike }

export type OwnerPasskeyHashInput = {
  credential_id_b64url: string
  public_key_cose_b64url: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function toCanonicalValue(value: unknown): JsonLike {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) => toCanonicalValue(item))
  }

  if (isRecord(value)) {
    const normalized: Record<string, JsonLike> = {}
    for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right))) {
      normalized[key] = toCanonicalValue(value[key])
    }
    return normalized
  }

  throw new Error("Unsupported value in canonical JSON serializer")
}

export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(toCanonicalValue(value))
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

export function canonicalizeOwnerPasskeys(passkeys: OwnerPasskeyHashInput[]) {
  return passkeys
    .map((passkey) => ({
      credential_id_b64url: passkey.credential_id_b64url,
      public_key_cose_b64url: passkey.public_key_cose_b64url,
    }))
    .sort((left, right) => left.credential_id_b64url.localeCompare(right.credential_id_b64url))
}

export function computeOwnerKeysetHash(passkeys: OwnerPasskeyHashInput[]) {
  return sha256Hex(canonicalJsonStringify(canonicalizeOwnerPasskeys(passkeys)))
}

export function computeExpectedComposeHash(input: {
  ownerKeysetHash: string
  ownerPolicyVersion: string
  ownerUserHandleHash: string | null
}) {
  return sha256Hex(canonicalJsonStringify(input))
}
