"use client"

import Link from "next/link"
import Image from "next/image"
import { ArrowLeft } from "lucide-react"

import { ForceLightTheme } from "@/components/force-light-theme"
import { Button } from "@/components/ui/button"
import peopleData from "@/people.json"

export default function TeamPage() {
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

      <main className="relative z-10">
        <section className="px-4 py-16 md:py-24">
          <div className="container flex flex-col gap-10">
            <div className="flex flex-col gap-6">
              <Link
                href="/"
                className="flex items-center gap-2 text-sm text-[#1F1E28]/70 transition hover:text-[#1B0986]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Home
              </Link>
              <div className="max-w-[720px] space-y-4">
                <span className="text-xs uppercase tracking-[0.4em] text-[#1F1E28]/70">Our Team</span>
                <h1 className="text-[42px] font-bold leading-[48px] text-[#08070B]">
                  Building the Future of Confidential AI
                </h1>
                <p className="text-base leading-7 text-[#1F1E28]">
                  We are a team of AI researchers, security researchers, AI engineers, and security engineers building
                  solutions for confidentiality, privacy, and IP protection. Our team has deep expertise in TEE, FHE,
                  PPML, side channels, and hardware security.
                </p>
              </div>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {peopleData.people.map((person) => (
                <div
                  key={person.name}
                  className="flex flex-col gap-5 rounded-[28px] border border-[#d4d3e6] bg-white/95 p-6 shadow-[0_32px_78px_-64px_rgba(15,10,80,0.35)] backdrop-blur-sm"
                >
                  <div className="relative h-24 w-24 overflow-hidden rounded-full border-2 border-[#d4d3e6]">
                    <Image
                      src={person.image}
                      alt={person.name}
                      fill
                      className="object-cover"
                      sizes="96px"
                    />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold leading-6 text-[#08070B]">{person.name}</h3>
                    <p className="text-sm leading-6 text-[#1F1E28]/80">{person.expertise}</p>
                  </div>
                </div>
              ))}
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
            <Link className="transition hover:text-[#1B0986]" href="/team">
              Team
            </Link>
            <a className="transition hover:text-[#1B0986]" href="mailto:contact@concrete-security.com">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
