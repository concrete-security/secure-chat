import Link from "next/link"
import Image from "next/image"
import {
  ArrowRight,
  Shield,
  Lock,
  Layers,
  Users,
  Fingerprint,
  CircuitBoard,
  FileLock2,
  Server,
  Sparkles,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { ForceLightTheme } from "@/components/force-light-theme"

const heroHighlights = [
  {
    title: "Confidential by Default",
    description: "Attested enclaves seal prompts, parameters, and outputs so plaintext never leaves your control.",
    icon: Shield,
  },
  {
    title: "Policy-Driven Privacy",
    description: "Granular roles, audit trails, and ephemeral tokens enforce zero-trust boundaries end to end.",
    icon: Lock,
  },
  {
    title: "Seamless Integration",
    description: "Native support for secure RAG, fine-tuning, and analytics in existing MLOps pipelines.",
    icon: Layers,
  },
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
    icon: Users,
  },
  {
    title: "Sealed Knowledge Retrieval",
    description:
      "Operate RAG pipelines on encrypted corpora with per-query attestations and deterministic policy enforcement.",
    icon: FileLock2,
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

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#E2E2E2] text-black">
      <ForceLightTheme />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(93%_736.36%_at_38%_-100%,#E2E2E2_24.46%,#1B0986_100%)] opacity-25"
        aria-hidden
      />
      <header className="relative z-10 border-b border-black/10 bg-transparent">
        <div className="container flex flex-col gap-6 px-6 py-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3 text-lg font-semibold">
              <Image src="/logo.png" alt="Concrete AI logo" width={32} height={32} className="rounded-md" />
              <span>Concrete AI</span>
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                className="h-9 w-full rounded-full bg-black px-6 text-sm font-normal text-white hover:bg-black/90 sm:w-auto sm:min-w-[190px]"
                asChild
              >
                <Link href="/confidential-ai">
                  Try Confidential AI
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                variant="outline"
                className="h-9 w-full rounded-full border border-black px-6 text-sm font-normal text-black hover:bg-black/10 sm:w-auto sm:min-w-[190px]"
                asChild
              >
                <a href="mailto:contact@concrete-security.com">Book a Demo</a>
              </Button>
            </div>
          </div>
          <p className="max-w-[420px] text-xs uppercase leading-5 tracking-[0.2em] text-black/60 md:max-w-[520px]">
            Confidential AI for sensitive data — security, privacy, and confidentiality backed by modern cryptography.
          </p>
        </div>
      </header>
      <main className="relative z-10">
        <section className="flex justify-center px-4 py-12 md:py-20">
          <div className="relative w-full max-w-[880px] overflow-hidden rounded-[40px] border border-black/15 bg-[#E2E2E2] pb-16 pt-12 shadow-[0_50px_120px_-45px_rgba(0,0,0,0.6)]">
            <div
              className="pointer-events-none absolute inset-x-8 top-0 h-[170px] -translate-y-1/2 rounded-[160px] bg-[radial-gradient(circle_at_top,#E2E2E2_20%,rgba(27,9,134,0.42)_65%,rgba(27,9,134,0)_100%)]"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(211.15deg,rgba(0,0,0,0)_18.84%,rgba(0,0,0,0.14)_103.94%)]"
              aria-hidden
            />
            <div className="relative grid gap-12 px-8 md:grid-cols-[minmax(0,0.58fr)_minmax(0,0.42fr)] md:px-12">
              <div className="flex flex-col gap-10">
                <div className="space-y-6">
                  <span className="inline-flex items-center rounded-full border border-black/50 px-4 py-1 text-xs font-medium uppercase tracking-[0.3em]">
                    Concrete AI
                  </span>
                  <h1 className="text-[52px] font-bold leading-[55px]">Confidential AI at production scale.</h1>
                  <p className="max-w-[389px] text-base leading-[22px]">
                    Concrete AI delivers verifiable confidentiality so you can operationalize sensitive data with trusted
                    AI. Every request inherits cryptographic proof, preserving privacy, compliance, and proprietary IP.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button
                    className="h-9 w-full rounded-full bg-black px-6 text-sm font-normal text-white hover:bg-black/90 sm:w-auto sm:min-w-[190px]"
                    asChild
                  >
                    <Link href="/confidential-ai">
                      Launch Console
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-9 w-full rounded-full border border-black px-6 text-sm font-normal text-black hover:bg-black/10 sm:w-auto sm:min-w-[190px]"
                    asChild
                  >
                    <a href="mailto:contact@concrete-security.com">Talk to Security</a>
                  </Button>
                </div>
              </div>
              <div className="flex flex-col gap-6 rounded-[32px] border border-black/15 bg-white/70 p-8 backdrop-blur-sm">
                {heroHighlights.map((highlight) => {
                  const Icon = highlight.icon
                  return (
                    <div key={highlight.title} className="flex flex-col gap-3">
                      <div className="flex h-[29px] w-[29px] items-center justify-center rounded-md bg-[#1B0986]">
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-sm font-semibold leading-5">{highlight.title}</p>
                        <p className="text-sm leading-5 text-black/70">{highlight.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
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
                  className="h-9 w-full rounded-full border border-white bg-white px-6 text-sm font-normal text-black hover:bg-white/90 sm:w-auto sm:min-w-[200px]"
                  asChild
                >
                  <Link href="/confidential-ai">
                    Start Secure Chat
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className="h-9 w-full rounded-full border border-white/70 px-6 text-sm font-normal text-white hover:bg-white/10 sm:w-auto sm:min-w-[200px]"
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
    </div>
  )
}
