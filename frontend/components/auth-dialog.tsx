"use client"

import { useEffect, useMemo, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { CheckCircle2 } from "lucide-react"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { GoogleOAuthButton } from "@/components/google-oauth-button"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import { isAuthSessionMissingError } from "@/lib/supabase/errors"

type AuthDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
  const router = useRouter()
  const { client: supabase, error: supabaseInitError } = useMemo(() => {
    try {
      return {
        client: createSupabaseBrowserClient(),
        error: null,
      }
    } catch (error) {
      const initializationError = error instanceof Error ? error : new Error("Failed to initialize Supabase client")
      if (process.env.NODE_ENV !== "production") {
        console.warn("Supabase auth dialog disabled:", initializationError)
      }
      return { client: null, error: initializationError }
    }
  }, [])

  const [authState, setAuthState] = useState<"checking" | "authenticated" | "unauthenticated">("checking")
  const [signInEmail, setSignInEmail] = useState("")
  const [signInPassword, setSignInPassword] = useState("")
  const [signInConfirmPassword, setSignInConfirmPassword] = useState("")
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin")
  const [signUpSuccess, setSignUpSuccess] = useState(false)
  const [signInLoading, setSignInLoading] = useState(false)
  const [signInError, setSignInError] = useState<string | null>(supabaseInitError?.message ?? null)

  useEffect(() => {
    const client = supabase
    if (!open || !client) {
      setAuthState("unauthenticated")
      return
    }

    const authClient = client as NonNullable<typeof client>
    let mounted = true

    async function checkAuth() {
      try {
        const { data, error } = await authClient.auth.getUser()
        if (!mounted) return
        if (error) {
          if (isAuthSessionMissingError(error)) {
            setAuthState("unauthenticated")
            return
          }
          console.error("Failed to check auth status", error)
          setAuthState("unauthenticated")
          return
        }
        if (data.user) {
          setAuthState("authenticated")
        } else {
          setAuthState("unauthenticated")
        }
      } catch (error) {
        console.error("Unexpected error checking auth", error)
        if (mounted) {
          setAuthState("unauthenticated")
        }
      }
    }

    setAuthState("checking")
    void checkAuth()

    const {
      data: { subscription },
    } = authClient.auth.onAuthStateChange((_event: string, session: { user: unknown } | null) => {
      if (!mounted) return
      if (session?.user) {
        setAuthState("authenticated")
      } else {
        setAuthState("unauthenticated")
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [open, supabase])

  useEffect(() => {
    if (authState === "authenticated") {
      const timer = setTimeout(() => {
        onOpenChange(false)
        router.push("/confidential-ai")
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [authState, onOpenChange, router])

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) {
      setSignInError("Supabase is not configured.")
      return
    }
    setSignInLoading(true)
    setSignInError(null)

    const trimmedEmail = signInEmail.trim().toLowerCase()

    if (authMode === "signup") {
      if (signInPassword !== signInConfirmPassword) {
        setSignInError("Passwords do not match.")
        setSignInLoading(false)
        return
      }
      if (signInPassword.length < 8) {
        setSignInError("Password must be at least 8 characters.")
        setSignInLoading(false)
        return
      }

      try {
        const origin = typeof window !== "undefined" ? window.location.origin : ""
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password: signInPassword,
          options: {
            emailRedirectTo: `${origin}/auth/callback?next=/confidential-ai`,
          },
        })

        if (signUpError) {
          setSignInError(signUpError.message)
          setSignInLoading(false)
          return
        }

        if (data.user && data.user.identities && data.user.identities.length === 0) {
          setSignInError("An account with this email already exists. Try signing in instead.")
          setSignInLoading(false)
          return
        }

        setSignUpSuccess(true)
        setSignInLoading(false)
      } catch (err) {
        console.error("Supabase sign-up failed", err)
        setSignInError(err instanceof Error ? err.message : "Unexpected error creating account")
        setSignInLoading(false)
      }
      return
    }

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: signInPassword,
      })

      if (signInError) {
        setSignInError(signInError.message)
        setSignInLoading(false)
        return
      }
    } catch (err) {
      console.error("Supabase sign-in failed", err)
      setSignInError(err instanceof Error ? err.message : "Unexpected error signing in")
      setSignInLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-2xl font-semibold text-foreground">
            <Image src="/logo.png" alt="Umbra logo" width={32} height={32} className="mix-blend-multiply dark:mix-blend-normal dark:invert" />
            <span>Get Started</span>
          </DialogTitle>
        </DialogHeader>

        {authState === "checking" ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-muted-foreground">Checking authentication...</div>
          </div>
        ) : authState === "authenticated" ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-brand-primary" />
            <div>
              <p className="text-base font-medium text-foreground">You&apos;re signed in!</p>
              <p className="mt-1 text-sm text-muted-foreground">Redirecting to secure session...</p>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {signInError ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {signInError}
              </div>
            ) : null}

            {!supabase && !signInError ? (
              <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                Supabase environment variables are missing.
              </div>
            ) : null}

            {signUpSuccess ? (
              <div className="rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
                <p className="font-medium">Check your email</p>
                <p className="mt-1 text-xs">We sent a confirmation link to <strong>{signInEmail}</strong>. Click it to activate your account.</p>
              </div>
            ) : (
              <>
                <GoogleOAuthButton
                  supabase={supabase}
                  redirectTo="/confidential-ai"
                  disabled={signInLoading}
                  className="w-full rounded-xl py-3"
                />

                <div className="relative flex items-center gap-4">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="dialog-email" className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                      Email
                    </label>
                    <input
                      id="dialog-email"
                      type="email"
                      value={signInEmail}
                      autoComplete="email"
                      onChange={(event) => setSignInEmail(event.target.value)}
                      required
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm leading-relaxed text-foreground shadow-sm transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="dialog-password" className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                      Password
                    </label>
                    <input
                      id="dialog-password"
                      type="password"
                      value={signInPassword}
                      autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                      onChange={(event) => setSignInPassword(event.target.value)}
                      required
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm leading-relaxed text-foreground shadow-sm transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
                    />
                  </div>
                  {authMode === "signup" ? (
                    <div className="space-y-2">
                      <label htmlFor="dialog-confirm-password" className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                        Confirm Password
                      </label>
                      <input
                        id="dialog-confirm-password"
                        type="password"
                        value={signInConfirmPassword}
                        autoComplete="new-password"
                        onChange={(event) => setSignInConfirmPassword(event.target.value)}
                        required
                        className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm leading-relaxed text-foreground shadow-sm transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
                      />
                    </div>
                  ) : null}
                  <Button
                    type="submit"
                    disabled={signInLoading || !supabase}
                    className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-lg transition hover:bg-primary/90"
                  >
                    {signInLoading
                      ? authMode === "signup" ? "Creating account…" : "Signing in…"
                      : supabase
                        ? authMode === "signup" ? "Create account" : "Sign in"
                        : "Configure Supabase"}
                  </Button>
                </form>

                <p className="text-xs text-muted-foreground">
                  {authMode === "signin" ? (
                    <>
                      Don&apos;t have an account?{" "}
                      <button
                        type="button"
                        onClick={() => { setAuthMode("signup"); setSignInError(null) }}
                        className="font-medium text-primary hover:underline"
                      >
                        Sign up
                      </button>
                    </>
                  ) : (
                    <>
                      Already have an account?{" "}
                      <button
                        type="button"
                        onClick={() => { setAuthMode("signin"); setSignInError(null) }}
                        className="font-medium text-primary hover:underline"
                      >
                        Sign in
                      </button>
                    </>
                  )}
                </p>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
