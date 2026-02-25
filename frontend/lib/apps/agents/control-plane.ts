import { randomUUID } from "crypto"

import { logAuditEvent } from "@/lib/security/audit"
import type { AttestationPolicy, CvmManifest, ModelRoutingPolicy, UserCvmAssignment } from "./types"
import { computeExpectedComposeHash, computeOwnerKeysetHash } from "./hash"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"
import type { CvmInstanceRow, ModelBackendMode, UserModelBackendRow, UserPasskeyRow } from "@/lib/supabase/types"

const DEFAULT_ATTESTATION_POLICY: AttestationPolicy = {
  allowedTeeTypes: ["tdx"],
  allowedMeasurementPrefixes: [],
  allowedTcbStatuses: ["uptodate", "outofdate"],
  requireEkmChannelBinding: true,
  maxQuoteAgeSeconds: 300,
}

const DEFAULT_MODEL_MODE: ModelBackendMode = "remote"

const DEFAULT_REMOTE_PROVIDER = process.env.CVM_DEFAULT_REMOTE_PROVIDER?.trim() || "vllm"
const DEFAULT_REMOTE_MODEL = process.env.CVM_DEFAULT_REMOTE_MODEL?.trim() || "openai/gpt-oss-120b"
const DEFAULT_REMOTE_BASE_URL = process.env.CVM_DEFAULT_REMOTE_BASE_URL?.trim() || "https://vllm.concrete-security.com"
const DEFAULT_OWNER_POLICY_VERSION = process.env.CVM_OWNER_POLICY_VERSION?.trim() || "v1"
const MIN_OWNER_PASSKEYS = Number.parseInt(process.env.CVM_MIN_OWNER_PASSKEYS ?? "1", 10)
const ENFORCE_PASSKEY_ENROLLMENT = process.env.CVM_ENFORCE_PASSKEY_ENROLLMENT !== "false"
const DEV_SCHEMA_FALLBACK_ENABLED =
  process.env.NODE_ENV !== "production" && process.env.CVM_ALLOW_DEV_SCHEMA_FALLBACK !== "false"
const DEV_FALLBACK_CVM_ID = process.env.CVM_DEV_CVM_ID?.trim() || "cvm-dev-local"

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseAttestationPolicy(value: unknown): AttestationPolicy {
  const record = asRecord(value)
  if (!record) {
    return DEFAULT_ATTESTATION_POLICY
  }

  const expectedComposeRecord = asRecord(record.expectedAppCompose ?? record.expected_app_compose)
  const expectedAppCompose = expectedComposeRecord
    ? {
        appComposeSha256:
          toNonEmptyString(expectedComposeRecord.appComposeSha256) ??
          toNonEmptyString(expectedComposeRecord.app_compose_sha256),
        ownerPolicyVersion:
          toNonEmptyString(expectedComposeRecord.ownerPolicyVersion) ??
          toNonEmptyString(expectedComposeRecord.owner_policy_version),
        ownerKeysetHash:
          toNonEmptyString(expectedComposeRecord.ownerKeysetHash) ??
          toNonEmptyString(expectedComposeRecord.owner_keyset_hash),
        ownerUserHandleHash:
          toNonEmptyString(expectedComposeRecord.ownerUserHandleHash) ??
          toNonEmptyString(expectedComposeRecord.owner_user_handle_hash),
      }
    : null

  const maxQuoteAgeSecondsRaw = record.maxQuoteAgeSeconds
  const maxQuoteAgeSeconds =
    typeof maxQuoteAgeSecondsRaw === "number" && Number.isFinite(maxQuoteAgeSecondsRaw) && maxQuoteAgeSecondsRaw > 0
      ? Math.floor(maxQuoteAgeSecondsRaw)
      : DEFAULT_ATTESTATION_POLICY.maxQuoteAgeSeconds

  return {
    allowedTeeTypes: toStringArray(record.allowedTeeTypes).length
      ? toStringArray(record.allowedTeeTypes)
      : DEFAULT_ATTESTATION_POLICY.allowedTeeTypes,
    allowedMeasurementPrefixes: toStringArray(record.allowedMeasurementPrefixes),
    allowedTcbStatuses: toStringArray(record.allowedTcbStatuses).length
      ? toStringArray(record.allowedTcbStatuses)
      : DEFAULT_ATTESTATION_POLICY.allowedTcbStatuses,
    requireEkmChannelBinding:
      typeof record.requireEkmChannelBinding === "boolean"
        ? record.requireEkmChannelBinding
        : DEFAULT_ATTESTATION_POLICY.requireEkmChannelBinding,
    maxQuoteAgeSeconds,
    expectedAppCompose,
  }
}

function parseModelRoutingPolicy(row: UserModelBackendRow | null): ModelRoutingPolicy {
  if (!row) {
    return {
      mode: DEFAULT_MODEL_MODE,
      allowRemoteProviders: false,
      allowedRemoteProviders: [],
      defaultModel: null,
      remoteProvider: null,
      remoteBaseUrl: null,
    }
  }

  const metadata = asRecord(row.metadata)
  const allowedRemoteProviders = toStringArray(metadata?.allowedRemoteProviders)
  const defaultModel = typeof metadata?.defaultModel === "string" ? metadata.defaultModel.trim() : null

  return {
    mode: row.mode,
    allowRemoteProviders: row.mode !== "local" && row.enabled,
    allowedRemoteProviders,
    defaultModel: defaultModel && defaultModel.length > 0 ? defaultModel : row.remote_model,
    remoteProvider: row.remote_provider,
    remoteBaseUrl: row.remote_base_url,
  }
}

function normalizedOrigin(input: string | null | undefined) {
  if (!input) return null
  try {
    const url = new URL(input)
    return `${url.protocol}//${url.host}`.toLowerCase()
  } catch {
    return null
  }
}

function buildModelPolicyFromProvisionInput(mode?: string): ModelBackendMode {
  if (mode === "local" || mode === "remote" || mode === "hybrid") {
    return mode
  }
  return DEFAULT_MODEL_MODE
}

function shouldUseDevSchemaFallback(message: string | undefined, code: string | undefined) {
  if (!DEV_SCHEMA_FALLBACK_ENABLED) {
    return false
  }
  if (code === "PGRST205") {
    return true
  }
  const normalized = (message ?? "").toLowerCase()
  return (
    normalized.includes("could not find the table 'public.user_cvm_assignments'") ||
    normalized.includes("could not find the table 'public.cvm_instances'") ||
    normalized.includes("could not find the table 'public.user_model_backends'") ||
    normalized.includes("could not find the table 'public.user_passkeys'") ||
    normalized.includes("relation \"public.user_cvm_assignments\" does not exist") ||
    normalized.includes("relation \"public.cvm_instances\" does not exist") ||
    normalized.includes("relation \"public.user_model_backends\" does not exist") ||
    normalized.includes("relation \"public.user_passkeys\" does not exist")
  )
}

function inferOwnerUserHandleHash(passkeys: Pick<UserPasskeyRow, "user_handle_hash">[]): string | null {
  const unique = Array.from(
    new Set(
      passkeys
        .map((passkey) => (typeof passkey.user_handle_hash === "string" ? passkey.user_handle_hash.trim() : ""))
        .filter((hash) => hash.length > 0),
    ),
  )

  if (unique.length === 0) return null
  if (unique.length > 1) {
    throw new Error("Passkey user_handle_hash values are inconsistent across enrolled credentials.")
  }
  return unique[0] ?? null
}

function buildExpectedAppCompose(ownerKeysetHash: string | null, ownerUserHandleHash: string | null) {
  if (!ownerKeysetHash) {
    return null
  }

  const appComposeSha256 = computeExpectedComposeHash({
    ownerKeysetHash,
    ownerPolicyVersion: DEFAULT_OWNER_POLICY_VERSION,
    ownerUserHandleHash,
  })

  return {
    appComposeSha256,
    ownerPolicyVersion: DEFAULT_OWNER_POLICY_VERSION,
    ownerKeysetHash,
    ownerUserHandleHash,
  }
}

function parseMinOwnerPasskeys() {
  if (Number.isFinite(MIN_OWNER_PASSKEYS) && MIN_OWNER_PASSKEYS >= 1) {
    return Math.floor(MIN_OWNER_PASSKEYS)
  }
  return 1
}

function isMissingUserPasskeysTable(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false
  if (error.code === "PGRST205") {
    return (error.message ?? "").includes("public.user_passkeys")
  }
  const normalized = (error.message ?? "").toLowerCase()
  return normalized.includes("public.user_passkeys") || normalized.includes('relation "public.user_passkeys"')
}

function buildDevFallbackAssignment(userId: string): UserCvmAssignment {
  const baseUrl = (
    process.env.PRIVATE_AGENT_DEFAULT_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_PROVIDER_BASE_URL?.trim() ||
    "https://localhost"
  ).replace(/\/+$/, "")
  const defaultModel =
    process.env.NEXT_PUBLIC_PROVIDER_MODEL?.trim() ||
    DEFAULT_REMOTE_MODEL

  return {
    userId,
    cvmId: DEV_FALLBACK_CVM_ID,
    baseUrl,
    state: "ready",
    attestationPolicy: DEFAULT_ATTESTATION_POLICY,
    modelRoutingPolicy: {
      mode: "local",
      allowRemoteProviders: false,
      allowedRemoteProviders: [],
      defaultModel: defaultModel.length > 0 ? defaultModel : null,
      remoteProvider: null,
      remoteBaseUrl: null,
    },
  }
}

function fallbackFromSchemaError(userId: string, context: string, error: { message?: string; code?: string }) {
  if (!shouldUseDevSchemaFallback(error.message, error.code)) {
    return null
  }
  console.warn(
    `[control-plane] ${context}: Supabase CVM tables are missing; using local dev fallback assignment. ` +
      "Apply frontend/supabase/schema.sql to your Supabase project to disable fallback.",
  )
  return buildDevFallbackAssignment(userId)
}

function parseAtlasPolicyJson(raw: string, envName: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid JSON"
    throw new Error(`${envName} must be valid JSON (${message}).`)
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${envName} must be a JSON object.`)
  }
  return parsed as Record<string, unknown>
}

function buildConnectionPolicy(): CvmManifest["connectionPolicy"] {
  const atlasProxyUrl = process.env.CVM_ATLAS_PROXY_URL?.trim() || process.env.NEXT_PUBLIC_ATLAS_PROXY_URL?.trim() || ""
  const atlasPolicyRaw = process.env.CVM_ATLAS_POLICY_JSON?.trim() || ""
  const forcedMode = process.env.CVM_CONNECTION_MODE?.trim()
  const mustRequireAtlas = process.env.NODE_ENV === "production" || forcedMode === "atlas_required"

  if (!mustRequireAtlas) {
    return {
      mode: "local_dev_non_attested",
      atlasProxyUrl: null,
      atlasPolicy: null,
    }
  }

  if (!atlasProxyUrl) {
    throw new Error("CVM_ATLAS_PROXY_URL is required when Atlas is mandatory.")
  }
  if (!atlasPolicyRaw) {
    throw new Error("CVM_ATLAS_POLICY_JSON is required when Atlas is mandatory.")
  }

  return {
    mode: "atlas_required",
    atlasProxyUrl,
    atlasPolicy: parseAtlasPolicyJson(atlasPolicyRaw, "CVM_ATLAS_POLICY_JSON"),
  }
}

export async function getUserCvmAssignment(userId: string): Promise<UserCvmAssignment | null> {
  const service = createSupabaseServiceRoleClient() as any

  const assignmentResp = await service
    .from("user_cvm_assignments")
    .select("user_id,cvm_instance_id")
    .eq("user_id", userId)
    .maybeSingle()

  if (assignmentResp.error) {
    const fallback = fallbackFromSchemaError(userId, "getUserCvmAssignment", assignmentResp.error)
    if (fallback) {
      return fallback
    }
    throw new Error(`Failed to fetch CVM assignment: ${assignmentResp.error.message}`)
  }

  const assignment = assignmentResp.data as { user_id: string; cvm_instance_id: string } | null
  if (!assignment) {
    return null
  }

  const instanceResp = await service
    .from("cvm_instances")
    .select("*")
    .eq("id", assignment.cvm_instance_id)
    .maybeSingle()

  if (instanceResp.error) {
    const fallback = fallbackFromSchemaError(userId, "fetchCvmInstance", instanceResp.error)
    if (fallback) {
      return fallback
    }
    throw new Error(`Failed to fetch CVM instance: ${instanceResp.error.message}`)
  }

  const instance = instanceResp.data as CvmInstanceRow | null
  if (!instance) {
    return null
  }

  const backendResp = await service
    .from("user_model_backends")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle()

  if (backendResp.error) {
    const fallback = fallbackFromSchemaError(userId, "fetchModelBackend", backendResp.error)
    if (fallback) {
      return fallback
    }
    throw new Error(`Failed to fetch model backend policy: ${backendResp.error.message}`)
  }

  const backend = (backendResp.data as UserModelBackendRow | null) ?? null

  return {
    userId: assignment.user_id,
    cvmId: assignment.cvm_instance_id,
    baseUrl: instance.base_url,
    state: instance.state,
    attestationPolicy: parseAttestationPolicy(instance.attestation_policy),
    modelRoutingPolicy: parseModelRoutingPolicy(backend),
  }
}

export function buildDevFallbackManifest(userId: string): CvmManifest {
  const assignment = buildDevFallbackAssignment(userId)
  const connectionPolicy = buildConnectionPolicy()
  return {
    cvmId: assignment.cvmId,
    baseUrl: assignment.baseUrl,
    expiresAt: null,
    attestationPolicy: assignment.attestationPolicy,
    connectionPolicy,
    openclaw: {
      responsesPath: "/v1/responses",
      toolsPath: "/tools/invoke",
    },
    modelRoutingPolicy: assignment.modelRoutingPolicy,
  }
}

export async function buildCvmManifestForUser(params: { userId: string }): Promise<CvmManifest> {
  const assignment = await getUserCvmAssignment(params.userId)
  if (!assignment) {
    throw new Error("No CVM assignment found for this user")
  }

  if (assignment.state !== "ready") {
    throw new Error(`CVM is not ready (state=${assignment.state})`)
  }

  logAuditEvent("cvm.manifest_issued", {
    userId: params.userId,
    cvmId: assignment.cvmId,
    mode: assignment.modelRoutingPolicy.mode,
  })

  return {
    cvmId: assignment.cvmId,
    baseUrl: assignment.baseUrl,
    expiresAt: null,
    attestationPolicy: assignment.attestationPolicy,
    connectionPolicy: buildConnectionPolicy(),
    openclaw: {
      responsesPath: "/v1/responses",
      toolsPath: "/tools/invoke",
    },
    modelRoutingPolicy: assignment.modelRoutingPolicy,
  }
}

function sanitizeSlugComponent(raw: string) {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 16)
}

export async function provisionCvmForUser(params: {
  userId: string
  baseUrl?: string
  mode?: string
}): Promise<{
  assignment: UserCvmAssignment
  created: boolean
}> {
  const existing = await getUserCvmAssignment(params.userId)
  if (existing) {
    return { assignment: existing, created: false }
  }

  const service = createSupabaseServiceRoleClient() as any
  const minOwnerPasskeys = parseMinOwnerPasskeys()

  let ownerPasskeys: UserPasskeyRow[] = []
  const passkeysResp = await service
    .from("user_passkeys")
    .select("id,user_id,credential_id_b64url,public_key_cose_b64url,user_handle_hash,metadata,created_at,updated_at")
    .eq("user_id", params.userId)

  if (passkeysResp.error) {
    if (!isMissingUserPasskeysTable(passkeysResp.error)) {
      throw new Error(`Failed to fetch user passkeys: ${passkeysResp.error.message}`)
    }
    if (ENFORCE_PASSKEY_ENROLLMENT) {
      throw new Error(
        "Passkey enrollment table is missing. Apply frontend/supabase/schema.sql before provisioning CVMs.",
      )
    }
  } else {
    ownerPasskeys = (passkeysResp.data as UserPasskeyRow[] | null) ?? []
  }

  if (ENFORCE_PASSKEY_ENROLLMENT && ownerPasskeys.length < minOwnerPasskeys) {
    throw new Error(
      `At least ${minOwnerPasskeys} passkeys must be enrolled before provisioning a user CVM.`,
    )
  }

  const ownerKeysetHash = ownerPasskeys.length > 0 ? computeOwnerKeysetHash(ownerPasskeys) : null
  const ownerUserHandleHash = ownerPasskeys.length > 0 ? inferOwnerUserHandleHash(ownerPasskeys) : null
  const expectedAppCompose = buildExpectedAppCompose(ownerKeysetHash, ownerUserHandleHash)

  const defaultBaseUrl = process.env.PRIVATE_AGENT_DEFAULT_BASE_URL?.trim()
  const domain = process.env.PRIVATE_AGENT_BASE_DOMAIN?.trim() || "cvm.local"
  const slug = `user-${sanitizeSlugComponent(params.userId)}-${randomUUID().slice(0, 8)}`
  const baseUrl = params.baseUrl?.trim() || defaultBaseUrl || `https://${slug}.${domain}`

  const instanceInsertResp = await service
    .from("cvm_instances")
    .insert({
      slug,
      base_url: baseUrl,
      state: "ready",
      provider: "phala",
      attestation_policy: {
        ...DEFAULT_ATTESTATION_POLICY,
        expectedAppCompose,
      },
      endpoint_metadata: {
        provisionedBy: "control-plane-api",
        provisionedAt: new Date().toISOString(),
        ownerCredentialIds: ownerPasskeys.map((passkey) => passkey.credential_id_b64url),
        ...(ownerUserHandleHash ? { ownerUserHandleHash } : {}),
      },
    })
    .select("*")
    .single()

  if (instanceInsertResp.error) {
    throw new Error(`Failed to create CVM instance: ${instanceInsertResp.error.message}`)
  }

  const instance = instanceInsertResp.data as CvmInstanceRow

  const assignmentResp = await service
    .from("user_cvm_assignments")
    .insert({
      user_id: params.userId,
      cvm_instance_id: instance.id,
    })
    .select("user_id,cvm_instance_id")
    .single()

  if (assignmentResp.error) {
    await service.from("cvm_instances").delete().eq("id", instance.id)
    throw new Error(`Failed to assign user to CVM: ${assignmentResp.error.message}`)
  }

  const mode = buildModelPolicyFromProvisionInput(params.mode)
  const backendUpsertResp = await service.from("user_model_backends").upsert(
    {
      user_id: params.userId,
      mode,
      enabled: mode !== "local",
      remote_provider: mode !== "local" ? DEFAULT_REMOTE_PROVIDER : null,
      remote_model: mode !== "local" ? DEFAULT_REMOTE_MODEL : null,
      remote_base_url: mode !== "local" ? DEFAULT_REMOTE_BASE_URL : null,
      metadata: {},
    },
    { onConflict: "user_id" },
  )

  if (backendUpsertResp.error) {
    throw new Error(`Failed to upsert model backend policy: ${backendUpsertResp.error.message}`)
  }

  const assignment: UserCvmAssignment = {
    userId: params.userId,
    cvmId: instance.id,
    baseUrl: instance.base_url,
    state: instance.state,
    attestationPolicy: parseAttestationPolicy(instance.attestation_policy),
    modelRoutingPolicy: {
      mode,
      allowRemoteProviders: mode !== "local",
      allowedRemoteProviders: [],
      defaultModel: mode !== "local" ? DEFAULT_REMOTE_MODEL : null,
      remoteProvider: mode !== "local" ? DEFAULT_REMOTE_PROVIDER : null,
      remoteBaseUrl: mode !== "local" ? DEFAULT_REMOTE_BASE_URL : null,
    },
  }

  return { assignment, created: true }
}
