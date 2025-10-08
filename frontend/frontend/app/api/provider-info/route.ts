import { NextResponse } from "next/server"

type ProviderInfoResponse = {
  baseUrl?: string
  host?: string
  displayName?: string
  model?: string
}

export function GET() {
  const baseUrl = optionalEnv(process.env.VLLM_BASE_URL) ?? optionalEnv(process.env.NEXT_PUBLIC_VLLM_BASE_URL)
  const model = optionalEnv(process.env.VLLM_MODEL) ?? optionalEnv(process.env.NEXT_PUBLIC_VLLM_MODEL)
  const displayName =
    optionalEnv(process.env.NEXT_PUBLIC_VLLM_PROVIDER_NAME) ??
    optionalEnv(process.env.VLLM_PROVIDER_NAME) ??
    model ??
    undefined

  const sanitizedBaseUrl = sanitizeBaseUrl(baseUrl)
  const host = extractHost(sanitizedBaseUrl ?? baseUrl)

  const payload: ProviderInfoResponse = {}
  if (sanitizedBaseUrl) payload.baseUrl = sanitizedBaseUrl
  if (host) payload.host = host
  if (displayName) payload.displayName = displayName
  if (model) payload.model = model

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  })
}

function optionalEnv(value: string | undefined) {
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function sanitizeBaseUrl(value: string | null | undefined) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    url.username = ""
    url.password = ""
    url.hash = ""
    url.search = ""
    return url.toString()
  } catch {
    return value
  }
}

function extractHost(value: string | null | undefined) {
  if (!value) return undefined
  try {
    return new URL(value).host
  } catch {
    return undefined
  }
}
