import type React from "react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AuthenticatedAccessError, isPlaywrightAuthBypassEnabled, requireBetaUser } from "@/lib/auth"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const metadata: Metadata = {
  title: "Private AI Agents | Umbra",
  description:
    "AI agents that run in verified confidential environments. Your data never leaves unencrypted.",
}

export default async function AgentsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (isPlaywrightAuthBypassEnabled()) {
    return <>{children}</>
  }

  try {
    const client = await createSupabaseServerClient()
    await requireBetaUser(client)
  } catch (error) {
    if (error instanceof AuthenticatedAccessError) {
      if (error.status === 401) {
        redirect("/sign-in?auth=required&redirect=/agents")
      }
      if (error.status === 403) {
        redirect("/agents/waitlist")
      }
    }
    throw error
  }

  return <>{children}</>
}
