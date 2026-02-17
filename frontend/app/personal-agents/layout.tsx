import type React from "react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Private AI Agents | Umbra",
  description:
    "Deploy private AI agents that keep your data confidential. Join the waitlist for early access.",
}

export default function PersonalAgentsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
