import type { VaultStatus } from "./types"

type VaultFetchOptions = {
  fetchImpl?: typeof fetch
}

async function vaultFetch<T>(
  baseUrl: string,
  path: string,
  options?: { method?: string; body?: unknown; fetchImpl?: typeof fetch },
): Promise<T> {
  const method = options?.method ?? "GET"
  const fetchFn = options?.fetchImpl ?? fetch
  const headers: Record<string, string> = {}
  const init: RequestInit = { method, headers }
  if (options?.body !== undefined) {
    headers["Content-Type"] = "application/json"
    init.body = JSON.stringify(options.body)
  }

  const target = baseUrl ? `${baseUrl}${path}` : path
  const response = await fetchFn(target, init)
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message =
      typeof payload?.detail === "string" ? payload.detail : `Vault request failed (${response.status})`
    throw new Error(message)
  }

  return payload as T
}

export async function fetchVaultStatus(baseUrl: string, options?: VaultFetchOptions): Promise<VaultStatus> {
  return vaultFetch<VaultStatus>(baseUrl, "/vault/status", { fetchImpl: options?.fetchImpl })
}

export async function lockVault(
  baseUrl: string,
  vaultSessionId: string,
  options?: VaultFetchOptions,
): Promise<{ status: string }> {
  return vaultFetch(baseUrl, "/vault/lock", {
    method: "POST",
    body: { session_id: vaultSessionId },
    fetchImpl: options?.fetchImpl,
  })
}
