import type { CvmManifest } from "@/lib/cvm/types"

export function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim()
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim()
  }
  return "Unknown error"
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

export function firstString(record: Record<string, unknown> | null, keys: string[]): string | null {
  if (!record) return null
  for (const key of keys) {
    const candidate = record[key]
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim()
    }
  }
  return null
}

export function normalizeSha256(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase().replace(/^0x/, "")
  return normalized.length > 0 ? normalized : null
}

export function extractComposeSignals(quotePayload: Record<string, unknown>) {
  const top = asRecord(quotePayload)
  const quote = asRecord(quotePayload.quote)
  const topMeta = asRecord(top?.metadata)
  const quoteMeta = asRecord(quote?.metadata)

  const records = [top, quote, topMeta, quoteMeta]

  const appComposeSha256 =
    records
      .map((record) =>
        firstString(record, ["app_compose_sha256", "appComposeSha256", "app_compose_hash", "appComposeHash"]),
      )
      .find((value) => value !== null) ?? null

  const ownerPolicyVersion =
    records
      .map((record) => firstString(record, ["owner_policy_version", "ownerPolicyVersion"]))
      .find((value) => value !== null) ?? null

  const ownerKeysetHash =
    records
      .map((record) => firstString(record, ["owner_keyset_hash", "ownerKeysetHash"]))
      .find((value) => value !== null) ?? null

  const ownerUserHandleHash =
    records
      .map((record) => firstString(record, ["owner_user_handle_hash", "ownerUserHandleHash"]))
      .find((value) => value !== null) ?? null

  return {
    appComposeSha256: normalizeSha256(appComposeSha256),
    ownerPolicyVersion,
    ownerKeysetHash: normalizeSha256(ownerKeysetHash),
    ownerUserHandleHash: normalizeSha256(ownerUserHandleHash),
  }
}

export function validateExpectedComposePolicy(
  manifest: CvmManifest,
  quotePayload: Record<string, unknown>,
): { ok: true } | { ok: false; message: string } {
  const expected = manifest.attestationPolicy.expectedAppCompose
  if (!expected) {
    return { ok: true }
  }

  const observed = extractComposeSignals(quotePayload)
  const expectedComposeHash = normalizeSha256(expected.appComposeSha256)
  const expectedOwnerHash = normalizeSha256(expected.ownerKeysetHash)
  const expectedOwnerUserHandleHash = normalizeSha256(expected.ownerUserHandleHash)
  const expectedPolicyVersion = expected.ownerPolicyVersion?.trim() || null

  if (expectedComposeHash) {
    if (!observed.appComposeSha256) {
      return { ok: false, message: "Attestation quote is missing app compose hash metadata." }
    }
    if (observed.appComposeSha256 !== expectedComposeHash) {
      return { ok: false, message: "Attestation failed: expected app compose hash does not match deployed CVM." }
    }
  }

  if (expectedOwnerHash) {
    if (!observed.ownerKeysetHash) {
      return { ok: false, message: "Attestation quote is missing owner keyset hash metadata." }
    }
    if (observed.ownerKeysetHash !== expectedOwnerHash) {
      return { ok: false, message: "Attestation failed: owner keyset hash mismatch." }
    }
  }

  if (expectedPolicyVersion) {
    if (!observed.ownerPolicyVersion) {
      return { ok: false, message: "Attestation quote is missing owner policy version metadata." }
    }
    if (observed.ownerPolicyVersion !== expectedPolicyVersion) {
      return { ok: false, message: "Attestation failed: owner policy version mismatch." }
    }
  }

  if (expectedOwnerUserHandleHash) {
    if (!observed.ownerUserHandleHash) {
      return { ok: false, message: "Attestation quote is missing owner user handle hash metadata." }
    }
    if (observed.ownerUserHandleHash !== expectedOwnerUserHandleHash) {
      return { ok: false, message: "Attestation failed: owner user handle hash mismatch." }
    }
  }

  return { ok: true }
}

export function generateNonceHex(byteLength = 32) {
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function") {
    throw new Error("Secure random generator unavailable")
  }
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")
}

export function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "")
}

export function formatLocalDevTransportError(message: string, baseUrl: string) {
  const normalized = message.toLowerCase()
  const looksLikeNetworkFailure =
    normalized.includes("load failed") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror")

  const localTlsTarget =
    baseUrl.startsWith("https://localhost") ||
    baseUrl.startsWith("https://127.0.0.1") ||
    baseUrl.startsWith("https://")

  if (looksLikeNetworkFailure && localTlsTarget && process.env.NODE_ENV !== "production") {
    return `${message} Open https://localhost/health in this browser and accept the local TLS certificate, then retry.`
  }

  return message
}

export async function fetchManifest(): Promise<CvmManifest> {
  const response = await fetch("/api/cvm/manifest", {
    method: "GET",
    cache: "no-store",
  })

  const payload = (await response.json().catch(() => ({}))) as Partial<CvmManifest> & { error?: string }
  if (!response.ok) {
    throw new Error(payload.error || "Failed to fetch CVM manifest")
  }

  if (!payload?.baseUrl || !payload?.cvmId || !payload?.attestationPolicy) {
    throw new Error("Control-plane manifest is incomplete")
  }
  if (!payload.connectionPolicy || typeof payload.connectionPolicy.mode !== "string") {
    throw new Error("Control-plane manifest is missing connection policy")
  }

  return payload as CvmManifest
}
