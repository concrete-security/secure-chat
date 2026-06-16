import { NextResponse } from "next/server"

import { AuthenticatedAccessError, requireBetaUser } from "@/lib/auth"
import { buildCvmManifestForUser, buildDevFallbackManifest } from "@/lib/apps/agents/control-plane"
import { CrossOriginRequestError, ensureSameOrigin } from "@/lib/security/origin"
import { getClientIp } from "@/lib/security/request"
import { enforceRateLimit, RateLimitError } from "@/lib/security/rate-limit"
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
    let userId: string
    const clientIp = getClientIp(request)
    const client = await createSupabaseServerClient()
    const user = await requireBetaUser(client)
    userId = user.id

    try {
      await enforceRateLimit(`cvm:manifest:${userId}:${clientIp}`, 30, 60_000)
    } catch (error) {
      if (error instanceof RateLimitError) {
        return NextResponse.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(error.retryAfter) } })
      }
      throw error
    }

    let manifest
    try {
      manifest = await buildCvmManifestForUser({ userId })
    } catch (buildError) {
      const msg = buildError instanceof Error ? buildError.message : ""
      if (msg.includes("No CVM assignment") && process.env.CVM_AUTO_PROVISION_ON_MANIFEST === "true") {
        manifest = buildDevFallbackManifest(userId)
      } else {
        throw buildError
      }
    }

    return NextResponse.json(manifest)
  } catch (error) {
    if (error instanceof AuthenticatedAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : "Failed to build CVM manifest"
    const status = message.includes("No CVM assignment") ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
