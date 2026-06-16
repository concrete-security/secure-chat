"use client"

import { FormEvent, useCallback, useRef, useState } from "react"
import { MessageSquare } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useFormToken } from "@/hooks/use-form-token"

type FeedbackButtonProps = {
  source: "landing" | "confidential"
  position?: "bottom-right" | "top-right" | "inline"
  label?: string
}

const initialFormState = {
  name: "",
  email: "",
  message: "",
}

export function FeedbackButton({ source, position = "bottom-right", label = "Contact" }: FeedbackButtonProps) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(initialFormState)
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [error, setError] = useState<string | null>(null)
  const honeypotRef = useRef<HTMLInputElement | null>(null)
  const {
    token: formToken,
    loading: formTokenLoading,
    error: formTokenError,
    refreshToken,
    isTokenExpiredOrExpiring,
  } = useFormToken()

  const resetForm = () => {
    setForm(initialFormState)
    setStatus("idle")
    setError(null)
  }

  const submitFeedback = useCallback(
    async (token: string, checkpointValue: string): Promise<Response> => {
      return fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          message: form.message,
          source,
          form_token: token,
          checkpoint: checkpointValue || undefined,
        }),
      })
    },
    [form.email, form.message, form.name, source]
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (status === "loading") return

    const checkpointValue = honeypotRef.current?.value?.trim() ?? ""
    if (checkpointValue.length > 0) {
      setError("Unable to send feedback right now.")
      return
    }

    // If token is missing or expired, get a fresh one before submitting
    let tokenToUse = formToken
    if (!tokenToUse || isTokenExpiredOrExpiring()) {
      const freshToken = await refreshToken()
      if (!freshToken) {
        setError("Secure form token unavailable. Please try again.")
        return
      }
      tokenToUse = freshToken
    }

    setStatus("loading")
    setError(null)

    try {
      let response = await submitFeedback(tokenToUse, checkpointValue)

      // If token expired during submission, retry once with a fresh token
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const errorMessage = payload?.error ?? ""

        if (errorMessage.toLowerCase().includes("expired")) {
          const freshToken = await refreshToken()
          if (freshToken) {
            response = await submitFeedback(freshToken, checkpointValue)
            if (!response.ok) {
              const retryPayload = await response.json().catch(() => null)
              throw new Error(retryPayload?.error ?? "Unable to send feedback right now.")
            }
          } else {
            throw new Error("Unable to refresh security token. Please try again.")
          }
        } else {
          throw new Error(errorMessage || "Unable to send feedback right now.")
        }
      }

      setStatus("success")
      if (honeypotRef.current) {
        honeypotRef.current.value = ""
      }
      void refreshToken()
    } catch (err) {
      console.error("Feedback submission failed", err)
      setStatus("error")
      setError(err instanceof Error ? err.message : "Unable to send feedback right now.")
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen && isTokenExpiredOrExpiring()) {
      // Refresh token when dialog opens if it's expired or expiring soon
      void refreshToken()
    }
    if (!nextOpen && status === "success") {
      resetForm()
    }
  }
  const isInline = position === "inline"

  const placementClass =
    position === "top-right"
      ? "top-[calc(env(safe-area-inset-top,0)+16px)] right-4 sm:right-6 sm:top-[calc(env(safe-area-inset-top,0)+24px)]"
      : source === "confidential"
        ? "bottom-[calc(env(safe-area-inset-bottom,0)+104px)] right-4 sm:bottom-6 sm:right-6"
        : "bottom-[calc(env(safe-area-inset-bottom,0)+20px)] right-4 sm:bottom-6 sm:right-6"

  return (
    <div className={cn(isInline ? "w-full" : "fixed z-20 flex flex-col items-end gap-3 md:z-40", !isInline && placementClass)}>
      <Button
        onClick={() => setOpen(true)}
        className={cn(
          isInline
            ? "h-10 w-full justify-center rounded-xl border border-border/50 bg-card/70 px-3 text-xs font-semibold text-foreground shadow-sm transition hover:bg-card/90"
            : "rounded-full bg-foreground text-sm font-semibold text-background shadow-lg hover:bg-foreground/90",
          !isInline && (source === "confidential" ? "px-4 py-2 text-xs sm:px-5 sm:text-sm" : "px-5 py-2")
        )}
      >
        <MessageSquare className="size-4" />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md border border-border bg-background/95 backdrop-blur p-0 shadow-xl">
          <DialogHeader className="space-y-2 border-b border-border/60 px-6 py-4">
            <DialogTitle className="text-lg font-semibold text-foreground">Contact</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Share what&apos;s working, what&apos;s broken, or what you&apos;d like to see next. Prefer email:{" "}
              <a className="font-medium text-primary underline-offset-2 hover:underline" href="mailto:contact@concrete-security.com">
                contact@concrete-security.com
              </a>
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-5">
            <input
              ref={honeypotRef}
              type="text"
              name="workspace-url"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute h-px w-px opacity-0"
              defaultValue=""
            />
            <label className="text-sm font-medium text-foreground">
              Name (optional)
              <input
                type="text"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-accent focus:outline-none"
                placeholder="Pat from Concrete Security"
                disabled={status === "loading" || status === "success"}
              />
            </label>
            <label className="text-sm font-medium text-foreground">
              Email
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-accent focus:outline-none"
                placeholder="you@company.com"
                required
                disabled={status === "loading" || status === "success"}
              />
            </label>
            <label className="text-sm font-medium text-foreground">
              Message
              <textarea
                value={form.message}
                onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
                className="mt-1 min-h-[120px] w-full rounded-2xl border border-border bg-background px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-accent focus:outline-none"
                placeholder="What should we improve before the public launch?"
                required
                disabled={status === "loading" || status === "success"}
              />
            </label>
            {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
            {formTokenError ? <p className="text-sm font-medium text-warning">{formTokenError}</p> : null}
            {status === "success" ? (
              <p className="rounded-2xl border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
                Thanks for the signal. The team will review it shortly.
              </p>
            ) : null}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">We&apos;ll reply if we need more context.</p>
              <Button
                type="submit"
                className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                disabled={status === "loading" || status === "success" || formTokenLoading || !formToken}
              >
                {status === "loading" ? "Sending…" : status === "success" ? "Sent" : "Send message"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
