"use client"

import Link from "next/link"
import Image from "next/image"
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  Shield,
  Lock,
  Fingerprint,
  Send,
  FileText,
  Paperclip,
  X,
  Brain,
  Sparkles,
  Check,
  Terminal,
} from "lucide-react"

import { LoadingTransition } from "@/components/loading-transition"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { NavAuthButton } from "@/components/nav-auth-button"
import AnnouncementBar from "@/components/announcement-bar"
import { FadeIn } from "@/components/motion/fade-in"
import { StaggerChildren } from "@/components/motion/stagger-children"
import { EXAMPLE_THEMES, type ExampleTheme } from "@/lib/example-themes"
import { DEMO_HANDOFF_STORAGE_KEY, type DemoHandoffPayload } from "@/lib/demo-handoff"
import {
  LANDING_FILES_STORAGE_KEY,
  LANDING_MESSAGE_STORAGE_KEY,
  type LandingUploadedFile,
} from "@/lib/landing-handoff"

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

type AgentDemoScenario = {
  prompt: string
  steps: string[]
}

const agentDemoScenarios: AgentDemoScenario[] = [
  {
    prompt: "Review Q3 financials and flag anomalies",
    steps: [
      "Loaded 3 files into private workspace",
      "Cross-referenced revenue across subsidiaries",
      "Flagged 2 anomalies in deferred revenue",
      "Generated compliance memo (PDF)",
    ],
  },
  {
    prompt: "Scan vendor contracts for GDPR exposure",
    steps: [
      "Parsed 12 vendor agreements securely",
      "Identified 4 missing DPA clauses",
      "Drafted amendment language per contract",
      "Exported risk matrix to encrypted storage",
    ],
  },
  {
    prompt: "Summarize patient trial data for board deck",
    steps: [
      "Ingested 847 anonymized patient records",
      "Computed efficacy stats across cohorts",
      "Built 6 visualization slides",
      "All data stayed end-to-end encrypted",
    ],
  },
]

function AgentDemo() {
  const [scenarioIndex, setScenarioIndex] = useState(0)
  const [visibleSteps, setVisibleSteps] = useState(0)
  const [phase, setPhase] = useState<"typing" | "done" | "fade">("typing")

  const scenario = agentDemoScenarios[scenarioIndex]

  useEffect(() => {
    if (phase === "typing" && visibleSteps < scenario.steps.length) {
      const timer = setTimeout(() => setVisibleSteps((s) => s + 1), 1400)
      return () => clearTimeout(timer)
    }
    if (phase === "typing" && visibleSteps === scenario.steps.length) {
      const timer = setTimeout(() => setPhase("done"), 2000)
      return () => clearTimeout(timer)
    }
    if (phase === "done") {
      const timer = setTimeout(() => setPhase("fade"), 3500)
      return () => clearTimeout(timer)
    }
    if (phase === "fade") {
      const timer = setTimeout(() => {
        setScenarioIndex((i) => (i + 1) % agentDemoScenarios.length)
        setVisibleSteps(0)
        setPhase("typing")
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [phase, visibleSteps, scenario.steps.length])

  return (
    <div
      className={`rounded-2xl border border-border/60 bg-[hsl(222_47%_4%)] p-4 font-mono text-xs transition-opacity duration-300 ${phase === "fade" ? "opacity-0" : "opacity-100"}`}
    >
      <div className="flex items-center gap-2 text-amber-400/80 mb-3">
        <Terminal className="h-3.5 w-3.5" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em]">Private Agent</span>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-emerald-400/80">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Secure session
        </span>
      </div>
      <div className="text-muted-foreground mb-2.5">
        <span className="text-amber-400/60">$</span>{" "}
        <span className="text-foreground/90">{scenario.prompt}</span>
      </div>
      <div className="flex flex-col gap-1.5 min-h-[88px]">
        {scenario.steps.map((step, i) => (
          <div
            key={step}
            className={`flex items-start gap-2 transition-all duration-300 ${i < visibleSteps ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"}`}
          >
            <Check className="h-3 w-3 shrink-0 mt-0.5 text-emerald-400" />
            <span className="text-foreground/70 leading-4">{step}</span>
          </div>
        ))}
      </div>
      {phase === "done" && (
        <div className="mt-2.5 flex items-center gap-1.5 text-[10px] text-amber-400/60 border-t border-border/40 pt-2">
          <Lock className="h-3 w-3" />
          <span>All data processed end-to-end encrypted</span>
        </div>
      )}
    </div>
  )
}

export default function LandingPage() {
  const router = useRouter()
  const [input, setInput] = useState("")
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<LandingUploadedFile[]>([])
  const [heroNotice, setHeroNotice] = useState<string | null>(null)
  const [selectedExampleId, setSelectedExampleId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const extractTextFromPDF = useCallback(async (file: File): Promise<string> => {
    const pdfModuleUrl = `${window.location.origin}/pdfjs/pdf.mjs`
    const pdfWorkerUrl = `${window.location.origin}/pdfjs/pdf.worker.mjs`
    const pdfjsLibModule = await import(/* webpackIgnore: true */ pdfModuleUrl)
    const pdfjsLib =
      (pdfjsLibModule as unknown as { default?: any }).default ??
      (window as any).pdfjsLib ??
      pdfjsLibModule

    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    let text = ""

    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = textContent.items
        .map((item: any) => ("str" in item ? item.str : ""))
        .join(" ")
      text += `${pageText}\n`
    }
    return text.trim()
  }, [])

  const persistLandingHandoff = (message: string, files: LandingUploadedFile[]) => {
    try {
      const trimmed = message.trim()
      if (trimmed.length > 0) {
        window.sessionStorage.setItem(LANDING_MESSAGE_STORAGE_KEY, trimmed)
      } else {
        window.sessionStorage.removeItem(LANDING_MESSAGE_STORAGE_KEY)
      }

      if (files.length > 0) {
        window.sessionStorage.setItem(LANDING_FILES_STORAGE_KEY, JSON.stringify(files))
      } else {
        window.sessionStorage.removeItem(LANDING_FILES_STORAGE_KEY)
      }
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Failed to persist landing handoff payload", error)
      }
    }
  }

  const navigateToConfidentialChat = () => {
    setIsTransitioning(true)
    setTimeout(() => {
      router.push("/confidential-ai")
    }, 600)
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    persistLandingHandoff(input, uploadedFiles)
    navigateToConfidentialChat()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      handleSubmit(event as unknown as FormEvent)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files) return

    const acceptedFiles: LandingUploadedFile[] = []
    const failedFileNames: string[] = []

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]
      const maxSizeBytes = 100 * 1024 * 1024

      if (file.size > maxSizeBytes) {
        failedFileNames.push(`${file.name} (over 100MB limit)`)
        continue
      }

      try {
        const content =
          file.type === "application/pdf"
            ? await extractTextFromPDF(file)
            : await file.text()

        acceptedFiles.push({
          name: file.name,
          content,
          size: file.size,
          type: file.type || "text/plain",
        })
      } catch (error) {
        failedFileNames.push(file.name)
        if (process.env.NODE_ENV !== "production") {
          console.warn(`Failed to load landing file ${file.name}`, error)
        }
      }
    }

    if (acceptedFiles.length > 0) {
      setUploadedFiles((previous) => [...previous, ...acceptedFiles])
    }

    if (failedFileNames.length > 0) {
      setHeroNotice(`Some files could not be processed: ${failedFileNames.join(", ")}`)
    } else {
      setHeroNotice(null)
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const removeFile = (index: number) => {
    setUploadedFiles((previous) => previous.filter((_, fileIndex) => fileIndex !== index))
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes"
    const k = 1024
    const units = ["Bytes", "KB", "MB"]
    const unitIndex = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, unitIndex)).toFixed(2))} ${units[unitIndex]}`
  }

  const handleExampleClick = (example: ExampleTheme) => {
    if (!example?.id) return
    setSelectedExampleId(example.id)
    const payload: DemoHandoffPayload = { exampleId: example.id, autoSend: true }

    try {
      window.sessionStorage.removeItem(LANDING_MESSAGE_STORAGE_KEY)
      window.sessionStorage.removeItem(LANDING_FILES_STORAGE_KEY)
      window.sessionStorage.setItem(DEMO_HANDOFF_STORAGE_KEY, JSON.stringify(payload))
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Failed to persist demo handoff payload", error)
      }
    }

    navigateToConfidentialChat()
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Ambient background mesh */}
      <div
        className="pointer-events-none fixed inset-0 opacity-50"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -20%, hsl(var(--accent) / 0.15) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 80% 100%, hsl(var(--brand-primary) / 0.12) 0%, transparent 50%), radial-gradient(ellipse 40% 30% at 10% 60%, hsl(var(--accent) / 0.08) 0%, transparent 40%)",
        }}
      />

      <header className="relative z-20 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="container flex items-center justify-between gap-4 px-6 py-6">
          <Link href="/" className="flex items-center gap-3 text-lg font-semibold tracking-tight">
            <Image src="/logo.png" alt="Umbra logo" width={40} height={40} className="mix-blend-multiply dark:mix-blend-normal dark:invert" />
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button
              className="hidden h-9 rounded-full border border-primary/60 bg-transparent px-5 text-sm font-medium text-primary transition hover:border-primary hover:bg-primary/10 md:inline-flex"
              asChild
              variant="outline"
            >
              <a href="mailto:contact@concrete-security.com">Contact</a>
            </Button>
            <NavAuthButton />
          </div>
        </div>
      </header>
      <AnnouncementBar
        message="Umbra internal beta is live — secure chat is unlocked for testers."
        storageKey="announcement:private-beta"
      />
      <main className="relative z-10">
        {/* Page title */}
        <section className="px-4 pt-8 pb-2 md:pt-12">
          <FadeIn direction="up" distance={24}>
            <div className="flex flex-col items-center gap-3 text-center">
              <h1 className="text-display-xl text-foreground">Umbra</h1>
              <p className="mx-auto max-w-[560px] text-body-lg text-muted-foreground">
                Confidential AI for your sensitive data. Every interaction is encrypted, attested, and verified.
              </p>
            </div>
          </FadeIn>
        </section>

        {/* Two-column hero: Confidential Chat + Private AI Agents */}
        <section className="px-4 pt-4 pb-16 md:pb-24">
          <div className="container grid gap-6 md:grid-cols-2">
            {/* Left — Confidential Chat */}
            <FadeIn direction="up" distance={32} delay={0.05} className="md:h-full">
              <div className="relative overflow-hidden rounded-[32px] glass-card px-8 pb-10 pt-8 shadow-hero h-full">
                <div className="pointer-events-none absolute inset-0 rounded-[32px] ring-1 ring-inset ring-accent/20" aria-hidden="true" />
                <div className="relative z-10 flex h-full flex-col gap-6">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      <Shield className="h-3.5 w-3.5 text-accent" />
                      <span>Confidential Chat</span>
                    </div>
                    <h2 className="text-heading-lg text-foreground">Secure Document Q&A</h2>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Upload sensitive files and ask questions inside a locked-down confidential workspace.
                    </p>
                  </div>
                  <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="flex w-full flex-col gap-3">
                      <label htmlFor="hero-input" className="sr-only">
                        Ask about your confidential files
                      </label>
                      <textarea
                        id="hero-input"
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask about your confidential files..."
                        disabled={isTransitioning}
                        className="min-h-[100px] w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/40 shadow-card transition focus:outline-none focus:ring-2 focus:ring-accent/45"
                        rows={3}
                      />

                      {uploadedFiles.length > 0 && (
                        <div className="space-y-2 rounded-2xl border border-border bg-muted/30 p-3">
                          {uploadedFiles.map((file, index) => (
                            <div
                              key={`${file.name}-${index}`}
                              className="flex items-center justify-between rounded-lg border border-border bg-card px-2.5 py-2 text-xs text-foreground"
                            >
                              <div className="flex items-center gap-2 overflow-hidden">
                                <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                                <span className="truncate font-medium">{file.name}</span>
                                <span className="shrink-0 text-muted-foreground">({formatFileSize(file.size)})</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeFile(index)}
                                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:border-primary hover:text-primary"
                              >
                                <X className="h-3.5 w-3.5" />
                                <span className="sr-only">Remove file</span>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {heroNotice ? (
                        <div className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                          {heroNotice}
                        </div>
                      ) : null}

                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        multiple
                        accept=".txt,.md,.json,.csv,.py,.js,.ts,.tsx,.jsx,.html,.css,.xml,.yaml,.yml,.pdf"
                        className="hidden"
                      />

                      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 rounded-xl border-border bg-card text-foreground hover:border-primary hover:bg-card hover:text-primary sm:w-auto"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isTransitioning}
                        >
                          <Paperclip className="mr-2 h-4 w-4" />
                          Upload files
                        </Button>
                        <Button
                          type="submit"
                          className="h-10 w-full rounded-xl bg-primary text-primary-foreground shadow-sm transition hover:bg-primary/90 hover:shadow-glow-primary disabled:bg-primary/55 disabled:text-primary-foreground/75 disabled:hover:shadow-none"
                          disabled={isTransitioning}
                        >
                          <Send className="mr-2 h-4 w-4" />
                          Open Chat
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 text-center">
                      <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">Try an example:</p>
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
                                  : "border-border bg-card/80 text-muted-foreground hover:bg-card hover:text-foreground",
                              ].join(" ")}
                            >
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
                                  <span className="text-foreground">{example.buttonLabel}</span>
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
                    <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Lock className="h-3.5 w-3.5 text-accent" />
                        <span>Encrypted</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Shield className="h-3.5 w-3.5 text-accent" />
                        <span>Attested</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Fingerprint className="h-3.5 w-3.5 text-accent" />
                        <span>Verified</span>
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            </FadeIn>

            {/* Right — Private AI Agents */}
            <FadeIn direction="up" distance={32} delay={0.15} className="md:h-full">
              <div className="relative overflow-hidden rounded-[32px] glass-card px-8 pb-10 pt-8 shadow-hero h-full">
                <div className="pointer-events-none absolute inset-0 rounded-[32px] ring-1 ring-inset ring-amber-500/20" aria-hidden="true" />
                <div className="relative z-10 flex h-full flex-col gap-6">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.24em] text-amber-400">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Coming Soon</span>
                    </div>
                    <h2 className="text-heading-lg text-foreground">Private AI Agents</h2>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Deploy autonomous AI agents that keep your data confidential. Private by design, verified by cryptography.
                    </p>
                  </div>

                  <AgentDemo />

                  <div className="mt-auto pt-2">
                    <Button
                      className="h-10 w-full rounded-xl bg-amber-500 text-sm font-medium text-white shadow-sm transition hover:bg-amber-400"
                      asChild
                    >
                      <Link href="/personal-agents">
                        Join the waitlist
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </FadeIn>
          </div>
        </section>

        {/* Security flow */}
        <section className="px-4 pb-20" id="security-flow">
          <div className="container flex flex-col gap-6">
            <FadeIn direction="up">
              <div className="max-w-[760px] space-y-3">
                <span className="text-overline uppercase tracking-[0.4em] text-muted-foreground">How It Works</span>
                <h2 className="text-heading-lg text-foreground">
                  End-to-End Protection at a Glance
                </h2>
                <p className="text-body-lg text-muted-foreground">
                  One rule matters most: plaintext exists only inside the attested TEE.
                </p>
              </div>
            </FadeIn>
            <FadeIn direction="up" delay={0.1}>
              <div className="rounded-[28px] glass-card p-5 shadow-card md:p-6">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  <span className="rounded-full border border-info/30 bg-info/10 px-3 py-1 text-info">Browser</span>
                  <ArrowRight className="h-3.5 w-3.5 text-primary" />
                  <span className="rounded-full border border-success/30 bg-success/10 px-3 py-1 text-success">
                    Attested TEE
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-primary" />
                  <span className="rounded-full border border-border bg-muted/30 px-3 py-1 text-foreground">Browser</span>
                </div>

                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  <span className="font-semibold text-foreground">Key guarantee:</span> your data is encrypted in transit
                  and only decrypted inside the verified enclave.
                </p>

                <StaggerChildren stagger={0.1} className="mt-4 grid gap-3 md:grid-cols-3">
                  {securityQuickSteps.map((step) => {
                    const Icon = step.icon
                    return (
                      <div key={step.title} className="rounded-2xl border border-border bg-muted/20 px-4 py-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                          <Icon className="h-4 w-4 text-primary-foreground" />
                        </div>
                        <h3 className="mt-3 text-sm font-semibold text-foreground">{step.title}</h3>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.description}</p>
                      </div>
                    )
                  })}
                </StaggerChildren>

                <div className="mt-4 flex flex-wrap gap-2">
                  {securityQuickGuarantees.map((item) => (
                    <span
                      key={item}
                      className="inline-flex rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </FadeIn>
          </div>
        </section>
      </main>
      <footer className="relative z-10 border-t border-border/60 bg-background/80 backdrop-blur-md">
        <div className="container flex flex-col gap-4 px-6 py-10 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} Umbra.</p>
          <div className="flex flex-wrap gap-4">
            <Link className="transition hover:text-primary" href="/confidential-ai">
              Confidential Chat
            </Link>
            <Link className="transition hover:text-primary" href="/personal-agents">
              Private AI Agents
            </Link>
            <a className="transition hover:text-primary" href="mailto:contact@concrete-security.com">
              Contact
            </a>
          </div>
        </div>
      </footer>
      {isTransitioning && <LoadingTransition message="Opening secure session..." />}
    </div>
  )
}
