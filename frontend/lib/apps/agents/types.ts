import type { CvmInstanceState, ModelBackendMode } from "@/lib/supabase/types"

export type ExpectedAppComposePolicy = {
  appComposeSha256: string | null
  ownerPolicyVersion: string | null
  ownerKeysetHash: string | null
  ownerUserHandleHash: string | null
}

export type AttestationPolicy = {
  allowedTeeTypes: string[]
  allowedMeasurementPrefixes: string[]
  allowedTcbStatuses: string[]
  requireEkmChannelBinding: boolean
  maxQuoteAgeSeconds: number
  expectedAppCompose?: ExpectedAppComposePolicy | null
}

export type ModelRoutingPolicy = {
  mode: ModelBackendMode
  allowRemoteProviders: boolean
  allowedRemoteProviders: string[]
  defaultModel: string | null
  remoteProvider: string | null
  remoteBaseUrl: string | null
}

export type AtlasRequiredConnectionPolicy = {
  mode: "atlas_required"
  atlasProxyUrl: string
  atlasPolicy: Record<string, unknown>
}

export type LocalDevConnectionPolicy = {
  mode: "local_dev_non_attested"
  atlasProxyUrl: null
  atlasPolicy: null
}

export type CvmConnectionPolicy = AtlasRequiredConnectionPolicy | LocalDevConnectionPolicy

export type CvmManifest = {
  cvmId: string
  baseUrl: string
  expiresAt: string | null
  attestationPolicy: AttestationPolicy
  connectionPolicy: CvmConnectionPolicy
  openclaw: {
    responsesPath: string
    toolsPath?: string
  }
  modelRoutingPolicy: ModelRoutingPolicy
}

export type UserCvmAssignment = {
  userId: string
  cvmId: string
  baseUrl: string
  state: CvmInstanceState
  attestationPolicy: AttestationPolicy
  atlasProxyUrl: string | null
  atlasPolicy: Record<string, unknown> | null
  modelRoutingPolicy: ModelRoutingPolicy
}

export type VaultStatus = {
  initialized: boolean
  claimed?: boolean
  unlocked: boolean
  vault_fingerprint: string | null
}

export type OwnerStatus = {
  claimed: boolean
  claim_epoch: number | null
  owner_keyset_hash: string | null
  initialized: boolean
}
