"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { Moon, Sun, Monitor } from "lucide-react"
import { Button } from "@/components/ui/button"

const CYCLE: Array<"dark" | "light" | "system"> = ["dark", "light", "system"]

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 rounded-full text-muted-foreground"
        disabled
      >
        <Moon className="h-4 w-4" />
        <span className="sr-only">Toggle theme</span>
      </Button>
    )
  }

  const current = (theme ?? "dark") as "dark" | "light" | "system"
  const currentIndex = CYCLE.indexOf(current)
  const next = CYCLE[(currentIndex + 1) % CYCLE.length]

  const Icon = current === "dark" ? Moon : current === "light" ? Sun : Monitor

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 rounded-full text-muted-foreground transition hover:text-foreground"
      onClick={() => setTheme(next)}
      title={`Theme: ${current}`}
    >
      <Icon className="h-4 w-4" />
      <span className="sr-only">Toggle theme (currently {current})</span>
    </Button>
  )
}
