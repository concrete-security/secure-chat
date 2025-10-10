"use client"

import Link from "next/link"
import Image from "next/image"
import { useState, FormEvent, KeyboardEvent, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  Shield,
  Lock,
  Fingerprint,
  CircuitBoard,
  FileLock2,
  Server,
  Sparkles,
  Send,
  FileText,
  Paperclip,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { LoadingTransition } from "@/components/loading-transition"
import { ForceLightTheme } from "@/components/force-light-theme"

const examplePrompts = [
  "Analyze this employment contract for potential legal issues",
  "Summarize key findings from these medical research documents",
  "Review this financial report for compliance risks",
]

const capabilityCards = [
  {
    title: "Cryptographic Routing",
    description:
      "Route sensitive workloads through verified hardware, MPC, or FHE without sacrificing performance or trust.",
    icon: CircuitBoard,
  },
  {
    title: "Confidential Collaboration",
    description: "Invite teammates and partners into isolated workspaces with reversible disclosure and escrowed access.",
    icon: FileLock2,
  },
  {
    title: "Sealed Knowledge Retrieval",
    description:
      "Operate RAG pipelines on encrypted corpora with per-query attestations and deterministic policy enforcement.",
    icon: Shield,
  },
]

const trustSignals = [
  {
    title: "Attested Execution",
    description: "Cryptographic proofs guarantee model integrity and runtime isolation.",
    icon: Fingerprint,
  },
  {
    title: "Regional Sovereignty",
    description: "Deploy in dedicated regions with customer-owned keys and sealed telemetry.",
    icon: Server,
  },
  {
    title: "Human Alignment",
    description: "Expert security engineers guide integrations, threat models, and readiness reviews.",
    icon: Sparkles,
  },
]

type UploadedFile = { name: string; content: string; size: number; type: string }

export default function LandingPage() {
  const router = useRouter()
  const [input, setInput] = useState("")
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed && uploadedFiles.length === 0) return

    if (uploadedFiles.length > 0) {
      try {
        sessionStorage.setItem("hero-uploaded-files", JSON.stringify(uploadedFiles))
      } catch (error) {
        console.error("Failed to store files", error)
      }
    }

    setIsTransitioning(true)
    setTimeout(() => {
      router.push(`/confidential-ai?message=${encodeURIComponent(trimmed)}`)
    }, 1000)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as unknown as FormEvent)
    }
  }

  const handleExampleClick = (example: string) => {
    setInput(example)
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files) return

    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      const maxSize = 100 * 1024 * 1024
      if (file.size > maxSize) {
        alert(`File "${file.name}" is too large. Maximum size is 100MB.`)
        continue
      }

      try {
        let content: string

        if (file.type === "application/pdf") {
          content = await extractTextFromPDF(file)
        } else {
          content = await file.text()
        }

        const uploadedFile: UploadedFile = {
          name: file.name,
          content,
          size: file.size,
          type: file.type || "text/plain",
        }

        setUploadedFiles((prev) => [...prev, uploadedFile])
      } catch (error) {
        console.error("Error reading file:", error)
        alert(`Failed to read file "${file.name}": ${error instanceof Error ? error.message : "Unknown error"}`)
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const extractTextFromPDF = async (file: File): Promise<string> => {
    try {
      // @ts-expect-error - PDF.js is loaded from public folder
      const pdfjsLibModule = await import(/* webpackIgnore: true */ "/pdfjs/pdf.mjs")
      const pdfjsLib =
        (pdfjsLibModule as unknown as { default?: unknown }).default ?? (window as any).pdfjsLib ?? pdfjsLibModule

      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.mjs"

      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      let text = ""

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const textContent = await page.getTextContent()
        const pageText = textContent.items.map((item: any) => ("str" in item ? item.str : "")).join(" ")
        text += pageText + "\n"
      }
      return text.trim()
    } catch (error) {
      console.error("Error extracting text from PDF:", error)
      throw new Error("Failed to extract text from PDF")
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const sizes = ["Bytes", "KB", "MB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#E2E2E2] text-black">
      <ForceLightTheme />
      <script src="/pdfjs/pdf.mjs" type="module" />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(93%_736.36%_at_38%_-100%,#E2E2E2_24.46%,#1B0986_100%)] opacity-25"
        aria-hidden
      />
      <header className="relative z-10 border-b border-black/10 bg-transparent">
        <div className="container flex items-center justify-between gap-4 px-6 py-6">
          <Link href="/" className="flex items-center gap-3 text-lg font-semibold">
            <Image src="/logo.png" alt="Concrete AI logo" width={32} height={32} className="rounded-md" />
            <span>Concrete AI</span>
          </Link>
          <div className="flex items-center gap-3">
            <Button
              className="h-9 rounded-full bg-black px-5 text-sm font-normal text-white hover:bg-black/90"
              asChild
            >
              <Link href="/confidential-ai">
                Try Confidential AI
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              variant="outline"
              className="h-9 rounded-full border border-black px-5 text-sm font-normal text-black hover:bg-black/10"
              asChild
            >
              <a href="mailto:contact@concrete-security.com">Book a Demo</a>
            </Button>
          </div>
        </div>
      </header>
      <main className="relative z-10">
        <section className="flex justify-center px-4 py-16 md:py-24">
          <div className="relative w-full max-w-[871px] overflow-hidden rounded-[40px] border border-black/15 bg-[#E2E2E2] px-12 pb-16 pt-12 shadow-[0_50px_120px_-45px_rgba(0,0,0,0.6)]">
            <div
              className="absolute inset-x-8 top-0 h-[170px] -translate-y-1/2 rounded-[160px] bg-[radial-gradient(circle_at_top,#E2E2E2_20%,rgba(27,9,134,0.42)_65%,rgba(27,9,134,0)_100%)] flex items-end justify-center pb-4"
            >
              <h1 className="text-[52px] font-bold leading-[55px] text-black">
                Confidential AI
              </h1>
            </div>
            <div
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(211.15deg,rgba(0,0,0,0)_18.84%,rgba(0,0,0,0.14)_103.94%)]"
              aria-hidden
            />
            <div className="relative flex flex-col gap-8 pt-16">
              <div className="flex flex-col gap-6 text-center">
                <p className="max-w-[520px] mx-auto text-base leading-[22px]">
                  Query your confidential documents securely. Upload sensitive files and ask questions in a cryptographically secured environment. Every query is encrypted end-to-end with verifiable attestation.
                </p>
              </div>
              <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-black/60">
                  <Shield className="h-3.5 w-3.5 text-[#1B0986]" />
                  <span>End-to-end encrypted</span>
                </div>
                <div className="flex flex-col gap-4 rounded-[32px] border border-black/15 bg-white/70 p-6 backdrop-blur-sm">
                  {uploadedFiles.length > 0 && (
                    <div className="space-y-2">
                      {uploadedFiles.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between rounded-xl border border-black/15 bg-white/70 p-3 text-xs text-black/70"
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="size-3 text-[#1B0986]" />
                            <span className="font-medium text-black">{file.name}</span>
                            <span className="text-black/60">({formatFileSize(file.size)})</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFile(index)}
                            className="h-6 w-6 rounded-full border border-black/15 p-0 text-black hover:bg-white/80"
                          >
                            <X className="size-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
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
                      className="min-h-[120px] w-full resize-none rounded-2xl border border-black/15 bg-white px-4 py-4 text-base leading-relaxed text-black placeholder:text-black/40 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1B0986]/50"
                      rows={4}
                    />
                    <div className="flex w-full items-center gap-3">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        multiple
                        accept=".txt,.md,.json,.csv,.py,.js,.ts,.tsx,.jsx,.html,.css,.xml,.yaml,.yml,.pdf"
                        className="hidden"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isTransitioning}
                        className="h-12 w-12 shrink-0 rounded-xl border border-black/15 bg-white/80 text-black shadow-sm hover:bg-white hover:shadow"
                        title="Upload files"
                      >
                        <Paperclip className="h-4 w-4 text-[#1B0986]" />
                      </Button>
                      <Button
                        type="submit"
                        className="flex-1 h-12 rounded-xl bg-[#1B0986] text-white shadow-sm hover:bg-[#1B0986]/90 hover:shadow disabled:opacity-50"
                        disabled={isTransitioning || (!input.trim() && uploadedFiles.length === 0)}
                      >
                        <Send className="mr-2 h-4 w-4" />
                        Start secure session
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-medium uppercase tracking-[0.24em] text-black/50">Try an example:</p>
                    <div className="flex flex-wrap gap-2">
                      {examplePrompts.map((example, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleExampleClick(example)}
                          disabled={isTransitioning}
                          className="inline-flex items-center gap-1.5 rounded-full border border-black/15 bg-white/60 px-3 py-1.5 text-xs text-black/70 transition hover:bg-white/80 hover:text-black disabled:opacity-50"
                        >
                          <FileText className="h-3 w-3" />
                          {example}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-black/60">
                  <div className="flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5" />
                    <span>Encrypted</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5" />
                    <span>Attested</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Fingerprint className="h-3.5 w-3.5" />
                    <span>Verified</span>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </section>

        <section className="px-4 pb-20">
          <div className="container flex flex-col gap-10">
            <div className="max-w-[720px] space-y-4">
              <span className="text-xs uppercase tracking-[0.4em] text-black/60">Capabilities</span>
              <h2 className="text-[34px] font-semibold leading-[38px]">Confidential pipelines, delivered end to end.</h2>
              <p className="text-base leading-6 text-black/70">
                Compose cryptographic controls, regional guarantees, and developer tooling into a single secure fabric. We
                design for regulated data, high-value IP, and multi-party collaboration without compromise.
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {capabilityCards.map((card) => {
                const Icon = card.icon
                return (
                  <div
                    key={card.title}
                    className="flex min-h-[204px] flex-col items-start gap-[17px] rounded-[32px] border border-black/12 bg-[#E2E2E2]/90 p-[30px] shadow-[0_24px_68px_-38px_rgba(0,0,0,0.55)]"
                  >
                    <div className="flex h-[29px] w-[29px] items-center justify-center rounded-md bg-[#1B0986]">
                      <Icon className="h-4 w-4 text-white" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold leading-6">{card.title}</h3>
                      <p className="text-sm leading-6 text-black/70">{card.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section className="px-4 pb-24">
          <div className="container flex flex-col gap-10">
            <div className="max-w-[720px] space-y-4">
              <span className="text-xs uppercase tracking-[0.4em] text-black/60">Trust Architecture</span>
              <h2 className="text-[34px] font-semibold leading-[38px]">Engineered for verifiable confidentiality.</h2>
              <p className="text-base leading-6 text-black/70">
                Every layer reinforces the promise of privacy. Concrete AI blends hardware-backed attestation, encrypted
                dataflows, and human-in-the-loop governance so you always know who touched what—and why.
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {trustSignals.map((signal) => {
                const Icon = signal.icon
                return (
                  <div
                    key={signal.title}
                    className="flex flex-col gap-5 rounded-[32px] border border-black/12 bg-white/80 p-[30px] shadow-[0_24px_68px_-38px_rgba(0,0,0,0.55)] backdrop-blur-sm"
                  >
                    <div className="flex h-[48px] w-[48px] items-center justify-center rounded-full bg-[#1B0986] text-white">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold leading-6">{signal.title}</h3>
                      <p className="text-sm leading-6 text-black/70">{signal.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section className="flex justify-center px-4 pb-24">
          <div className="relative w-full max-w-[880px] overflow-hidden rounded-[40px] border border-black/12 bg-[#1B0986] px-10 py-14 text-white shadow-[0_50px_120px_-45px_rgba(0,0,0,0.7)]">
            <div
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(231.82deg,rgba(226,226,226,0.2)_8.09%,rgba(27,9,134,0.35)_105.85%)]"
              aria-hidden
            />
            <div className="relative flex flex-col gap-6 text-center md:items-center">
              <span className="text-xs uppercase tracking-[0.4em] text-white/70">Ready to build?</span>
              <h2 className="text-[34px] font-semibold leading-[38px] md:max-w-[520px]">
                Launch a confidential AI program that scales with your compliance and trust requirements.
              </h2>
              <p className="mx-auto max-w-[520px] text-sm leading-6 text-white/80">
                Partner with our security engineers to deploy in your preferred region, integrate with existing data
                controls, and evolve your policies alongside secure AI workloads.
              </p>
              <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button
                  className="h-9 w-full rounded-full border border-white bg-white px-5 text-sm font-normal text-black hover:bg-white/90 sm:w-[150px]"
                  asChild
                >
                  <Link href="/confidential-ai">
                    Start Secure Chat
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className="h-9 w-full rounded-full border border-white/70 px-5 text-sm font-normal text-white hover:bg-white/10 sm:w-[150px]"
                  asChild
                >
                  <a href="mailto:contact@concrete-security.com">Schedule a briefing</a>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="relative z-10 border-t border-black/10 bg-[#E2E2E2]/70 backdrop-blur-sm">
        <div className="container flex flex-col gap-4 px-6 py-10 text-sm text-black/70 md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} Concrete AI. Confidential AI for sensitive data.</p>
          <div className="flex flex-wrap gap-4">
            <Link className="hover:text-black" href="/confidential-ai">
              Confidential Chat
            </Link>
            <a className="hover:text-black" href="mailto:contact@concrete-security.com">
              Contact
            </a>
            <Link className="hover:text-black" href="/">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
      {isTransitioning && <LoadingTransition message="Opening secure session..." />}
    </div>
  )
}
