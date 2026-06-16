"use client"

import { Shield, ShieldCheck, ShieldAlert, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useWorkspace } from "./workspace-provider"

export function TrustBadge({ onClick }: { onClick?: () => void }) {
  const { securityStatus } = useWorkspace()

  const config = {
    verified: {
      icon: ShieldCheck,
      label: "Verified & Secure",
      className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400 dark:border-emerald-400/20",
    },
    local_dev_non_attested: {
      icon: ShieldAlert,
      label: "Local Non-Attested",
      className: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300 dark:border-amber-300/30",
    },
    verifying: {
      icon: Loader2,
      label: "Verifying...",
      className: "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400 dark:border-amber-400/20",
    },
    error: {
      icon: ShieldAlert,
      label: "Verification Failed",
      className: "bg-destructive/10 text-destructive border-destructive/20",
    },
    idle: {
      icon: Shield,
      label: "Waiting...",
      className: "bg-muted text-muted-foreground border-border",
    },
  }[securityStatus]

  const Icon = config.icon

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:opacity-80",
        config.className,
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", securityStatus === "verifying" && "animate-spin")} />
      <span className="hidden sm:inline">{config.label}</span>
    </button>
  )
}
