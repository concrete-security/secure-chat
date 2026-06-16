import { NextResponse } from "next/server"

import { AuthenticatedAccessError, getAuthUser } from "@/lib/auth"
import {
  PasskeyChallengeError,
  getMinOwnerPasskeys,
  getWebAuthnAllowedOrigins,
  verifyPasskeyChallengeToken,
} from "@/lib/security/passkey-registration"
import { assertJsonRequest, CrossOriginRequestError, ensureSameOrigin, UnsupportedContentTypeError } from "@/lib/security/origin"
import { getClientIp } from "@/lib/security/request"
import { enforceRateLimit, RateLimitError } from "@/lib/security/rate-limit"
import {
  parseAttestationObject,
  parseClientData,
  sha256Bytes,
  sha256Hex,
  WebAuthnRegistrationError,
} from "@/lib/security/webauthn-registration"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role"

type VerifyPayload = {
  challengeToken?: unknown
  credential?: {
    credentialIdB64Url?: unknown
    clientDataJsonB64Url?: unknown
    attestationObjectB64Url?: unknown
    transports?: unknown
  }
}

function isMissingUserPasskeysTable(error: { message?: string; code?: string } | null | undefined) {
  if (!error) return false
  if (error.code === "PGRST205") {
    return (error.message ?? "").includes("public.user_passkeys")
  }
  const normalized = (error.message ?? "").toLowerCase()
  return normalized.includes("public.user_passkeys") || normalized.includes('relation "public.user_passkeys"')
}

function normalizeBase64Url(value: string) {
  try {
    return Buffer.from(value, "base64url").toString("base64url")
  } catch {
    throw new WebAuthnRegistrationError("Value is not valid base64url.")
  }
}

function timingSafeBufferEquals(left: Uint8Array | Buffer, right: Uint8Array | Buffer) {
  if (left.length !== right.length) {
    return false
  }
  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index]! ^ right[index]!
  }
  return diff === 0
}

function parseTransports(raw: unknown) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0)
    .slice(0, 8)
}

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request)
    assertJsonRequest(request)
  } catch (error) {
    if (error instanceof CrossOriginRequestError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    if (error instanceof UnsupportedContentTypeError) {
      return NextResponse.json({ error: error.message }, { status: 415 })
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
      await enforceRateLimit(`passkeys:register-verify:${user.id}:${clientIp}`, 30, 60_000)
    } catch (error) {
      if (error instanceof RateLimitError) {
        return NextResponse.json(
          { error: error.message },
          { status: 429, headers: { "Retry-After": String(error.retryAfter) } },
        )
      }
      throw error
    }

    const body = (await request.json()) as VerifyPayload
    const challengeToken = typeof body.challengeToken === "string" ? body.challengeToken.trim() : ""
    const credential = body.credential ?? {}
    const credentialIdB64Url =
      typeof credential.credentialIdB64Url === "string" ? credential.credentialIdB64Url.trim() : ""
    const clientDataJsonB64Url =
      typeof credential.clientDataJsonB64Url === "string" ? credential.clientDataJsonB64Url.trim() : ""
    const attestationObjectB64Url =
      typeof credential.attestationObjectB64Url === "string" ? credential.attestationObjectB64Url.trim() : ""

    if (!challengeToken || !credentialIdB64Url || !clientDataJsonB64Url || !attestationObjectB64Url) {
      return NextResponse.json({ error: "Registration payload is incomplete." }, { status: 400 })
    }

    const challengePayload = verifyPasskeyChallengeToken(challengeToken, user.id)
    const clientData = parseClientData(clientDataJsonB64Url)

    if (clientData.type !== "webauthn.create") {
      return NextResponse.json({ error: "Unexpected WebAuthn ceremony type." }, { status: 400 })
    }

    const clientChallenge = typeof clientData.challenge === "string" ? clientData.challenge : ""
    if (!clientChallenge) {
      return NextResponse.json({ error: "clientDataJSON challenge is missing." }, { status: 400 })
    }

    if (normalizeBase64Url(clientChallenge) !== normalizeBase64Url(challengePayload.challenge_b64url)) {
      return NextResponse.json({ error: "Challenge mismatch." }, { status: 403 })
    }

    const origin = typeof clientData.origin === "string" ? clientData.origin : ""
    const allowedOrigins = getWebAuthnAllowedOrigins(request)
    if (!origin || !allowedOrigins.has(origin.toLowerCase())) {
      return NextResponse.json({ error: "WebAuthn origin mismatch." }, { status: 403 })
    }

    const parsed = parseAttestationObject(attestationObjectB64Url)
    const normalizedCredentialId = normalizeBase64Url(credentialIdB64Url)
    if (normalizeBase64Url(parsed.credentialIdB64Url) !== normalizedCredentialId) {
      return NextResponse.json({ error: "Credential ID mismatch." }, { status: 400 })
    }

    const expectedRpIdHash = sha256Bytes(challengePayload.rp_id)
    if (!timingSafeBufferEquals(parsed.rpIdHash, expectedRpIdHash)) {
      return NextResponse.json({ error: "RP ID hash mismatch." }, { status: 403 })
    }

    const userPresent = (parsed.flags & 0x01) !== 0
    const userVerified = (parsed.flags & 0x04) !== 0
    if (!userPresent || !userVerified) {
      return NextResponse.json({ error: "Passkey registration must be user-verified." }, { status: 403 })
    }

    const service = createSupabaseServiceRoleClient() as any
    const existingResp = await service
      .from("user_passkeys")
      .select("id,user_id,credential_id_b64url,created_at")
      .eq("credential_id_b64url", normalizedCredentialId)
      .maybeSingle()

    if (existingResp.error) {
      if (isMissingUserPasskeysTable(existingResp.error)) {
        return NextResponse.json(
          { error: "Passkey enrollment table is missing. Apply frontend/supabase/schema.sql." },
          { status: 500 },
        )
      }
      throw new Error(`Failed to look up credential: ${existingResp.error.message}`)
    }

    const existing = existingResp.data as
      | { id: string; user_id: string; credential_id_b64url: string; created_at: string }
      | null

    let created = false
    let passkeyId = existing?.id ?? ""
    let createdAt = existing?.created_at ?? ""

    if (existing && existing.user_id !== user.id) {
      return NextResponse.json({ error: "Credential is already enrolled by another user." }, { status: 409 })
    }

    if (!existing) {
      const insertResp = await service
        .from("user_passkeys")
        .insert({
          user_id: user.id,
          credential_id_b64url: normalizedCredentialId,
          public_key_cose_b64url: parsed.credentialPublicKeyCoseB64Url,
          user_handle_hash: sha256Hex(user.id),
          metadata: {
            source: "webauthn.registration",
            signCount: parsed.signCount,
            transports: parseTransports(credential.transports),
            enrolledAt: new Date().toISOString(),
          },
        })
        .select("id,created_at")
        .single()

      if (insertResp.error) {
        if (isMissingUserPasskeysTable(insertResp.error)) {
          return NextResponse.json(
            { error: "Passkey enrollment table is missing. Apply frontend/supabase/schema.sql." },
            { status: 500 },
          )
        }
        throw new Error(`Failed to save passkey: ${insertResp.error.message}`)
      }

      const inserted = insertResp.data as { id: string; created_at: string }
      passkeyId = inserted.id
      createdAt = inserted.created_at
      created = true
    }

    const countResp = await service
      .from("user_passkeys")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)

    if (countResp.error) {
      if (!isMissingUserPasskeysTable(countResp.error)) {
        throw new Error(`Failed to count user passkeys: ${countResp.error.message}`)
      }
    }

    return NextResponse.json({
      created,
      minRequired: getMinOwnerPasskeys(),
      count: countResp.count ?? null,
      passkey: {
        id: passkeyId,
        credentialIdB64Url: normalizedCredentialId,
        createdAt,
      },
    })
  } catch (error) {
    if (error instanceof AuthenticatedAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof PasskeyChallengeError || error instanceof WebAuthnRegistrationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const message = error instanceof Error ? error.message : "Failed to verify passkey registration"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
