import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

import type { Database } from "@/lib/supabase/types"

export async function middleware(request: NextRequest) {
  const response = NextResponse.next()
  // CSP and other security headers are set in next.config.mjs

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    if (process.env.NODE_ENV === "production") {
      // Fail closed in production: auth infrastructure must be available
      const pathname = request.nextUrl.pathname
      if (
        pathname.startsWith("/confidential-ai") ||
        pathname.startsWith("/personal-agents/workspace")
      ) {
        return NextResponse.redirect(new URL("/sign-in?auth=required", request.url))
      }
    } else {
      console.warn("Supabase middleware skipped: NEXT_PUBLIC_SUPABASE_URL or ANON key missing.")
    }
    return response
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  try {
    await supabase.auth.getSession()
  } catch (error) {
    console.warn("Supabase middleware session refresh failed:", error)
  }

  const pathname = request.nextUrl.pathname
  if (
    pathname.startsWith("/confidential-ai") ||
    pathname.startsWith("/personal-agents/workspace")
  ) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        const signInUrl = new URL("/sign-in", request.url)
        signInUrl.searchParams.set("redirect", pathname)
        signInUrl.searchParams.set("auth", "required")
        return NextResponse.redirect(signInUrl)
      }
    } catch (error) {
      console.warn("Supabase middleware auth check failed:", error)
      // Fail closed: redirect to sign-in on auth errors
      const signInUrl = new URL("/sign-in", request.url)
      signInUrl.searchParams.set("redirect", pathname)
      signInUrl.searchParams.set("auth", "required")
      return NextResponse.redirect(signInUrl)
    }
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
