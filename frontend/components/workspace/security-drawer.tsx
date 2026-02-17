"use client"

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"
import { useWorkspace } from "./workspace-provider"

export function SecurityDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const {
    manifest,
    manifestError,
    manifestLoading,
    loadManifest,
    proofState,
    verifyProof,
    vaultStatus,
    ownerStatus,
    vaultFingerprint,
    vaultError,
    vaultSessionId,
    passkeyStatus,
    passkeyLoading,
    passkeyError,
    passkeysSatisfied,
    loadPasskeyStatus,
    connectionMode,
    transportError,
  } = useWorkspace()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Security Details</SheetTitle>
          <SheetDescription>
            Hardware attestation and encryption status for this workspace.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* CVM Manifest */}
          <section>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">CVM Manifest</h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void loadManifest()} disabled={manifestLoading}>
                <RefreshCw className={`h-3.5 w-3.5 ${manifestLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
            {manifestLoading ? <p className="mt-2 text-sm text-muted-foreground">Loading manifest...</p> : null}
            {manifestError ? <p className="mt-2 text-sm text-destructive">{manifestError}</p> : null}
            {manifest ? (
              <dl className="mt-2 space-y-1.5 text-sm">
                <div className="flex gap-2">
                  <dt className="text-muted-foreground shrink-0">CVM</dt>
                  <dd className="font-mono text-xs break-all">{manifest.cvmId}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground shrink-0">Base URL</dt>
                  <dd className="font-mono text-xs break-all">{manifest.baseUrl}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground shrink-0">Expires</dt>
                  <dd className="text-xs">{manifest.expiresAt ?? "N/A"}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground shrink-0">Responses API</dt>
                  <dd className="font-mono text-xs">{manifest.openclaw.responsesPath}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground shrink-0">Routing</dt>
                  <dd className="text-xs">{manifest.modelRoutingPolicy.mode}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground shrink-0">Connection</dt>
                  <dd className="text-xs">{manifest.connectionPolicy.mode}</dd>
                </div>
                {manifest.attestationPolicy.expectedAppCompose?.appComposeSha256 ? (
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground shrink-0">Compose Hash</dt>
                    <dd className="font-mono text-xs break-all">{manifest.attestationPolicy.expectedAppCompose.appComposeSha256}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
            {transportError ? <p className="mt-2 text-sm text-destructive">{transportError}</p> : null}
          </section>

          <Separator />

          {/* Attestation */}
          <section>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Attestation</h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void verifyProof()} disabled={!manifest || proofState.status === "loading"}>
                <RefreshCw className={`h-3.5 w-3.5 ${proofState.status === "loading" ? "animate-spin" : ""}`} />
              </Button>
            </div>
            {proofState.status === "idle" ? (
              <p className="mt-2 text-sm text-muted-foreground">{manifest ? "Loading owner/vault status..." : "Waiting for manifest..."}</p>
            ) : null}
            {proofState.status === "loading" ? (
              <p className="mt-2 text-sm text-muted-foreground">Verifying attestation via Atlas aTLS...</p>
            ) : null}
            {proofState.status === "error" ? <p className="mt-2 text-sm text-destructive">{proofState.error}</p> : null}
            {proofState.status === "ready" ? (
              <div className="mt-2 space-y-1.5 text-sm">
                {proofState.result.localDevNonAttested ? (
                  <p className="text-amber-700 dark:text-amber-300">Local non-attested mode (no TEE evidence)</p>
                ) : (
                  <p className={proofState.result.verified ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
                    {proofState.result.verified ? "Verified and secure" : "Verification failed"}
                  </p>
                )}
                <p className="text-muted-foreground text-xs">Status: {proofState.result.statusText ?? "unknown"}</p>
                <p className="text-muted-foreground text-xs">
                  Channel binding: {proofState.result.channelBindingSatisfied ? "atlas aTLS" : "not attested"}
                </p>
                {ownerStatus ? (
                  <p className="text-muted-foreground text-xs">Owner claimed: {ownerStatus.claimed ? "yes" : "no"}</p>
                ) : null}
                {vaultFingerprint ? (
                  <p className="text-muted-foreground font-mono text-xs">
                    Fingerprint: {vaultFingerprint.slice(0, 8)}...{vaultFingerprint.slice(-8)}
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          <Separator />

          {/* Vault Session */}
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Vault Session</h3>
            {vaultSessionId ? (
              <div className="mt-2 space-y-1.5">
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                  Session active
                  {vaultFingerprint ? ` \u00b7 ${vaultFingerprint.slice(0, 8)}\u2026${vaultFingerprint.slice(-8)}` : ""}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No active session</p>
            )}
            {vaultError ? <p className="mt-2 text-sm text-destructive">{vaultError}</p> : null}
            {ownerStatus?.owner_keyset_hash ? (
              <p className="mt-2 text-xs text-muted-foreground font-mono">Owner keyset: {ownerStatus.owner_keyset_hash}</p>
            ) : null}
          </section>

          <Separator />
          <section>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Passkeys</h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void loadPasskeyStatus()} disabled={passkeyLoading}>
                <RefreshCw className={`h-3.5 w-3.5 ${passkeyLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
            {passkeyLoading ? <p className="mt-2 text-sm text-muted-foreground">Loading...</p> : null}
            {!passkeyLoading && passkeyStatus ? (
              <div className="mt-2 space-y-1.5 text-sm">
                <p className={passkeysSatisfied ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                  Enrolled: {passkeyStatus.count}/{passkeyStatus.minRequired}
                </p>
                {passkeyStatus.passkeys.length > 0 ? (
                  <ul className="space-y-1">
                    {passkeyStatus.passkeys.map((pk) => (
                      <li key={pk.id} className="text-xs text-muted-foreground font-mono">
                        {pk.credentialIdB64Url.slice(0, 12)}... · {pk.createdAt}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            {passkeyError ? <p className="mt-2 text-sm text-destructive">{passkeyError}</p> : null}
          </section>

          {connectionMode === "local_dev_non_attested" ? (
            <>
              <Separator />
              <section className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                Local mode is active. Transport is non-attested because this environment is not running inside a TEE.
              </section>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
