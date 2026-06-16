import { NextResponse } from "next/server"

import { AuthenticatedAccessError, getAuthUser } from "@/lib/auth"
import { getMinOwnerPasskeys } from "@/lib/security/passkey-registration"
import { CrossOriginRequestError, ensureSameOrigin } from "@/lib/security/origin"
import { getClientIp } from "@/lib/security/request"
import { enforceRateLimit, RateLimitError } from "@/lib/security/rate-limit"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"

function isMissingUserPasskeysTable(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false
  if (error.code === "PGRST205") {
    return (error.message ?? "").includes("public.user_passkeys")
  }
  const normalized = (error.message ?? "").toLowerCase()
  return normalized.includes("public.user_passkeys") || normalized.includes('relation "public.user_passkeys"')
}

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
    const user = await getAuthUser(client)
    if (!user) {
      throw new AuthenticatedAccessError("Authentication required", 401)
    }

    const clientIp = getClientIp(request)
    try {
      await enforceRateLimit(`passkeys:status:${user.id}:${clientIp}`, 60, 60_000)
    } catch (error) {
      if (error instanceof RateLimitError) {
        return NextResponse.json(
          { error: error.message },
          { status: 429, headers: { "Retry-After": String(error.retryAfter) } },
        )
      }
      throw error
    }

    const service = createSupabaseServiceRoleClient() as any
    const passkeysResp = await service
      .from("user_passkeys")
      .select("id,credential_id_b64url,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })

    if (passkeysResp.error) {
      if (isMissingUserPasskeysTable(passkeysResp.error)) {
        return NextResponse.json(
          { error: "Passkey enrollment table is missing. Apply frontend/supabase/schema.sql." },
          { status: 500 },
        )
      }
      throw new Error(`Failed to fetch passkeys: ${passkeysResp.error.message}`)
    }

    const passkeys = (passkeysResp.data as Array<{ id: string; credential_id_b64url: string; created_at: string }> | null) ?? []
    const minRequired = getMinOwnerPasskeys()

    return NextResponse.json({
      minRequired,
      count: passkeys.length,
      passkeys: passkeys.map((entry) => ({
        id: entry.id,
        credentialIdB64Url: entry.credential_id_b64url,
        createdAt: entry.created_at,
      })),
    })
  } catch (error) {
    if (error instanceof AuthenticatedAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : "Failed to fetch passkey status"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
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
    const user = await getAuthUser(client)
    if (!user) {
      throw new AuthenticatedAccessError("Authentication required", 401)
    }

    const clientIp = getClientIp(request)
    try {
      await enforceRateLimit(`passkeys:delete:${user.id}:${clientIp}`, 20, 60_000)
    } catch (error) {
      if (error instanceof RateLimitError) {
        return NextResponse.json(
          { error: error.message },
          { status: 429, headers: { "Retry-After": String(error.retryAfter) } },
        )
      }
      throw error
    }

    const requestUrl = new URL(request.url)
    const passkeyId = requestUrl.searchParams.get("passkeyId")?.trim() ?? ""
    const deleteAll = requestUrl.searchParams.get("all")?.trim().toLowerCase() === "true"

    if (!deleteAll && passkeyId.length === 0) {
      return NextResponse.json({ error: "Specify passkeyId or all=true." }, { status: 400 })
    }

    const service = createSupabaseServiceRoleClient() as any
    let deleteQuery = service.from("user_passkeys").delete().eq("user_id", user.id)
    if (!deleteAll) {
      deleteQuery = deleteQuery.eq("id", passkeyId)
    }

    const deleteResp = await deleteQuery.select("id")
    if (deleteResp.error) {
      if (isMissingUserPasskeysTable(deleteResp.error)) {
        return NextResponse.json(
          { error: "Passkey enrollment table is missing. Apply frontend/supabase/schema.sql." },
          { status: 500 },
        )
      }
      throw new Error(`Failed to delete passkeys: ${deleteResp.error.message}`)
    }

    const deleted = (deleteResp.data as Array<{ id: string }> | null) ?? []
    if (!deleteAll && deleted.length === 0) {
      return NextResponse.json({ error: "Passkey not found." }, { status: 404 })
    }

    const countResp = await service
      .from("user_passkeys")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)

    if (countResp.error) {
      if (isMissingUserPasskeysTable(countResp.error)) {
        return NextResponse.json(
          { error: "Passkey enrollment table is missing. Apply frontend/supabase/schema.sql." },
          { status: 500 },
        )
      }
      throw new Error(`Failed to count remaining passkeys: ${countResp.error.message}`)
    }

    return NextResponse.json({
      deletedCount: deleted.length,
      count: countResp.count ?? 0,
    })
  } catch (error) {
    if (error instanceof AuthenticatedAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : "Failed to delete passkeys"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
