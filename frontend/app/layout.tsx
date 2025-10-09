import type React from "react"
import "@/styles/globals.css"
import type { Metadata } from "next"
import { ThemeProvider } from "@/components/theme-provider"
import { ChunkRecovery } from "@/components/chunk-recovery"

export const metadata: Metadata = {
  title: "Concrete AI — Confidential AI for Your Data",
  description:
    "Confidential AI for sensitive data — security, privacy, and confidentiality backed by modern cryptography.",
  generator: "Concrete AI",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <ChunkRecovery />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
