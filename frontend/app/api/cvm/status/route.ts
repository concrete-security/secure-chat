import { NextResponse } from "next/server"

import { AuthenticatedAccessError, requireBetaUser } from "@/lib/auth"
import { getUserCvmAssignment } from "@/lib/apps/agents/control-plane"
import { CrossOriginRequestError, ensureSameOrigin } from "@/lib/security/origin"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  try {
    ensureSameOrigin(request)
  } catch (error) {
    if (error instanceof CrossOriginRequestError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  try {
    const client = await createSupabaseServerClient()
    const user = await requireBetaUser(client)

    const assignment = await getUserCvmAssignment(user.id)
    if (!assignment) {
      return NextResponse.json({ error: "No CVM assignment found" }, { status: 404 })
    }

    return NextResponse.json({
      cvmId: assignment.cvmId,
      baseUrl: assignment.baseUrl,
      state: assignment.state,
      attestationPolicy: assignment.attestationPolicy,
      modelRoutingPolicy: assignment.modelRoutingPolicy,
    })
  } catch (error) {
    if (error instanceof AuthenticatedAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : "Failed to fetch CVM status"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
