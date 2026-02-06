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
  CircuitBoard,
  Send,
  FileText,
  CheckCircle2,
  Brain,
} from "lucide-react"

import { LoadingTransition } from "@/components/loading-transition"
import { ForceLightTheme } from "@/components/force-light-theme"
import { FeedbackButton } from "@/components/feedback-button"
import { Button } from "@/components/ui/button"
import AnnouncementBar from "@/components/announcement-bar"
import { EXAMPLE_THEMES, type ExampleTheme } from "@/lib/example-themes"

const examplePrompts: ExampleTheme[] = Object.values(EXAMPLE_THEMES)
const flowSteps = [
  {
    title: "Client Encryption",
    description: "Data is encrypted in your browser before transmission",
    icon: Lock,
  },
  {
    title: "Secure Machine",
    description: "Encrypted data reaches TEE with cryptographic verification",
    icon: Shield,
  },
  {
    title: "Decryption",
    description: "Data is decrypted inside the secure TEE environment",
    icon: Fingerprint,
  },
  {
    title: "AI Processing",
    description: "Your documents are processed by AI within the secure environment",
    icon: Brain,
  },
  {
    title: "Encryption",
    description: "Results are encrypted before leaving the TEE",
    icon: Lock,
  },
  {
    title: "Client",
    description: "Encrypted response is sent back to your browser",
    icon: CircuitBoard,
  },
  {
    title: "Decryption",
    description: "You decrypt and view the results locally",
    icon: Fingerprint,
  },
]

export default function LandingPage() {
  const router = useRouter()
  const [input, setInput] = useState("")
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [selectedExampleId, setSelectedExampleId] = useState<string | null>(null)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return

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

        <section className="px-4 pb-24" id="security-flow">
          <div className="container flex flex-col gap-10">
            <div className="max-w-[720px] space-y-4">
              <span className="text-xs uppercase tracking-[0.4em] text-[#1F1E28]/70">Security Flow</span>
              <h2 className="text-[34px] font-semibold leading-[38px] text-[#08070B]">
                End-to-End Protection
              </h2>
              <p className="text-base leading-6 text-[#1F1E28]">
                At each step of the process, the secure machine code and integrity are verified cryptographically. Your
                data never leaves the protected environment unencrypted.
              </p>
            </div>
            <div className="relative overflow-x-auto pb-8">
              <div className="flex min-w-max gap-4 md:gap-6">
                {flowSteps.map((step, index) => {
                  const Icon = step.icon
                  const isLast = index === flowSteps.length - 1
                  return (
                    <div key={index} className="flex items-start gap-4">
                      <div className="flex min-w-[200px] flex-col gap-4 rounded-[28px] border border-[#d4d3e6] bg-white p-6 shadow-[0_32px_78px_-64px_rgba(15,10,80,0.35)] md:min-w-[220px]">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#1B0986]">
                            <Icon className="h-5 w-5 text-white" />
                          </div>
                          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-base font-semibold leading-5 text-[#08070B]">{step.title}</h3>
                          <p className="text-sm leading-5 text-[#1F1E28]/80">{step.description}</p>
                        </div>
                      </div>
                      {!isLast && (
                        <div className="flex items-center pt-6">
                          <ArrowRight className="h-6 w-6 text-[#1B0986]" />
                        </div>
                      )}
                    </div>
                  )
                })}
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
