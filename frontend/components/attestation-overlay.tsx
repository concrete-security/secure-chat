"use client"

import { useEffect, useState } from "react"
import { Shield, Lock, CheckCircle2, Loader2, Server, FileCheck } from "lucide-react"
import { cn } from "@/lib/utils"

type VerificationStep = "connecting" | "fetching" | "verifying" | "complete"

interface AttestationOverlayProps {
  proofStatus: "idle" | "loading" | "ready" | "error" | "unavailable"
  verificationStatus: "idle" | "running" | "success" | "error"
  isVerified: boolean
  onComplete?: () => void
}

const steps: { id: VerificationStep; label: string; description: string; icon: typeof Lock }[] = [
  { id: "connecting", label: "Connecting to protected server", description: "Establishing encrypted connection", icon: Server },
  { id: "fetching", label: "Requesting security proof", description: "Getting cryptographic verification", icon: FileCheck },
  { id: "verifying", label: "Verifying server is secure", description: "Checking hardware protection", icon: Shield },
  { id: "complete", label: "Connection secured", description: "Your session is protected", icon: Lock },
]

export function AttestationOverlay({
  proofStatus,
  verificationStatus,
  isVerified,
  onComplete,
}: AttestationOverlayProps) {
  const [currentStep, setCurrentStep] = useState<VerificationStep>("connecting")
  const [isVisible, setIsVisible] = useState(true)
  const [showSuccess, setShowSuccess] = useState(false)

  // Derive step from actual states
  useEffect(() => {
    if (proofStatus === "idle") {
      setCurrentStep("connecting")
    } else if (proofStatus === "loading") {
      setCurrentStep("fetching")
    } else if (proofStatus === "ready" && verificationStatus === "running") {
      setCurrentStep("verifying")
    } else if (proofStatus === "ready" && verificationStatus === "success" && isVerified) {
      setCurrentStep("complete")
      setShowSuccess(true)
      // Auto-dismiss after success animation
      const timer = setTimeout(() => {
        setIsVisible(false)
        onComplete?.()
      }, 1500)
      return () => clearTimeout(timer)
    } else if (proofStatus === "error" || verificationStatus === "error") {
      // On error, dismiss overlay to show the page with error state
      setIsVisible(false)
      onComplete?.()
    } else if (proofStatus === "unavailable") {
      // If attestation unavailable, dismiss immediately
      setIsVisible(false)
      onComplete?.()
    }
  }, [proofStatus, verificationStatus, isVerified, onComplete])

  if (!isVisible) return null

  const getStepState = (stepId: VerificationStep) => {
    const stepOrder: VerificationStep[] = ["connecting", "fetching", "verifying", "complete"]
    const currentIndex = stepOrder.indexOf(currentStep)
    const stepIndex = stepOrder.indexOf(stepId)

    if (stepIndex < currentIndex) return "complete"
    if (stepIndex === currentIndex) return "active"
    return "pending"
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center",
        "bg-gradient-to-br from-[#E8E7F0] via-[#E2E2E2] to-[#D8D7E8]",
        "transition-opacity duration-500",
        showSuccess && "animate-out fade-out duration-500 fill-mode-forwards delay-1000"
      )}
    >
      <div className="flex flex-col items-center gap-10 px-6">
        {/* Main Shield Icon */}
        <div className="relative">
          {/* Outer glow rings */}
          <div
            className={cn(
              "absolute inset-0 rounded-full transition-all duration-1000",
              showSuccess
                ? "scale-150 bg-emerald-500/20 blur-2xl"
                : "scale-125 bg-[#102A8C]/10 blur-xl animate-pulse"
            )}
          />
          <div
            className={cn(
              "absolute inset-0 rounded-full transition-all duration-700",
              showSuccess
                ? "scale-125 bg-emerald-500/30 blur-lg"
                : "scale-110 bg-[#102A8C]/20 blur-md"
            )}
          />

          {/* Shield container */}
          <div
            className={cn(
              "relative flex size-28 items-center justify-center rounded-full border-2 shadow-2xl transition-all duration-500",
              showSuccess
                ? "border-emerald-500/50 bg-gradient-to-br from-emerald-50 to-emerald-100"
                : "border-[#102A8C]/30 bg-white"
            )}
          >
            {showSuccess ? (
              <CheckCircle2 className="size-14 text-emerald-600 animate-in zoom-in duration-300" />
            ) : (
              <Shield className="size-14 text-[#102A8C] animate-pulse" />
            )}
          </div>
        </div>

        {/* Steps */}
        <div className="flex flex-col gap-3 min-w-[280px]">
          {steps.map((step, index) => {
            const state = getStepState(step.id)
            const Icon = step.icon

            return (
              <div
                key={step.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-4 py-3 transition-all duration-300",
                  state === "active" && "bg-white/80 shadow-sm",
                  state === "complete" && "bg-emerald-50/80",
                  state === "pending" && "opacity-40"
                )}
              >
                <div
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full transition-all duration-300",
                    state === "active" && "bg-[#102A8C]/10",
                    state === "complete" && "bg-emerald-500/20",
                    state === "pending" && "bg-gray-200/50"
                  )}
                >
                  {state === "complete" ? (
                    <CheckCircle2 className="size-4 text-emerald-600" />
                  ) : state === "active" ? (
                    <Loader2 className="size-4 text-[#102A8C] animate-spin" />
                  ) : (
                    <Icon className="size-4 text-gray-400" />
                  )}
                </div>
                <div className="flex flex-col">
                  <span
                    className={cn(
                      "text-sm font-medium transition-colors duration-300",
                      state === "active" && "text-[#102A8C]",
                      state === "complete" && "text-emerald-700",
                      state === "pending" && "text-gray-400"
                    )}
                  >
                    {step.label}
                  </span>
                  {state === "active" && (
                    <span className="text-xs text-[#102A8C]/60 mt-0.5">
                      {step.description}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Success message */}
        {showSuccess && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <p className="text-sm font-semibold text-emerald-700">
              Your session is protected
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
