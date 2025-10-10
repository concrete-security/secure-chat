"use client"

import { useEffect } from "react"
import { useTheme } from "next-themes"

/**
 * Locks the global theme to light while this component is mounted.
 * Used for marketing surfaces that should not inherit dark styling.
 */
export function ForceLightTheme() {
  const { setTheme } = useTheme()

  useEffect(() => {
    setTheme("light")
  }, [setTheme])

  return null
}
