import type { ReactNode } from "react"
import { redirect } from "next/navigation"

import { AuthenticatedAccessError, isPlaywrightAuthBypassEnabled, requireBetaUser } from "@/lib/auth"
import { createSupabaseServerClient } from "@/lib/supabase/server"

type WorkspaceLayoutProps = {
  children: ReactNode
}

export default async function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  if (isPlaywrightAuthBypassEnabled()) {
    return <>{children}</>
  }

  try {
    const client = await createSupabaseServerClient()
    await requireBetaUser(client)
  } catch (error) {
    if (error instanceof AuthenticatedAccessError) {
      if (error.status === 401) {
        redirect("/sign-in?auth=required&redirect=/personal-agents/workspace")
      }
      if (error.status === 403) {
        redirect("/personal-agents")
      }
    }
    throw error
  }

  return <>{children}</>
}
