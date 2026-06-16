import { redirect } from "next/navigation"
import {
  getAuthUser,
  hasRole,
  getRequiredBetaRole,
  isPlaywrightAuthBypassEnabled,
} from "@/lib/auth"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import PersonalAgentsWaitlistContent from "./waitlist-content"

export default async function AgentsWaitlistPage() {
  let shouldRedirect = false

  try {
    if (!isPlaywrightAuthBypassEnabled()) {
      const client = await createSupabaseServerClient()
      const user = await getAuthUser(client)
      if (user && hasRole(user, getRequiredBetaRole())) {
        shouldRedirect = true
      }
    }
  } catch {
    // Ignore auth errors — show the waitlist page
  }

  if (shouldRedirect) {
    redirect("/agents")
  }

  return <PersonalAgentsWaitlistContent />
}
