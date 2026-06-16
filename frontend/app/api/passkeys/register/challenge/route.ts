import { NextResponse } from "next/server"

import { AuthenticatedAccessError, getAuthUser } from "@/lib/auth"
import {
  getMinOwnerPasskeys,
  getWebAuthnRpId,
  getWebAuthnRpName,
  issuePasskeyChallengeToken,
} from "@/lib/security/passkey-registration"
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

function toBase64Url(raw: Uint8Array) {
  return Buffer.from(raw).toString("base64url")
}

export async function POST(request: Request) {
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
      await enforceRateLimit(`passkeys:register-challenge:${user.id}:${clientIp}`, 20, 60_000)
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
      .select("credential_id_b64url")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })

    if (passkeysResp.error) {
      if (isMissingUserPasskeysTable(passkeysResp.error)) {
        return NextResponse.json(
          { error: "Passkey enrollment table is missing. Apply frontend/supabase/schema.sql." },
          { status: 500 },
        )
      }
      throw new Error(`Failed to read existing passkeys: ${passkeysResp.error.message}`)
    }

    const existingCredentialIds =
      ((passkeysResp.data as Array<{ credential_id_b64url: string }> | null) ?? []).map(
        (entry) => entry.credential_id_b64url,
      )

    const rpId = getWebAuthnRpId(request)
    const { challengeToken, challengeB64Url, expiresAt } = issuePasskeyChallengeToken({
      userId: user.id,
      rpId,
    })

    const userIdBytes = new TextEncoder().encode(user.id)
    const userName = user.email ?? user.id
    const displayName = user.user_metadata?.full_name ?? user.user_metadata?.name ?? userName

    return NextResponse.json({
      challengeToken,
      expiresAt,
      minRequired: getMinOwnerPasskeys(),
      currentCount: existingCredentialIds.length,
      publicKey: {
        challengeB64Url,
        rp: {
          id: rpId,
          name: getWebAuthnRpName(),
        },
        user: {
          idB64Url: toBase64Url(userIdBytes),
          name: userName,
          displayName: String(displayName),
        },
        timeoutMs: 120_000,
        pubKeyCredParams: [
          { type: "public-key", alg: -7 }, // ES256
          { type: "public-key", alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "required",
        },
        attestation: "none",
        excludeCredentials: existingCredentialIds.map((credentialIdB64Url) => ({
          type: "public-key",
          credentialIdB64Url,
        })),
      },
    })
  } catch (error) {
    if (error instanceof AuthenticatedAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : "Failed to create passkey challenge"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
