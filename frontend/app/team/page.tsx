"use client"

import Link from "next/link"
import Image from "next/image"
import { ArrowLeft } from "lucide-react"
import { motion } from "framer-motion"

import { Button } from "@/components/ui/button"
import { FadeIn } from "@/components/motion/fade-in"
import { StaggerChildren } from "@/components/motion/stagger-children"
import { fadeUp } from "@/lib/motion-variants"
import peopleData from "@/people.json"

export default function TeamPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Ambient background glow */}
      <div
        className="pointer-events-none fixed inset-0 opacity-40"
        aria-hidden="true"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 20% -10%, hsl(var(--accent) / 0.12) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 80% 110%, hsl(var(--brand-primary) / 0.08) 0%, transparent 50%)",
        }}
      />

      <header className="relative z-10 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="container flex items-center justify-between gap-4 px-6 py-6">
          <Link href="/" className="flex items-center gap-3 text-lg font-semibold tracking-tight">
            <Image src="/logo.png" alt="Umbra logo" width={40} height={40} className="mix-blend-multiply dark:mix-blend-normal dark:invert" />
          </Link>
          <div className="flex items-center gap-3">
            <Button
              className="hidden h-9 rounded-full border border-primary/60 bg-transparent px-5 text-sm font-medium text-primary transition hover:border-primary hover:bg-primary/10 md:inline-flex"
              asChild
              variant="outline"
            >
              <a href="mailto:contact@concrete-security.com">Contact us</a>
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <section className="px-4 py-16 md:py-24">
          <div className="container flex flex-col gap-10">
            <FadeIn direction="up" distance={20}>
              <div className="flex flex-col gap-6">
                <Link
                  href="/"
                  className="flex items-center gap-2 text-sm text-muted-foreground transition hover:text-primary"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Home
                </Link>
                <div className="max-w-[720px] space-y-4">
                  <span className="text-overline uppercase tracking-[0.4em] text-muted-foreground">Our Team</span>
                  <h1 className="text-heading-lg text-foreground md:text-display-lg">
                    Building the Future of Confidential AI
                  </h1>
                  <p className="text-body-lg text-muted-foreground">
                    We are a team of AI researchers, security researchers, AI engineers, and security engineers building
                    solutions for confidentiality, privacy, and IP protection. Our team has deep expertise in TEE, FHE,
                    PPML, side channels, and hardware security.
                  </p>
                </div>
              </div>
            </FadeIn>

            <StaggerChildren stagger={0.12} className="grid gap-6 md:grid-cols-3">
              {peopleData.people.map((person) => (
                <motion.div
                  key={person.name}
                  variants={fadeUp}
                  className="group flex flex-col gap-5 rounded-[28px] glass-card p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-glow-accent"
                >
                  <div className="relative h-24 w-24 overflow-hidden rounded-full ring-2 ring-accent/30 ring-offset-2 ring-offset-background transition-all duration-300 group-hover:ring-accent/60">
                    <Image
                      src={person.image}
                      alt={person.name}
                      fill
                      className="object-cover"
                      sizes="96px"
                    />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold leading-6 text-foreground">{person.name}</h3>
                    <p className="text-sm leading-6 text-muted-foreground">{person.expertise}</p>
                  </div>
                </motion.div>
              ))}
            </StaggerChildren>
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
            <Link className="transition hover:text-primary" href="/team">
              Team
            </Link>
            <a className="transition hover:text-primary" href="mailto:contact@concrete-security.com">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
