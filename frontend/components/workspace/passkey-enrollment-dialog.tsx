"use client"

import { KeyRound } from "lucide-react"
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

export function PasskeyEnrollmentDialog() {
  const { passkeyStatus, passkeysSatisfied, passkeyEnrollBusy, passkeyError, passkeyNotice, handleEnrollPasskey } =
    useWorkspace()

  if (!passkeyStatus || passkeysSatisfied) return null

  return (
    <Dialog open>
      <DialogContent
        className="sm:max-w-md [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">Passkey Required</DialogTitle>
          <DialogDescription className="text-center">
            Enroll at least {passkeyStatus.minRequired} passkey{passkeyStatus.minRequired > 1 ? "s" : ""} to
            secure your workspace. You have {passkeyStatus.count} of {passkeyStatus.minRequired} enrolled.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {passkeyStatus.passkeys.length > 0 ? (
            <ul className="space-y-1 text-center">
              {passkeyStatus.passkeys.map((pk) => (
                <li key={pk.id} className="text-xs text-muted-foreground font-mono">
                  {pk.credentialIdB64Url.slice(0, 12)}... · {formatDate(pk.createdAt)}
                </li>
              ))}
            </ul>
          ) : null}
          {passkeyNotice ? <p className="text-sm text-center text-emerald-600 dark:text-emerald-400">{passkeyNotice}</p> : null}
          {passkeyError ? <p className="text-sm text-center text-destructive">{passkeyError}</p> : null}
          <Button onClick={() => void handleEnrollPasskey()} disabled={passkeyEnrollBusy} className="w-full">
            {passkeyEnrollBusy ? "Waiting for passkey..." : "Add Passkey"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
