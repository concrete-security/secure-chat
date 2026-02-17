"use client"

import { LoadingTransition } from "@/components/loading-transition"
import { useWorkspace } from "./workspace-provider"
import { PasskeyEnrollmentDialog } from "./passkey-enrollment-dialog"
import { OwnerAuthDialog } from "./owner-auth-dialog"

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const {
    manifestLoading,
    manifest,
    passkeyLoading,
    passkeyEnrollmentRequired,
    proofState,
    vaultSessionId,
  } = useWorkspace()

  // Loading state — manifest or passkey status still loading
  if (manifestLoading || passkeyLoading) {
    return <LoadingTransition message="Establishing secure connection..." />
  }

  // Passkey enrollment required — non-dismissible dialog
  if (passkeyEnrollmentRequired) {
    return <PasskeyEnrollmentDialog />
  }

  // Owner auth required — attestation passed but no vault session
  const channelReady =
    proofState.status === "ready" && (proofState.result.verified || proofState.result.localDevNonAttested)
  const needsOwnerAuth = channelReady && !vaultSessionId

  if (needsOwnerAuth) {
    return <OwnerAuthDialog />
  }

  if (!manifest) {
    return <LoadingTransition message="Verifying attestation..." />
  }

  if (proofState.status === "error") {
    return <>{children}</>
  }

  // Attestation still in progress — show loading
  if (!channelReady) {
    return <LoadingTransition message="Verifying attestation..." />
  }

  return <>{children}</>
}
