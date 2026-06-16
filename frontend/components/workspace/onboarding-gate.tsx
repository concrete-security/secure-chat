"use client"

import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LoadingTransition } from "@/components/loading-transition"
import { useWorkspace } from "./workspace-provider"
import { PasskeyEnrollmentDialog } from "./passkey-enrollment-dialog"
import { OwnerAuthDialog } from "./owner-auth-dialog"

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const {
    manifestLoading,
    manifest,
    manifestError,
    loadManifest,
    passkeyLoading,
    passkeyEnrollmentRequired,
    proofState,
    vaultSessionId,
  } = useWorkspace()

  // Loading state — manifest or passkey status still loading
  if (manifestLoading || passkeyLoading) {
    return <LoadingTransition message="Establishing secure connection..." />
  }

  // Manifest failed to load — show error instead of infinite loading
  if (!manifest && manifestError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Workspace unavailable</h2>
          <p className="text-sm text-muted-foreground">{manifestError}</p>
          <Button variant="outline" onClick={() => void loadManifest()} className="mt-2">
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    )
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
