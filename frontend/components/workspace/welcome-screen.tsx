"use client"

import { Shield } from "lucide-react"
import { useWorkspace } from "./workspace-provider"

const SUGGESTED_PROMPTS = [
  "Explain how attestation secures my data",
  "What models are available in this workspace?",
  "Help me draft a confidential document",
  "What can you do inside this secure environment?",
]

export function WelcomeScreen() {
  const { setInput } = useWorkspace()

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-4">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <Shield className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-xl font-semibold tracking-tight">Private AI Workspace</h2>
        <p className="max-w-md text-center text-sm text-muted-foreground">
          Your conversation is secured by hardware attestation and end-to-end encryption.
        </p>
      </div>
      <div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="rounded-xl border border-border bg-card px-4 py-3 text-left text-sm text-foreground transition-colors hover:bg-accent/10"
            onClick={() => setInput(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  )
}
