"use client"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import type { ThemeProviderProps } from "next-themes"
import { useEffect, type ReactNode } from "react"

const MIGRATION_KEY = "theme-migrated-v1"

function ThemeMigration() {
  useEffect(() => {
    try {
      if (typeof window === "undefined") return
      if (localStorage.getItem(MIGRATION_KEY)) return

      const stored = localStorage.getItem("theme")
      if (stored === "light") {
        localStorage.removeItem("theme")
      }
      localStorage.setItem(MIGRATION_KEY, "1")
    } catch {
      // localStorage may be unavailable
    }
  }, [])
  return null
}

type Props = ThemeProviderProps & { children?: ReactNode }

export function ThemeProvider({ children, ...props }: Props) {
  return (
    <NextThemesProvider {...props}>
      <ThemeMigration />
      {children}
    </NextThemesProvider>
  )
}
