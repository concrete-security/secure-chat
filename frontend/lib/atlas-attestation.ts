export type AtlasVerificationResult = {
  verified: boolean
  statusText: string | null
  channelBindingSatisfied: boolean
  localDevNonAttested: boolean
}

export function buildAtlasVerifiedResult(): AtlasVerificationResult {
  return {
    verified: true,
    statusText: "ATLAS_VERIFIED",
    channelBindingSatisfied: true,
    localDevNonAttested: false,
  }
}

export function buildLocalDevResult(): AtlasVerificationResult {
  return {
    verified: false,
    statusText: "LOCAL_DEV_NON_ATTESTED",
    channelBindingSatisfied: false,
    localDevNonAttested: true,
  }
}
