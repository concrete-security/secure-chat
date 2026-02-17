"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

type Props = {
  message: string
  ctaHref?: string
  ctaLabel?: string
  storageKey?: string
}

export default function AnnouncementBar({
  message,
  ctaHref,
  ctaLabel,
  storageKey = "announcement:v1",
}: Props) {
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    const dismissed = typeof window !== "undefined" && localStorage.getItem(storageKey) === "1"
    setHidden(!!dismissed)
  }, [storageKey])

  if (hidden) return null

  return (
    <div
      role="region"
      aria-label="Site announcement"
      className="w-full border-b border-accent/15 bg-accent/5 backdrop-blur-sm"
    >
      <div className="relative mx-auto max-w-[1200px] px-6 py-3">
        <div className="flex items-center justify-center gap-3 text-center text-[15px]">
          <span className="text-foreground">{message}</span>
          {ctaHref && ctaLabel && (
            <Link href={ctaHref} className="inline-flex">
              <Button size="sm" className="h-8 px-3">
                {ctaLabel}
              </Button>
            </Link>
          )}
        </div>
        <button
          type="button"
          aria-label="Dismiss announcement"
          onClick={() => {
            localStorage.setItem(storageKey, "1")
            setHidden(true)
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
