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

export function OwnerAuthDialog() {
  const { ownerStatus, passkeyStatus, ownerAuthBusy, ownerAuthError, vaultError, manifest, handleOwnerAuth } =
    useWorkspace()

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
        </div>
      </DialogContent>
    </Dialog>
  )
}
