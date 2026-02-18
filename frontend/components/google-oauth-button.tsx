"use client"

import type { SupabaseClient } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"

type GoogleOAuthButtonProps = {
  supabase: SupabaseClient | null
  redirectTo?: string
  disabled?: boolean
  className?: string
}

export function GoogleOAuthButton({ supabase, redirectTo, disabled, className }: GoogleOAuthButtonProps) {
  const handleGoogleSignIn = async () => {
    if (!supabase) return
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    // Store the post-auth redirect target in a cookie so the server-side callback
    // can read it. Sending a clean URL (no query params) to Supabase ensures
    // reliable glob matching against the redirect URL allowlist.
    const target = redirectTo ?? "/confidential-ai"
    document.cookie = `auth-redirect=${encodeURIComponent(target)}; path=/; max-age=600; SameSite=Lax`
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${origin}/auth/callback` },
    })
  }

  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled || !supabase}
      onClick={handleGoogleSignIn}
      className={className}
    >
      <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
          fill="#4285F4"
        />
        <path
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          fill="#34A853"
        />
        <path
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z"
          fill="#FBBC05"
        />
        <path
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          fill="#EA4335"
        />
      </svg>
      Continue with Google
    </Button>
  )
}
