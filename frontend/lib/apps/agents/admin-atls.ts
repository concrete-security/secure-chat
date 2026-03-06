import { deriveTargetHost } from "@/lib/atlas-client"
import type { CvmManifest } from "./types"

export type AdminAtlsWebSocketConfig = {
  proxyUrl: string
  targetHost: string
  policy: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

export function getAdminAtlsWebSocketConfig(manifest: CvmManifest | null): AdminAtlsWebSocketConfig | null {
  if (!manifest || manifest.connectionPolicy.mode !== "atlas_required") {
    return null
  }

  const { atlasProxyUrl, atlasPolicy } = manifest.connectionPolicy
  if (!atlasProxyUrl || !isRecord(atlasPolicy)) {
    return null
  }

  // If app_compose is stored as a raw JSON string (to preserve key ordering through
  // Supabase JSONB which reorders keys), parse it back to an object for Atlas WASM.
  const resolvedPolicy = { ...atlasPolicy } as Record<string, unknown>
  if (typeof resolvedPolicy.app_compose === "string") {
    try {
      resolvedPolicy.app_compose = JSON.parse(resolvedPolicy.app_compose as string)
    } catch {
      // leave as-is if parsing fails
    }
  }

  return {
    proxyUrl: atlasProxyUrl,
    targetHost: deriveTargetHost(manifest.baseUrl),
    policy: resolvedPolicy,
  }
}
