import type { SupabaseClient, User } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/types"
import { isAuthSessionMissingError } from "@/lib/supabase/errors"

export const ADMIN_ROLE = "admin"
export const DEFAULT_BETA_ROLE = "beta_user"
const PLAYWRIGHT_BYPASS_USER_ID = "00000000-0000-0000-0000-000000000000"
const PLAYWRIGHT_BYPASS_CREATED_AT = "1970-01-01T00:00:00.000Z"

export class AuthenticatedAccessError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
    this.name = "AuthenticatedAccessError"
  }
}

type TypedSupabaseClient = SupabaseClient<Database>

function buildPlaywrightBypassUser(requiredRole: string): User {
  return {
    id: PLAYWRIGHT_BYPASS_USER_ID,
    email: "playwright-bypass@local.invalid",
    role: "authenticated",
    aud: "authenticated",
    app_metadata: {
      provider: "playwright",
      providers: ["playwright"],
      roles: [requiredRole],
    },
    user_metadata: {},
    identities: [],
    factors: [],
    created_at: PLAYWRIGHT_BYPASS_CREATED_AT,
    updated_at: PLAYWRIGHT_BYPASS_CREATED_AT,
    is_anonymous: false,
  } as User
}

export function isPlaywrightAuthBypassEnabled() {
  if (process.env.NODE_ENV === "production") {
    return false
  }

  const raw =
    process.env.PLAYWRIGHT_AUTH_BYPASS ??
    process.env.NEXT_PUBLIC_PLAYWRIGHT_AUTH_BYPASS ??
    ""

  return raw.trim().toLowerCase() === "true"
}

export function getRequiredBetaRole() {
  const configured = process.env.BETA_REQUIRED_ROLE?.trim()
  return configured && configured.length > 0 ? configured : DEFAULT_BETA_ROLE
}

export function hasRole(user: User, role: string) {
  const target = role.trim().toLowerCase()
  if (!target) return false
  const roles = (user.app_metadata?.roles as string[] | undefined) ?? []
  return roles.some((entry) => entry.trim().toLowerCase() === target)
}

export async function getAuthUser(client: TypedSupabaseClient): Promise<User | null> {
  const { data, error } = await client.auth.getUser()

  if (error) {
    if (isAuthSessionMissingError(error)) {
      return null
    }

    const status = typeof error.status === "number" ? error.status : 500
    throw new AuthenticatedAccessError(error.message, status)
  }

  return data?.user ?? null
}

export async function requireAdminUser(client: TypedSupabaseClient): Promise<User> {
  const user = await getAuthUser(client)

  if (!user) {
    throw new AuthenticatedAccessError("Authentication required", 401)
  }

  if (!hasRole(user, ADMIN_ROLE)) {
    throw new AuthenticatedAccessError("Administrator role required", 403)
  }

  return user
}

export async function requireBetaUser(client: TypedSupabaseClient): Promise<User> {
  const requiredRole = getRequiredBetaRole()
  if (isPlaywrightAuthBypassEnabled()) {
    return buildPlaywrightBypassUser(requiredRole)
  }

  const user = await getAuthUser(client)
  if (!user) {
    throw new AuthenticatedAccessError("Authentication required", 401)
  }

  if (!hasRole(user, requiredRole)) {
    throw new AuthenticatedAccessError("Beta access required", 403)
  }

  return user
}
