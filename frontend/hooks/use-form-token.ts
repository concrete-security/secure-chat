"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/** Token TTL in milliseconds (should match server-side TOKEN_TTL_MS) */
const TOKEN_TTL_MS = 10 * 60 * 1000
/** Refresh token if it will expire within this buffer (1 minute) */
const EXPIRY_BUFFER_MS = 60 * 1000

type UseFormTokenResult = {
  token: string | null
  loading: boolean
  error: string | null
  /** Refresh the token. Returns the new token or null if refresh failed. */
  refreshToken: () => Promise<string | null>
  /** Check if the token is expired or will expire soon */
  isTokenExpiredOrExpiring: () => boolean
}

export function useFormToken(): UseFormTokenResult {
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fetchedAtRef = useRef<number | null>(null)

  const refreshToken = useCallback(async (): Promise<string | null> => {
    setLoading(true)
    try {
      const response = await fetch("/api/form-token", {
        method: "GET",
        headers: {
          "Cache-Control": "no-store",
        },
      })
      if (!response.ok) {
        throw new Error("Unable to fetch form token")
      }
      const payload = (await response.json().catch(() => ({}))) as { token?: string }
      if (!payload.token) {
        throw new Error("Form token not returned")
      }
      setToken(payload.token)
      fetchedAtRef.current = Date.now()
      setError(null)
      return payload.token
    } catch (err) {
      console.error("Form token fetch failed", err)
      setToken(null)
      fetchedAtRef.current = null
      setError("Secure form token unavailable. Please refresh the page.")
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const isTokenExpiredOrExpiring = useCallback(() => {
    if (!token || fetchedAtRef.current === null) {
      return true
    }
    const elapsed = Date.now() - fetchedAtRef.current
    return elapsed > TOKEN_TTL_MS - EXPIRY_BUFFER_MS
  }, [token])

  useEffect(() => {
    void refreshToken()
  }, [refreshToken])

  return { token, loading, error, refreshToken, isTokenExpiredOrExpiring }
}
