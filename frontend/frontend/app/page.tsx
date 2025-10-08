"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import peopleData from "../people.json"
import { motion } from "framer-motion"
import {
  Check,
  ChevronRight,
  Menu,
  X,
  Moon,
  Sun,
  ArrowRight,
  Star,
  Zap,
  Shield,
  Users,
  BarChart,
  Layers,
  Lock,
  Code,
  MessageSquare,
  Bot,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { useTheme } from "next-themes"

export default function LandingPage() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const handleScroll = () => {
      if (window.scrollY > 10) {
        setIsScrolled(true)
      } else {
        setIsScrolled(false)
      }
    }

    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark")
  }

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  }

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  }

  const features = [
    {
      title: "Confidential by Design",
      description: "Run AI on sensitive data without exposing it to providers or operators.",
      icon: <Zap className="size-5" />,
    },
    {
      title: "Cryptography‑Backed Security",
      description: "End‑to‑end protection in transit, at rest, and in use — anchored by modern cryptography.",
      icon: <Shield className="size-5" />,
    },
    {
      title: "Privacy Controls",
      description: "Granular access, policy enforcement, and audit logs for clear governance.",
      icon: <Users className="size-5" />,
    },
    {
      title: "Compliance‑Ready",
      description: "Support common regulatory needs with strong data boundaries and visibility.",
      icon: <BarChart className="size-5" />,
    },
    {
      title: "Seamless Integrations",
      description: "SDKs and APIs to connect data sources and MLOps pipelines securely.",
      icon: <Layers className="size-5" />,
    },
    {
      title: "Priority Support",
      description: "Experts to help design and scale confidentiality‑first AI systems.",
      icon: <Star className="size-5" />,
    },
  ];

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header
        className={`sticky top-0 z-50 w-full backdrop-blur-lg transition-all duration-300 ${isScrolled ? "bg-background/80 shadow-sm" : "bg-transparent"}`}
      >
          <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <Image src="/logo.png" alt="Concrete AI logo" width={28} height={28} className="rounded-sm" />
            <span>Concrete AI</span>
          </Link>
          <nav className="hidden md:flex gap-8">
            <Link
              href="#features"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Features
            </Link>
            
            <Link
              href="#pricing"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Pricing
            </Link>
            <Link
              href="#faq"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              FAQ
            </Link>
          </nav>
          <div className="hidden md:flex gap-4 items-center">
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="rounded-full">
              {mounted && theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
              <span className="sr-only">Toggle theme</span>
            </Button>
            <Button className="rounded-full" asChild>
              <Link href="/confidential-ai" prefetch={false}>
                Try Confidential AI
                <ChevronRight className="ml-1 size-4" />
              </Link>
            </Button>
            <Button variant="outline" className="rounded-full" asChild>
              <a href="mailto:contact@concrete-security.com">Contact Us</a>
            </Button>
          </div>
          <div className="flex items-center gap-4 md:hidden">
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="rounded-full">
              {mounted && theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
              <span className="sr-only">Toggle menu</span>
            </Button>
          </div>
        </div>
        {/* Mobile menu */}
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="md:hidden absolute top-16 inset-x-0 bg-background/95 backdrop-blur-lg border-b"
          >
            <div className="container py-4 flex flex-col gap-4">
              <Link href="#features" className="py-2 text-sm font-medium" onClick={() => setMobileMenuOpen(false)}>
                Features
              </Link>
              
              <Link href="#pricing" className="py-2 text-sm font-medium" onClick={() => setMobileMenuOpen(false)}>
                Pricing
              </Link>
              <Link href="#faq" className="py-2 text-sm font-medium" onClick={() => setMobileMenuOpen(false)}>
                FAQ
              </Link>
              <div className="flex flex-col gap-2 pt-2 border-t">
                <Button className="rounded-full" asChild>
                  <Link href="/confidential-ai" prefetch={false} onClick={() => setMobileMenuOpen(false)}>
                    Try Confidential AI
                    <ChevronRight className="ml-1 size-4" />
                  </Link>
                </Button>
                <Button variant="outline" className="rounded-full" asChild>
                  <a href="mailto:contact@concrete-security.com">Contact Us</a>
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </header>
      <main className="flex-1">
        {/* Hero Section */}
        <section className="w-full py-16 md:py-28 overflow-hidden">
          <div className="container px-4 md:px-6 max-w-screen-xl">
            <div className="grid gap-10 md:grid-cols-12 md:gap-12 items-start">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="md:col-span-7"
              >
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-tight mb-6">
                  Concrete AI
                </h1>
                <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-xl">
                  Confidential AI for sensitive data — security, privacy, and confidentiality backed by modern cryptography.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <Button size="lg" className="rounded-full h-12 px-8 text-base" asChild>
                    <Link href="/confidential-ai" prefetch={false}>
                      Try Confidential AI
                      <ArrowRight className="ml-2 size-4" />
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" className="rounded-full h-12 px-8 text-base" asChild>
                    <a href="mailto:contact@concrete-security.com">Contact Us</a>
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mt-4">
                Have a confidential AI use case? <a className="underline" href="mailto:contact@concrete-security.com">Contact us</a>.
                </p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="md:col-span-5 relative"
              >
                <div className="rounded-2xl overflow-hidden shadow-xl ring-1 ring-border/50 bg-background">
                  <Image
                    src="/assets/hero.png"
                    width={1280}
                    height={960}
                    alt="Concrete AI visual"
                    className="w-full h-72 md:h-96 object-cover"
                    priority
                  />
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Security Guarantees Section */}
        <section className="w-full py-16 md:py-24 bg-muted/30">
          <div className="container px-4 md:px-6 max-w-screen-xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
              className="flex flex-col items-start justify-center space-y-4 text-left mb-10"
            >
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Security, Privacy, and IP Protection</h2>
              <p className="max-w-[900px] text-muted-foreground md:text-lg">
                Concrete AI gives privacy for both users and operators by encrypting everything, including both prompts and
                models. Use of your data is controlled by strict attested execution and additional policy controls. Nobody can
                see your data, not even us.
              </p>
            </motion.div>
            <div className="grid gap-6 sm:grid-cols-3">
              <div className="rounded-lg border bg-card p-5">
                <div className="flex items-center gap-2 mb-2 text-sm font-medium text-primary"><Shield className="size-4" /> Cryptographic Security</div>
                <p className="text-sm text-muted-foreground">Encryption in transit, at rest, and in use with attestation and auditability.</p>
              </div>
              <div className="rounded-lg border bg-card p-5">
                <div className="flex items-center gap-2 mb-2 text-sm font-medium text-primary"><Lock className="size-4" /> User Privacy</div>
                <p className="text-sm text-muted-foreground">Client‑side encryption ensures plaintext data never leaves user control.</p>
              </div>
              <div className="rounded-lg border bg-card p-5">
                <div className="flex items-center gap-2 mb-2 text-sm font-medium text-primary"><Layers className="size-4" /> Provider IP</div>
                <p className="text-sm text-muted-foreground">Model IP protected via isolated, measured runtimes and strict policies.</p>
              </div>
            </div>
          </div>
        </section>

        

        {/* Who We Are Section */}
        <section className="w-full py-16 md:py-24 bg-muted/30">
          <div className="container px-4 md:px-6 max-w-screen-xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
              className="flex flex-col items-start justify-center space-y-4 text-left mb-8"
            >
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Who We Are</h2>
              <p className="max-w-[900px] text-muted-foreground md:text-lg">
                We’re a team of cryptography, secure‑systems, and AI engineers building confidential AI so
                organizations can use sensitive data without compromise. Our approach blends modern cryptography with
                practical product design—verifiable, privacy‑by‑default, and developer‑friendly.
              </p>
            </motion.div>

            <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
              {peopleData.people.map((p, i) => (
                <motion.div
                  key={p.name}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                >
                  <div className="rounded-lg border bg-card p-6 text-center h-full flex flex-col items-center">
                    <Image
                      src={p.image}
                      alt={p.name}
                      width={128}
                      height={128}
                      className="mb-4 h-32 w-32 rounded-full object-cover ring-1 ring-border"
                    />
                    <h3 className="mt-4 text-base font-semibold">{p.name}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{p.expertise}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            
          </div>
        </section>

        {/* Use Cases Section */}
        <section className="w-full py-16 md:py-24">
          <div className="container px-4 md:px-6 max-w-screen-xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
              className="flex flex-col items-start justify-center space-y-4 text-left mb-10"
            >
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Use Cases</h2>
              <p className="max-w-[900px] text-muted-foreground md:text-lg">
                From confidential inference to sensitive fine‑tuning and secure retrieval—choose the mechanism that fits
                your workload. We support both TEE and FHE, just choose the one that fits your needs.
              </p>
            </motion.div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border p-5">
                <div className="flex items-center gap-2 mb-2 text-sm font-medium text-primary"><Zap className="size-4" /> LLM Inference</div>
                <p className="text-sm text-muted-foreground">Run prompts over sensitive data without exposing plaintext to operators or providers.</p>
              </div>
              <div className="rounded-lg border p-5">
                <div className="flex items-center gap-2 mb-2 text-sm font-medium text-primary"><Layers className="size-4" /> Fine‑Tuning</div>
                <p className="text-sm text-muted-foreground">Adapt models with private datasets. Choose FHE/TEE/MPC based on security and throughput.</p>
              </div>
              <div className="rounded-lg border p-5">
                <div className="flex items-center gap-2 mb-2 text-sm font-medium text-primary"><BarChart className="size-4" /> Secure RAG/Analytics</div>
                <p className="text-sm text-muted-foreground">Search and analyze encrypted corpora with confidential pipelines and clear audit trails.</p>
              </div>
              <div className="rounded-lg border p-5">
                <div className="flex items-center gap-2 mb-2 text-sm font-medium text-primary"><Users className="size-4" /> Multi‑Party Collaboration</div>
                <p className="text-sm text-muted-foreground">Compute across organizations without sharing raw data, preserving privacy and IP.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="w-full py-16 md:py-24">
          <div className="container px-4 md:px-6 max-w-screen-xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-start justify-center space-y-4 text-left mb-10"
            >
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Key Benefits</h2>
              <p className="max-w-[800px] text-muted-foreground md:text-lg">
                A focused set of capabilities to keep your data protected while enabling powerful AI experiences.
              </p>
            </motion.div>

            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: i * 0.05 }}>
                  <div className="flex flex-col">
                    <div className="size-10 rounded-md bg-primary/10 flex items-center justify-center text-primary mb-3">
                      {feature.icon}
                    </div>
                    <h3 className="text-xl font-bold mb-1">{feature.title}</h3>
                    <p className="text-muted-foreground">{feature.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="w-full py-20 md:py-32 bg-muted/30 relative overflow-hidden">
          

          <div className="container px-4 md:px-6 relative max-w-screen-xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center justify-center space-y-4 text-center mb-16"
            >
              <Badge className="rounded-full px-4 py-1.5 text-sm font-medium" variant="secondary">
                How It Works
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">How Confidential AI Works</h2>
              <p className="max-w-[800px] text-muted-foreground md:text-lg">
                Data stays protected from end to end — encrypted client‑side and processed in cryptography‑backed environments.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-8 md:gap-12 relative">
              <div className="hidden md:block absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-border to-transparent -translate-y-1/2 z-0"></div>

              {[
                {
                  step: "01",
                  title: "Encrypt Client‑Side",
                  description: "Your data is encrypted before it leaves your device. Keys remain under your control.",
                },
                {
                  step: "02",
                  title: "Process with Proof",
                  description: "Data is processed in cryptography‑backed environments with attestations and auditability.",
                },
                {
                  step: "03",
                  title: "Deliver Results",
                  description: "Only authorized outputs are returned with logs and evidence for governance.",
                },
              ].map((step, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  className="relative z-10 flex flex-col items-center text-center space-y-4"
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground text-xl font-bold shadow-lg">
                    {step.step}
                  </div>
                  <h3 className="text-xl font-bold">{step.title}</h3>
                  <p className="text-muted-foreground">{step.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        

        {/* Pricing Section */}
        <section id="pricing" className="w-full py-16 md:py-24 relative overflow-hidden">
          <div className="container px-4 md:px-6 relative max-w-screen-xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center justify-center space-y-4 text-center mb-12"
            >
              <Badge className="rounded-full px-4 py-1.5 text-sm font-medium" variant="secondary">
                Pricing
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Simple, Transparent Pricing</h2>
              <p className="max-w-[800px] text-muted-foreground md:text-lg">
                Choose the plan that's right for your business.
              </p>
            </motion.div>

            <div className="mx-auto max-w-3xl">
              <Card className="overflow-hidden border-border/40 bg-gradient-to-b from-background to-muted/10 backdrop-blur">
                <CardContent className="p-6 md:p-8">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                    <div>
                      <h3 className="text-2xl font-bold">Full Confidential AI Access</h3>
                      <p className="text-muted-foreground mt-2">One plan, all features — simple and transparent.</p>
                      <ul className="space-y-2 mt-4">
                        <li className="flex items-center"><Check className="mr-2 size-4 text-primary" /> Secure, cryptography‑backed processing</li>
                        <li className="flex items-center"><Check className="mr-2 size-4 text-primary" /> Confidential AI chat access</li>
                        <li className="flex items-center"><Check className="mr-2 size-4 text-primary" /> Email support</li>
                      </ul>
                    </div>
                    <div className="text-center md:text-right">
                      <div className="text-4xl font-bold">$29<span className="text-lg align-top font-normal">/mo</span></div>
                      <div className="mt-4 flex gap-3 justify-center md:justify-end">
                        <Button className="rounded-full px-6" asChild>
                          <Link href="/confidential-ai">Try Confidential AI</Link>
                        </Button>
                        <Button variant="outline" className="rounded-full px-6" asChild>
                          <a href="mailto:contact@concrete-security.com">Contact Us</a>
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section id="faq" className="w-full py-20 md:py-32">
          <div className="container px-4 md:px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center justify-center space-y-4 text-center mb-12"
            >
              <Badge className="rounded-full px-4 py-1.5 text-sm font-medium" variant="secondary">
                FAQ
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Frequently Asked Questions</h2>
              <p className="max-w-[800px] text-muted-foreground md:text-lg">
                Find answers to common questions about our platform.
              </p>
            </motion.div>

            <div className="mx-auto max-w-3xl">
              <Accordion type="single" collapsible className="w-full">
                {[
                  {
                    question: "How do you keep my data confidential?",
                    answer:
                      "We use a combination of Trusted Execution Environments (TEE) and Fully Homomorphic Encryption (FHE) via a custom protocol. This ensures all data and code stay encrypted and attested so only authorized operations run without exposing your data.",
                  },
                  {
                    question: "Can I change plans later?",
                    answer:
                      "Yes, you can upgrade or downgrade your plan at any time. If you upgrade, the new pricing will be prorated for the remainder of your billing cycle. If you downgrade, the new pricing will take effect at the start of your next billing cycle.",
                  },
                  {
                    question: "Is there a limit to how many users I can add?",
                    answer:
                      "The number of users depends on your plan. The Starter plan allows up to 5 team members, the Professional plan allows up to 20, and the Enterprise plan has no limit on team members.",
                  },
                  {
                    question: "Do you offer discounts for nonprofits or educational institutions?",
                    answer:
                      "Yes, we offer special pricing for nonprofits, educational institutions, and open-source projects. Please contact our sales team for more information.",
                  },
                  {
                    question: "What kind of support do you offer?",
                    answer:
                      "Support varies by plan. All plans include email support, with the Professional plan offering priority email support. The Enterprise plan includes 24/7 phone and email support. We also have an extensive knowledge base and community forum available to all users.",
                  },
                ].map((faq, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: i * 0.05 }}
                  >
                    <AccordionItem value={`item-${i}`} className="border-b border-border/40 py-2">
                      <AccordionTrigger className="text-left font-medium hover:no-underline">
                        {faq.question}
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground">{faq.answer}</AccordionContent>
                    </AccordionItem>
                  </motion.div>
                ))}
              </Accordion>
            </div>
          </div>
        </section>

        
      </main>
      <footer className="w-full border-t bg-background/95 backdrop-blur-sm">
        <div className="container flex flex-col gap-8 px-4 py-10 md:px-6 lg:py-16">
          <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
            <div className="space-y-4">
              <Link href="/" className="flex items-center gap-2 font-bold">
                <Image src="/logo.png" alt="Concrete AI logo" width={28} height={28} className="rounded-sm" />
                <span>Concrete AI</span>
              </Link>
              <p className="text-sm text-muted-foreground">
                Confidential AI for sensitive data — backed by modern cryptography.
              </p>
              <div className="flex gap-4">
                <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-5"
                  >
                    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
                  </svg>
                  <span className="sr-only">Facebook</span>
                </Link>
                <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-5"
                  >
                    <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"></path>
                  </svg>
                  <span className="sr-only">Twitter</span>
                </Link>
                <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-5"
                  >
                    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path>
                    <rect width="4" height="12" x="2" y="9"></rect>
                    <circle cx="4" cy="4" r="2"></circle>
                  </svg>
                  <span className="sr-only">LinkedIn</span>
                </Link>
              </div>
            </div>
            <div className="space-y-4">
              <h4 className="text-sm font-bold">Product</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="#features" className="text-muted-foreground hover:text-foreground transition-colors">
                    Features
                  </Link>
                </li>
                <li>
                  <Link href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                    Integrations
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                    API
                  </Link>
                </li>
              </ul>
            </div>
            <div className="space-y-4">
              <h4 className="text-sm font-bold">Resources</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                    Documentation
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                    Guides
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                    Blog
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                    Support
                  </Link>
                </li>
              </ul>
            </div>
            <div className="space-y-4">
              <h4 className="text-sm font-bold">Company</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                    About
                  </Link>
                </li>
                <li>
                  <a href="mailto:contact@concrete-security.com" className="text-muted-foreground hover:text-foreground transition-colors">
                    Contact Us
                  </a>
                </li>
                <li>
                  <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                    Careers
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                    Terms of Service
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row justify-between items-center border-t border-border/40 pt-8">
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} Concrete AI. All rights reserved.
            </p>
            <div className="flex gap-4">
              <Link href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Privacy Policy
              </Link>
              <Link href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Terms of Service
              </Link>
              <Link href="#" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Cookie Policy
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
