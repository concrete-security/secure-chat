"use client"

import { useRef, useState, type FormEvent } from "react"
import Image from "next/image"
import Link from "next/link"
import {
  ArrowRight,
  Bot,
  Fingerprint,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { FadeIn } from "@/components/motion/fade-in"
import { StaggerChildren } from "@/components/motion/stagger-children"
import { useFormToken } from "@/hooks/use-form-token"
import { motion } from "framer-motion"
import { fadeUp } from "@/lib/motion-variants"

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type ValueProp = {
  title: string
  description: string
  icon: typeof Bot
}

const valueProps: ValueProp[] = [
  {
    icon: Bot,
    title: "Personalized Agents",
    description:
      "AI agents tailored to your workflows, trained on your private data without exposing it.",
  },
  {
    icon: ShieldCheck,
    title: "Private by Default",
    description:
      "Every agent runs in a confidential environment — your prompts and data stay encrypted end to end.",
  },
  {
    icon: Lock,
    title: "Cryptographic Guarantees",
    description:
      "The agent runtime is verified through cryptographic attestation before any data is processed.",
  },
  {
    icon: Fingerprint,
    title: "Your Data, Your Rules",
    description:
      "Full control over what data your agents can access and what they produce — no third-party access.",
  },
]

export default function PersonalAgentsWaitlistContent() {
  const [email, setEmail] = useState("")
  const [useCase, setUseCase] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle")
  const [error, setError] = useState<string | null>(null)
  const honeypotRef = useRef<HTMLInputElement | null>(null)
  const {
    token: formToken,
    loading: formTokenLoading,
    error: formTokenError,
    refreshToken,
  } = useFormToken()

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (status === "loading") return

    const checkpointValue = honeypotRef.current?.value?.trim() ?? ""
    if (checkpointValue.length > 0) {
      setError("Unable to process the request.")
      return
    }

    if (!formToken) {
      setError("Secure form token unavailable. Please refresh and try again.")
      void refreshToken()
      return
    }

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setError("Add an email so we know where to reach you.")
      return
    }
    if (!emailRegex.test(trimmedEmail)) {
      setError("That email looks off. Double-check and try again.")
      return
    }

    setError(null)
    setStatus("loading")

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          use_case: useCase.trim() || undefined,
          metadata: { source: "personal-agents" },
          form_token: formToken,
          checkpoint: checkpointValue || undefined,
        }),
      })

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
      }

      if (!response.ok) {
        setError(
          payload.error ??
            "We couldn't save your request. Please try again in a moment."
        )
        setStatus("idle")
        return
      }

      setStatus("success")
      setEmail("")
      setUseCase("")
      if (honeypotRef.current) {
        honeypotRef.current.value = ""
      }
      void refreshToken()
    } catch (err) {
      console.error("Personal agents waitlist request failed", err)
      setError(
        "We couldn't save your request. Please try again in a moment."
      )
      setStatus("idle")
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Ambient glow — amber/gold accent for Personal Agents */}
      <div
        className="pointer-events-none fixed inset-0 opacity-40"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 40% -10%, hsl(38 92% 50% / 0.08) 0%, transparent 60%), radial-gradient(ellipse 50% 40% at 80% 100%, hsl(var(--brand-primary) / 0.06) 0%, transparent 50%)",
        }}
      />

      <header className="relative z-10 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="container flex items-center justify-between gap-4 px-6 py-6">
          <Link
            href="/"
            className="flex items-center gap-3 text-lg font-semibold tracking-tight"
          >
            <Image
              src="/logo.png"
              alt="Umbra logo"
              width={40}
              height={40}
              className="mix-blend-multiply dark:mix-blend-normal dark:invert"
            />
          </Link>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              className="h-9 rounded-full border border-transparent px-5 text-sm font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
              asChild
            >
              <Link href="/">Back home</Link>
            </Button>
            <Button
              className="hidden h-9 rounded-full border border-primary/60 bg-transparent px-5 text-sm font-medium text-primary transition hover:border-primary hover:bg-primary/10 md:inline-flex"
              asChild
              variant="outline"
            >
              <a href="mailto:contact@concrete-security.com">Contact</a>
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        {/* Hero Section */}
        <section className="flex justify-center px-4 pt-10 pb-16 md:pt-16 md:pb-24">
          <FadeIn direction="up" distance={32}>
            <div className="flex max-w-[720px] flex-col items-center gap-6 text-center">
              <div className="flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.24em] text-amber-400 shimmer-bg">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Coming Soon</span>
              </div>
              <h1 className="text-display-lg text-foreground md:text-display-xl">
                Private AI Agents
              </h1>
              <p className="text-heading text-muted-foreground">
                Confidential AI, on your terms
              </p>
              <p className="max-w-[520px] text-body-lg text-muted-foreground">
                Autonomous AI agents that keep your data confidential. Your
                prompts, documents, and results are encrypted and never exposed
                to anyone — not even us.
              </p>
            </div>
          </FadeIn>
        </section>

        {/* Value Props Section */}
        <section className="px-4 pb-20">
          <div className="container flex flex-col gap-10">
            <FadeIn direction="up">
              <div className="max-w-[720px] space-y-4">
                <span className="text-overline uppercase tracking-[0.4em] text-muted-foreground">
                  What Are Private AI Agents
                </span>
                <h2 className="text-heading-lg text-foreground">
                  AI That Works for You — And Only You
                </h2>
                <p className="text-body-lg text-muted-foreground">
                  Private AI Agents combine the power of autonomous AI with
                  strong confidentiality guarantees. Each agent is
                  cryptographically verified before it processes your data, and
                  everything stays encrypted end to end.
                </p>
              </div>
            </FadeIn>
            <StaggerChildren stagger={0.1} className="grid gap-4 md:grid-cols-2">
              {valueProps.map((prop) => {
                const Icon = prop.icon
                return (
                  <motion.div
                    key={prop.title}
                    variants={fadeUp}
                    className="group rounded-[28px] glass-card p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
                      <Icon className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-foreground">
                      {prop.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {prop.description}
                    </p>
                  </motion.div>
                )
              })}
            </StaggerChildren>
          </div>
        </section>

        {/* Waitlist Section */}
        <section className="px-4 pb-20">
          <div className="container flex flex-col gap-10">
            <FadeIn direction="up">
              <div className="max-w-[720px] space-y-4">
                <span className="text-overline uppercase tracking-[0.4em] text-muted-foreground">
                  Early Access
                </span>
                <h2 className="text-heading-lg text-foreground">
                  Be the First to Deploy Private Agents
                </h2>
                <p className="text-body-lg text-muted-foreground">
                  We're building Private AI Agents for teams that need AI
                  automation without compromising on data privacy. Join the
                  waitlist to get early access.
                </p>
              </div>
            </FadeIn>

            <FadeIn direction="up" delay={0.1}>
              <div className="w-full max-w-md rounded-[28px] glass-card p-6 shadow-card md:p-8">
                {error ? (
                  <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {error}
                  </div>
                ) : null}

                {formTokenError ? (
                  <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                    {formTokenError}
                  </div>
                ) : null}

                {status === "success" ? (
                  <div className="rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
                    You're on the list. We'll reach out when Private AI Agents
                    are ready for your team.
                  </div>
                ) : null}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <input
                    ref={honeypotRef}
                    type="text"
                    name="workspace-url"
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    className="absolute h-px w-px opacity-0"
                    defaultValue=""
                  />

                  <label
                    htmlFor="personal-agents-email"
                    className="flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground focus-within:border-accent focus-within:text-foreground"
                  >
                    <Mail className="size-4 text-primary" />
                    <input
                      id="personal-agents-email"
                      type="email"
                      placeholder="Your email"
                      className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      disabled={status === "loading" || status === "success"}
                      required
                    />
                  </label>

                  <textarea
                    id="personal-agents-use-case"
                    placeholder="What would you use private agents for? (optional)"
                    className="min-h-[90px] w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-accent focus:outline-none"
                    value={useCase}
                    onChange={(event) => setUseCase(event.target.value)}
                    disabled={status === "loading" || status === "success"}
                  />

                  <Button
                    type="submit"
                    className="h-12 w-full rounded-full bg-amber-500 px-6 text-sm font-semibold text-white transition hover:bg-amber-400"
                    disabled={
                      status === "loading" ||
                      status === "success" ||
                      formTokenLoading ||
                      !formToken
                    }
                  >
                    {status === "loading"
                      ? "Submitting…"
                      : status === "success"
                        ? "Request received"
                        : "Request early access"}
                    <ArrowRight className="ml-2 size-4" />
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    We review requests manually. No spam — just next steps when
                    Private AI Agents are ready.
                  </p>
                </form>
              </div>
            </FadeIn>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-border/60 bg-background/80 backdrop-blur-md">
        <div className="container flex flex-col gap-4 px-6 py-10 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} Umbra.</p>
          <div className="flex flex-wrap gap-4">
            <Link
              className="transition hover:text-primary"
              href="/confidential-ai"
            >
              Confidential Chat
            </Link>
            <Link
              className="transition hover:text-primary"
              href="/personal-agents"
            >
              Private AI Agents
            </Link>
            <a
              className="transition hover:text-primary"
              href="mailto:contact@concrete-security.com"
            >
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
