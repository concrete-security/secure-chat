"use client"

import { Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"

import { Button } from "@/components/ui/button"
import { GoogleOAuthButton } from "@/components/google-oauth-button"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import { isAuthSessionMissingError } from "@/lib/supabase/errors"

function sanitizeRedirect(redirectParam: string | null) {
  if (!redirectParam) {
    return "/"
  }
  return redirectParam.startsWith("/") ? redirectParam : "/"
}

function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { client: supabase, error: supabaseInitError } = useMemo(() => {
    try {
      return {
        client: createSupabaseBrowserClient(),
        error: null,
      }
    } catch (error) {
      const initializationError = error instanceof Error ? error : new Error("Failed to initialize Supabase client")
      if (process.env.NODE_ENV !== "production") {
        console.warn("Supabase sign-in form disabled:", initializationError)
      }
      return { client: null, error: initializationError }
    }
  }, [])

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin")
  const [signUpSuccess, setSignUpSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(supabaseInitError?.message ?? null)
  const hasRedirectedRef = useRef(false)

  const redirectTo = sanitizeRedirect(searchParams.get("redirect"))

  useEffect(() => {
    let active = true
    async function checkExistingSession() {
      if (!supabase) {
        return
      }
      const { data, error: sessionError } = await supabase.auth.getUser()
      if (!active) {
        return
      }
      if (sessionError) {
        if (isAuthSessionMissingError(sessionError)) {
          return
        }
        console.error("Failed to verify existing Supabase session", sessionError)
        return
      }
      if (data.user) {
        hasRedirectedRef.current = true
        router.replace(redirectTo)
      }
    }

    if (supabase) {
      void checkExistingSession()
    }
    return () => {
      active = false
    }
  }, [redirectTo, router, supabase])

  useEffect(() => {
    if (!supabase) {
      return
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === "SIGNED_IN" && !hasRedirectedRef.current) {
        hasRedirectedRef.current = true
        router.replace(redirectTo)
      }

      if (event === "SIGNED_OUT") {
        hasRedirectedRef.current = false
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [redirectTo, router, supabase])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) {
      setError("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.")
      return
    }
    setLoading(true)
    setError(null)

    const trimmedEmail = email.trim().toLowerCase()

    if (authMode === "signup") {
      if (password !== confirmPassword) {
        setError("Passwords do not match.")
        setLoading(false)
        return
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters.")
        setLoading(false)
        return
      }

      try {
        const origin = typeof window !== "undefined" ? window.location.origin : ""
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
          },
        })

        if (signUpError) {
          setError(signUpError.message)
          setLoading(false)
          return
        }

        if (data.user && data.user.identities && data.user.identities.length === 0) {
          setError("An account with this email already exists. Try signing in instead.")
          setLoading(false)
          return
        }

        setSignUpSuccess(true)
        setLoading(false)
      } catch (err) {
        console.error("Supabase sign-up failed", err)
        setError(err instanceof Error ? err.message : "Unexpected error creating account")
        setLoading(false)
      }
      return
    }

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      })

      if (signInError) {
        setError(signInError.message)
        setLoading(false)
        return
      }
    } catch (err) {
      console.error("Supabase sign-in failed", err)
      setError(err instanceof Error ? err.message : "Unexpected error signing in")
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Ambient glow */}
      <div
        className="pointer-events-none fixed inset-0 opacity-40"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 30% 20%, hsl(var(--accent) / 0.1) 0%, transparent 60%), radial-gradient(ellipse 50% 40% at 70% 80%, hsl(var(--brand-primary) / 0.08) 0%, transparent 50%)",
        }}
      />

      <header className="relative z-10 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="container flex items-center justify-between gap-4 px-6 py-6">
          <Link href="/" className="flex items-center gap-3 text-lg font-semibold tracking-tight">
            <Image src="/logo.png" alt="Umbra logo" width={40} height={40} className="mix-blend-multiply dark:mix-blend-normal dark:invert" />
          </Link>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              className="h-9 rounded-full border border-transparent px-5 text-sm font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
              asChild
            >
              <Link href="/">Back home</Link>
            </Button>
            <Button
              className="hidden h-9 rounded-full border border-primary/60 bg-transparent px-5 text-sm font-medium text-primary transition hover:border-primary hover:bg-primary/10 md:inline-flex"
              asChild
              variant="outline"
            >
              <a href="mailto:contact@concrete-security.com">Contact us</a>
            </Button>
          </div>
        </div>
      </header>
      <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-2xl glass-card p-8 shadow-elevated">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold text-foreground">Get Started</h1>
            <p className="text-sm text-muted-foreground">
              {authMode === "signup"
                ? "Create an account to access your secure workspace."
                : "Sign in to access your secure workspace."}
            </p>
          </div>

          <div className="mt-6 space-y-4">
            {error ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            ) : null}

            {!supabase && !error ? (
              <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                Supabase environment variables are missing. Update `.env.local` with your project credentials.
              </div>
            ) : null}

            {signUpSuccess ? (
              <div className="rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
                <p className="font-medium">Check your email</p>
                <p className="mt-1 text-xs">We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.</p>
              </div>
            ) : (
              <>
                <GoogleOAuthButton
                  supabase={supabase}
                  redirectTo={redirectTo}
                  disabled={loading}
                  className="w-full rounded-xl py-3"
                />

                <div className="relative flex items-center gap-4">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <label htmlFor="email" className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                      Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      autoComplete="email"
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm leading-relaxed text-foreground shadow-sm transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="password" className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                      Password
                    </label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm leading-relaxed text-foreground shadow-sm transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
                    />
                  </div>
                  {authMode === "signup" ? (
                    <div className="space-y-2">
                      <label htmlFor="confirm-password" className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                        Confirm Password
                      </label>
                      <input
                        id="confirm-password"
                        type="password"
                        value={confirmPassword}
                        autoComplete="new-password"
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        required
                        className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm leading-relaxed text-foreground shadow-sm transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
                      />
                    </div>
                  ) : null}
                  <Button
                    type="submit"
                    disabled={loading || !supabase}
                    className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-card transition hover:bg-primary/90"
                  >
                    {loading
                      ? authMode === "signup" ? "Creating account…" : "Signing in…"
                      : supabase
                        ? authMode === "signup" ? "Create account" : "Sign in"
                        : "Configure Supabase"}
                  </Button>
                </form>

                <div className="text-xs text-muted-foreground">
                  {authMode === "signin" ? (
                    <>
                      Don&apos;t have an account?{" "}
                      <button
                        type="button"
                        onClick={() => { setAuthMode("signup"); setError(null) }}
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
                        onClick={() => { setAuthMode("signin"); setError(null) }}
                        className="font-medium text-primary hover:underline"
                      >
                        Sign in
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <header className="border-b border-border/60 bg-background/80 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-xl items-center justify-between px-6 py-5">
            <Link href="/" className="text-lg font-semibold tracking-tight text-foreground">
              Umbra
            </Link>
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
              Back home
            </Link>
          </div>
        </header>
        <main className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-md rounded-2xl glass-card p-8 shadow-elevated">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold text-foreground">Get Started</h1>
              <p className="text-sm text-muted-foreground">
                Sign in to access your secure workspace.
              </p>
            </div>
            <div className="mt-6 flex items-center justify-center">
              <div className="text-sm text-muted-foreground">Loading...</div>
            </div>
          </div>
        </main>
      </div>
    }>
      <SignInForm />
    </Suspense>
  )
}
