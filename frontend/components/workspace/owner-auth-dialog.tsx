"use client"

import { Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useWorkspace } from "./workspace-provider"

function formatDate(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString()
}

export function OwnerAuthDialog() {
  const {
    ownerStatus,
    passkeyStatus,
    ownerAuthBusy,
    ownerAuthError,
    vaultError,
    passkeyError,
    passkeyNotice,
    manifest,
    passkeyEnrollBusy,
    passkeyResetBusy,
    handleOwnerAuth,
    handleEnrollPasskey,
    handleResetPasskeys,
  } = useWorkspace()

  const isClaimed = ownerStatus?.claimed
  const minPasskeys = passkeyStatus?.minRequired ?? 1
  const passkeyLabel = minPasskeys === 1 ? "passkey is" : "passkeys are"

  return (
    <Dialog open>
      <DialogContent
        className="sm:max-w-md [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">
            {isClaimed ? "Unlock Workspace" : "Claim Workspace"}
          </DialogTitle>
          <DialogDescription className="text-center break-words">
            {isClaimed
              ? "Authenticate with a registered passkey to unlock your owner session."
              : `Claim this vault with a registered passkey. At least ${minPasskeys} enrolled ${passkeyLabel} required.`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {passkeyStatus ? (
            <div className="rounded-md border border-border/70 bg-muted/30 p-3">
              <p className="text-xs font-medium text-foreground">
                Registered passkeys: {passkeyStatus.count}/{passkeyStatus.minRequired}
              </p>
              {passkeyStatus.passkeys.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {passkeyStatus.passkeys.map((pk) => (
                    <li key={pk.id} className="text-xs text-muted-foreground font-mono">
                      {pk.credentialIdB64Url.slice(0, 12)}... · {formatDate(pk.createdAt)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">No passkeys enrolled on this account yet.</p>
              )}
            </div>
          ) : null}
          {passkeyNotice ? <p className="text-sm text-center text-emerald-600 dark:text-emerald-400">{passkeyNotice}</p> : null}
          {passkeyError ? <p className="text-sm text-center text-destructive break-words">{passkeyError}</p> : null}
          {ownerAuthError ? <p className="text-sm text-center text-destructive break-words">{ownerAuthError}</p> : null}
          {vaultError ? <p className="text-sm text-center text-destructive break-words">{vaultError}</p> : null}
          {ownerStatus?.owner_keyset_hash ? (
            <p className="text-center text-xs text-muted-foreground font-mono break-all">
              Owner keyset: {ownerStatus.owner_keyset_hash}
            </p>
          ) : null}
          <Button onClick={() => void handleOwnerAuth()} disabled={ownerAuthBusy || !manifest} className="w-full">
            {ownerAuthBusy
              ? "Waiting for passkey..."
              : isClaimed
                ? "Unlock with Passkey"
                : "Claim with Passkey"}
          </Button>
          <Button
            variant="outline"
            onClick={() => void handleEnrollPasskey()}
            disabled={ownerAuthBusy || passkeyEnrollBusy}
            className="w-full"
          >
            {passkeyEnrollBusy ? "Waiting for passkey..." : "Add Passkey"}
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              const confirmed = window.confirm(
                "Remove all registered passkeys for this account? If your CVM was provisioned with old passkeys, you may need to redeploy after re-enrolling.",
              )
              if (!confirmed) return
              void handleResetPasskeys()
            }}
            disabled={ownerAuthBusy || passkeyEnrollBusy || passkeyResetBusy}
            className="w-full"
          >
            {passkeyResetBusy ? "Resetting passkeys..." : "Reset Passkeys"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
