import type { AtlasVerificationResult } from "@/lib/atlas-attestation"

export const AVAILABLE_MODELS = [
  { id: "anthropic/claude-opus-4-6", label: "Claude Opus 4.6" },
  { id: "openai/gpt-oss-120b", label: "GPT OSS 120B" },
] as const

export type Message = {
  role: "user" | "assistant"
  content: string
  streaming?: boolean
}

export type ProofState =
  | { status: "idle" }
  | { status: "loading"; nonceHex: string }
  | { status: "ready"; nonceHex: string; result: AtlasVerificationResult }
  | { status: "error"; nonceHex: string; error: string }

export type SecurityStatus = "verified" | "verifying" | "error" | "idle" | "local_dev_non_attested"
