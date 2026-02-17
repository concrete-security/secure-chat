"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { LogOut, MessageSquare } from "lucide-react"

import { Button } from "@/components/ui/button"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import { isAuthSessionMissingError } from "@/lib/supabase/errors"

type AuthState = "loading" | "signed-in" | "signed-out"

export function NavAuthButton() {
  const router = useRouter()
  const supabase = useMemo(() => {
    try {
      return createSupabaseBrowserClient()
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Supabase nav auth button disabled:", error)
      }
      return null
    }
  }, [])
  const [authState, setAuthState] = useState<AuthState>(supabase ? "loading" : "signed-out")
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const isInitializedRef = useRef(false)

  useEffect(() => {
    if (isInitializedRef.current) {
      return
    }
    const client = supabase
    if (!client) {
      isInitializedRef.current = true
      setAuthState("signed-out")
      return
    }

    const authClient = client as NonNullable<typeof client>
    let mounted = true
    isInitializedRef.current = true

    async function resolveInitialState() {
      try {
        const { data, error } = await authClient.auth.getUser()
        if (!mounted) return
        if (error) {
          if (!isAuthSessionMissingError(error)) {
            console.error("Failed to resolve Supabase user", error)
          }
          setAuthState("signed-out")
          return
        }
        if (data.user) {
          setAuthState("signed-in")
          setUserEmail(data.user.email ?? null)
        } else {
          setAuthState("signed-out")
        }
      } catch (error) {
        console.error("Unexpected error resolving Supabase user", error)
        if (mounted) setAuthState("signed-out")
      }
    }

    void resolveInitialState()

    const {
      data: { subscription },
    } = authClient.auth.onAuthStateChange((_event: string, session: { user: { email?: string } } | null) => {
      if (!mounted) return
      if (session?.user) {
        setAuthState("signed-in")
        setUserEmail(session.user.email ?? null)
      } else {
        setAuthState("signed-out")
        setUserEmail(null)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [supabase])

  useEffect(() => {
    if (!menuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [menuOpen])

  const handleSignOut = useCallback(async () => {
    if (!supabase || isSigningOut) return
    setIsSigningOut(true)
    setMenuOpen(false)
    try {
      await supabase.auth.signOut()
      setAuthState("signed-out")
      setUserEmail(null)
      router.replace("/")
    } catch (error) {
      console.error("Failed to sign out", error)
    } finally {
      setIsSigningOut(false)
    }
  }, [supabase, isSigningOut, router])

  if (authState === "loading") {
    return (
      <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
    )
  }

  if (authState === "signed-in") {
    const initial = userEmail ? userEmail[0].toUpperCase() : "U"
    return (
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary transition hover:bg-primary/30"
          title={userEmail ?? "Account"}
        >
          {initial}
        </button>
        {menuOpen ? (
          <div className="absolute right-0 top-full z-50 mt-2 w-60 rounded-xl border border-border/60 bg-card p-1 shadow-lg">
            <div className="px-3 py-2 text-xs text-muted-foreground truncate">
              {userEmail}
            </div>
            <div className="h-px bg-border/60" />
            <Link
              href="/confidential-ai"
              onClick={() => setMenuOpen(false)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Confidential Chat
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              {isSigningOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <Button
      variant="outline"
      className="h-9 rounded-full border border-primary px-5 text-sm font-medium text-primary transition hover:border-primary/80 hover:text-primary/80"
      asChild
    >
      <Link href="/sign-in">Sign in</Link>
    </Button>
  )
}
