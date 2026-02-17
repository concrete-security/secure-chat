"use client"

import { Shield, Lock, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface LoadingTransitionProps {
  message?: string
  className?: string
}

export function LoadingTransition({ message = "Establishing secure connection...", className }: LoadingTransitionProps) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-md",
        "animate-in fade-in duration-300",
        className
      )}
    >
      <div className="relative flex flex-col items-center gap-6">
        <div
          className="pointer-events-none absolute inset-0 -translate-y-12 opacity-20"
          aria-hidden="true"
          style={{ background: "radial-gradient(circle at center, hsl(var(--primary)) 0%, transparent 70%)" }}
        />
        <div className="relative flex items-center justify-center">
          <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" style={{ animationDuration: "2s" }} />
          <div className="relative flex size-20 items-center justify-center rounded-full border-2 border-primary/30 bg-card shadow-lg">
            <Lock className="size-8 animate-pulse text-primary" />
          </div>
        </div>
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin text-primary" />
            <p className="text-sm font-medium text-muted-foreground">{message}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
            <Shield className="size-3" />
            <span>End-to-end encrypted</span>
          </div>
        </div>
      </div>
    </div>
  )
}
