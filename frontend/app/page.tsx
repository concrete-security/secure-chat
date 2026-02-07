"use client"

import Link from "next/link"
import Image from "next/image"
import { useState, FormEvent, KeyboardEvent } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  Shield,
  Lock,
  Fingerprint,
  Send,
  FileText,
  Brain,
} from "lucide-react"

import { LoadingTransition } from "@/components/loading-transition"
import { ForceLightTheme } from "@/components/force-light-theme"
import { FeedbackButton } from "@/components/feedback-button"
import { Button } from "@/components/ui/button"
import AnnouncementBar from "@/components/announcement-bar"
import { EXAMPLE_THEMES, type ExampleTheme } from "@/lib/example-themes"

const examplePrompts: ExampleTheme[] = Object.values(EXAMPLE_THEMES)

type SecurityQuickStep = {
  title: string
  description: string
  icon: typeof Shield
}

const securityQuickSteps: SecurityQuickStep[] = [
  {
    title: "Encrypt and attest",
    description: "Your browser encrypts data and verifies the enclave identity first.",
    icon: Shield,
  },
  {
    title: "Process in TEE",
    description: "Plaintext exists only inside the attested confidential runtime.",
    icon: Brain,
  },
  {
    title: "Decrypt locally",
    description: "Responses are re-encrypted and only your browser can decrypt them.",
    icon: Fingerprint,
  },
]

const securityQuickGuarantees = [
  "Plaintext never crosses the network",
  "Attestation is checked before processing",
  "Only your device decrypts the final output",
]

const LANDING_PROMPT_HANDOFF_KEY = "confidential-chat-landing-prompt"

export default function LandingPage() {
  const router = useRouter()
  const [input, setInput] = useState("")
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [selectedExampleId, setSelectedExampleId] = useState<string | null>(null)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return

    try {
      window.sessionStorage.setItem(LANDING_PROMPT_HANDOFF_KEY, trimmed)
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Failed to persist landing prompt handoff", error)
      }
    }

    setIsTransitioning(true)
    setTimeout(() => {
      router.push("/confidential-ai")
    }, 600)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as unknown as FormEvent)
    }
  }

  // Handles clicks on "Try an example" buttons
  const handleExampleClick = (example: ExampleTheme) => {
    if (!example?.id) return
    setSelectedExampleId(example.id)
    setInput(example.prompt)
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#E2E2E2] text-[#08070B]">
      <ForceLightTheme />
      <header className="relative z-10 border-b border-[#d4d3e6] bg-transparent">
        <div className="container flex items-center justify-between gap-4 px-6 py-6">
          <Link href="/" className="flex items-center gap-3 text-lg font-semibold tracking-tight">
            <Image src="/logo.png" alt="Umbra logo" width={40} height={40} className="mix-blend-multiply" />
          </Link>
          <div className="flex items-center gap-3">
            <Button
              className="hidden h-9 rounded-full border border-[#1B0986] bg-white px-5 text-sm font-medium text-[#1B0986] transition hover:border-[#0B0870] hover:bg-white hover:text-[#0B0870] md:inline-flex"
              asChild
              variant="outline"
            >
              <a href="mailto:contact@concrete-security.com">Contact us</a>
            </Button>
          </div>
        </div>
      </header>
      <AnnouncementBar
        message="Umbra internal beta is live — secure chat is unlocked for testers."
        storageKey="announcement:private-beta"
      />
      <main className="relative z-10">
        <section className="flex justify-center px-4 pt-6 pb-16 md:pt-8 md:pb-24">
          <div className="relative w-full max-w-[900px] overflow-hidden rounded-[40px] border border-[#d4d3e6] bg-white/95 px-12 pb-16 pt-12 shadow-[0_48px_140px_-80px_rgba(11,31,102,0.45)] backdrop-blur">
              <div className="relative z-10 flex flex-col items-center gap-6">
                <h1 className="text-[58px] font-bold leading-[62px] text-[#08070B]">Umbra</h1>
              </div>
              <div className="relative flex flex-col gap-8 pt-4">
                <div className="flex flex-col gap-6 text-center">
                  <p className="mx-auto max-w-[520px] text-base leading-7 text-[#1F1E28]">
                    Query your confidential documents securely. Upload sensitive files and ask questions inside a locked-down
                    confidential workspace. Every interaction stays within a protected channel and runtime.
                  </p>
                </div>
                <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                  <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-[#1F1E28]/70">
                    <Shield className="h-3.5 w-3.5 text-[#1B0986]" />
                    <span>Private channel · Secure workspace</span>
                  </div>
                  <div className="flex w-full flex-col gap-3">
                    <label htmlFor="hero-input" className="sr-only">
                      Ask about your confidential documents
                    </label>
                    <textarea
                      id="hero-input"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={isTransitioning}
                      placeholder="Ask about your confidential documents..."
                      className="min-h-[140px] w-full resize-none rounded-[32px] border border-[#d7d5eb] bg-white px-5 py-5 text-base leading-relaxed text-[#08070B] placeholder:text-[#1F1E28]/40 shadow-[0_32px_80px_-60px_rgba(11,31,102,0.55)] transition focus:outline-none focus:ring-2 focus:ring-[#1B0986]/45"
                      rows={4}
                    />
                    <p className="text-center text-xs text-[#1F1E28]/65">
                      You will upload confidential files in the secure workspace. Landing inputs are not persisted.
                    </p>
                    <div className="flex w-full items-center gap-3">
                      <Button
                        type="submit"
                        className="h-12 w-full rounded-xl bg-[linear-gradient(135deg,#1B0986,#0B0870)] text-white shadow-sm transition hover:shadow-lg disabled:bg-[#1B0986]/55 disabled:text-white/75 disabled:hover:shadow-none"
                        disabled={isTransitioning || !input.trim()}
                      >
                        <Send className="mr-2 h-4 w-4" />
                        Start secure session
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 text-center">
                    <p className="text-xs font-medium uppercase tracking-[0.24em] text-[#1F1E28]/60">Try an example:</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {examplePrompts.map((example) => {
                      const isSelected = selectedExampleId === example.id

                      return (
                        <button
                          key={example.id}
                          type="button"
                          onClick={() => handleExampleClick(example)}
                          disabled={isTransitioning}
                          className={[
                              "relative inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs overflow-hidden transition",
                            isSelected
                              ? "border-transparent"
                              : "border-[#d7d5eb] bg-white/80 text-[#1F1E28]/80 hover:bg-white hover:text-[#08070B]",
                          ].join(" ")}
                          >
                            {/* Fill layer: left -> right */}
                            {isSelected && (
                              <span
                                aria-hidden="true"
                                className="absolute inset-0 example-fill z-0"
                                style={{ transform: "scaleX(1)" }}
                              />
                            )}

                          <span className="relative z-10 inline-flex items-center gap-1.5">
                            <FileText className="h-3 w-3" />

                            <span className="relative inline-block">
                              {/* Base text */}
                              <span className="text-[#08070B]">{example.buttonLabel}</span>

                              {/* White text overlay (no icon here) */}
                              {isSelected && (
                                <span
                                  aria-hidden="true"
                                  className="absolute inset-0 text-white pointer-events-none overflow-hidden"
                                  style={{ clipPath: "inset(0 0 0 0)" }}
                                >
                                  {example.buttonLabel}
                                </span>
                              )}
                            </span>
                          </span>
                          </button>
                        )
                    })}
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-4 text-xs text-[#1F1E28]/70">
                    <div className="flex items-center gap-2">
                      <Lock className="h-3.5 w-3.5 text-[#1F1E28]" />
                      <span>Encrypted</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Shield className="h-3.5 w-3.5 text-[#1F1E28]" />
                      <span>Attested</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Fingerprint className="h-3.5 w-3.5 text-[#1F1E28]" />
                      <span>Verified</span>
                    </div>
                  </div>
                </form>
            </div>
          </div>
        </section>

        <section className="px-4 pb-20" id="how-it-works">
          <div className="container flex flex-col gap-10">
            <div className="max-w-[720px] space-y-4">
              <span className="text-xs uppercase tracking-[0.4em] text-[#1F1E28]/70">How It Works</span>
              <h2 className="text-[34px] font-semibold leading-[38px] text-[#08070B]">
                Confidential Chat with Cryptographic Guarantees
              </h2>
              <p className="text-base leading-6 text-[#1F1E28]">
                Umbra is a Confidential Chat that allows you to query documents with cryptographic guarantees. Your data
                is encrypted client-side in the browser, and the machine processing your queries is verified through
                cryptographic means. Umbra relies on Trusted Execution Environments (TEE) to ensure your sensitive
                documents remain private throughout the entire process.
              </p>
            </div>
          </div>
        </section>

        <section className="px-4 pb-20" id="security-flow">
          <div className="container flex flex-col gap-6">
            <div className="max-w-[760px] space-y-3">
              <span className="text-xs uppercase tracking-[0.4em] text-[#1F1E28]/70">Security Flow</span>
              <h2 className="text-[30px] font-semibold leading-[34px] text-[#08070B] md:text-[34px] md:leading-[38px]">
                End-to-End Protection at a Glance
              </h2>
              <p className="text-base leading-6 text-[#1F1E28]">
                One rule matters most: plaintext exists only inside the attested TEE.
              </p>
            </div>
            <div className="rounded-[28px] border border-[#d4d3e6] bg-white p-5 shadow-[0_30px_90px_-76px_rgba(15,10,80,0.45)] md:p-6">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1F1E28]/70">
                <span className="rounded-full border border-[#BFD5FF] bg-[#EAF1FF] px-3 py-1 text-[#103B80]">Browser</span>
                <ArrowRight className="h-3.5 w-3.5 text-[#1B0986]" />
                <span className="rounded-full border border-[#BCE9D0] bg-[#E8F8EF] px-3 py-1 text-[#17633B]">
                  Attested TEE
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-[#1B0986]" />
                <span className="rounded-full border border-[#D7D5EB] bg-[#F5F4FB] px-3 py-1 text-[#312A57]">Browser</span>
              </div>

              <p className="mt-4 text-sm leading-6 text-[#1F1E28]">
                <span className="font-semibold text-[#08070B]">Key guarantee:</span> your data is encrypted in transit
                and only decrypted inside the verified enclave.
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {securityQuickSteps.map((step) => {
                  const Icon = step.icon
                  return (
                    <div key={step.title} className="rounded-2xl border border-[#d7d5eb] bg-[#FAFAFF] px-4 py-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1B0986]">
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <h3 className="mt-3 text-sm font-semibold text-[#08070B]">{step.title}</h3>
                      <p className="mt-1 text-xs leading-5 text-[#1F1E28]/80">{step.description}</p>
                    </div>
                  )
                })}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {securityQuickGuarantees.map((item) => (
                  <span
                    key={item}
                    className="inline-flex rounded-full border border-[#d7d5eb] bg-white px-3 py-1 text-xs font-medium text-[#1F1E28]/80"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="relative z-10 border-t border-[#d4d3e6] bg-transparent">
        <div className="container flex flex-col gap-4 px-6 py-10 text-sm text-[#1F1E28]/70 md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} Umbra.</p>
          <div className="flex flex-wrap gap-4">
            <Link className="transition hover:text-[#1B0986]" href="/confidential-ai">
              Confidential Chat
            </Link>
            <a className="transition hover:text-[#1B0986]" href="mailto:contact@concrete-security.com">
              Contact
            </a>
          </div>
        </div>
      </footer>
      <FeedbackButton source="landing" />
      {isTransitioning && <LoadingTransition message="Opening secure session..." />}
    </div>
  )
}
