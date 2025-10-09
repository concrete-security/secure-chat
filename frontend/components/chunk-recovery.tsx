"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

const STORAGE_FLAG = "chunk-recovery:reloaded"

function shouldHandle(error: unknown): boolean {
  if (!error) return false
  const message = typeof error === "string" ? error : typeof error === "object" && "message" in error ? String((error as Error).message) : ""
  if (!message) return false
  return /ChunkLoadError/i.test(message) || /Loading chunk \w+ failed/i.test(message)
}

export function ChunkRecovery() {
  const router = useRouter()

  useEffect(() => {
    router.prefetch?.("/confidential-ai")
  }, [router])

  useEffect(() => {
    const triggerReload = () => {
      if (typeof window === "undefined") return
      try {
        const session = window.sessionStorage
        if (!session) {
          window.location.reload()
          return
        }
        const alreadyReloaded = session.getItem(STORAGE_FLAG)
        if (alreadyReloaded) {
          session.removeItem(STORAGE_FLAG)
          return
        }
        session.setItem(STORAGE_FLAG, "1")
        window.location.reload()
      } catch (error) {
        window.location.reload()
      }
    }

    const errorHandler = (event: ErrorEvent) => {
      if (shouldHandle(event?.error ?? event?.message)) {
        event.preventDefault?.()
        triggerReload()
      }
    }

    const rejectionHandler = (event: PromiseRejectionEvent) => {
      if (shouldHandle(event?.reason)) {
        event.preventDefault?.()
        triggerReload()
      }
    }

    window.addEventListener("error", errorHandler)
    window.addEventListener("unhandledrejection", rejectionHandler)

    return () => {
      window.removeEventListener("error", errorHandler)
      window.removeEventListener("unhandledrejection", rejectionHandler)
    }
  }, [])

  return null
}
