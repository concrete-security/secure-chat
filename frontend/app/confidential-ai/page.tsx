"use client"

import { useState, FormEvent, KeyboardEvent, useMemo, useRef, useEffect, useCallback } from "react"

import Link from "next/link"
import Image from "next/image"
import { useTheme } from "next-themes"
import { ArrowDown, Send, Lock, Shield, ShieldCheck, Cpu, CheckCircle2, Bot, Globe, Paperclip, FileText, X, Sparkles, ChevronDown, Key, Sun, Moon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { streamConfidentialChat, confidentialChatConfig } from "@/lib/confidential-chat"
import { Markdown } from "@/components/markdown"
import { cn } from "@/lib/utils"


type Message = {
  role: "user" | "assistant"
  content: string
  attachments?: UploadedFile[]
  reasoning_content?: string
  streaming?: boolean
  finishReason?: string
}
type UploadedFile = { name: string; content: string; size: number; type: string }

type HostParts = {
  host: string
  hostname: string
}

type StoredProviderSettings = {
  baseUrl?: string
}

const PROVIDER_SETTINGS_STORAGE_KEY = "confidential-provider-settings-v1"
const PROVIDER_TOKEN_SESSION_KEY = "confidential-provider-token"

function normalize(value?: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseHost(value?: string | null): HostParts | null {
  if (!value) return null
  try {
    const candidate = value.includes("://") ? value : `http://${value}`
    const url = new URL(candidate)
    const host = url.port ? `${url.hostname}:${url.port}` : url.hostname
    return { host, hostname: url.hostname }
  } catch {
    return null
  }
}

function isLoopbackHostname(hostname?: string | null) {
  if (!hostname) return false
  const normalized = hostname.toLowerCase()
  if (normalized === "localhost" || normalized === "::1" || normalized === "0.0.0.0") {
    return true
  }
  if (normalized.startsWith("127.")) {
    return true
  }
  return false
}

function sanitizeDisplayName(displayName: string | null) {
  if (!displayName) return null
  return displayName.toLowerCase().includes("vllm") ? null : displayName
}

function buildGreeting(model: string | null, displayName: string | null, host: string | null) {
  void model
  void displayName
  void host
  return "Secure channel with Umbra. How can I help you today?"
}

function truncateMiddle(str: string, maxLength: number = 40): string {
  if (str.length <= maxLength) return str
  const ellipsis = "..."
  const charsToShow = maxLength - ellipsis.length
  const frontChars = Math.ceil(charsToShow / 2)
  const backChars = Math.floor(charsToShow / 2)
  return str.slice(0, frontChars) + ellipsis + str.slice(-backChars)
}

export default function ConfidentialAIPage() {
  const envProviderApiBase = normalize(confidentialChatConfig.providerApiBase)
  const envProviderModel = normalize(confidentialChatConfig.providerModel)
  const envProviderDisplayName = normalize(confidentialChatConfig.providerName) ?? envProviderModel

  const [providerBaseUrlInput, setProviderBaseUrlInput] = useState(() => envProviderApiBase ?? "")
  const [providerApiKeyInput, setProviderApiKeyInput] = useState("")
  const [configError, setConfigError] = useState<string | null>(null)
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false)

  const providerApiBase = normalize(providerBaseUrlInput)
  const providerModel = envProviderModel
  const providerDisplayName = envProviderDisplayName ?? providerModel ?? null
  const sanitizedDisplayName = sanitizeDisplayName(providerDisplayName)

  const providerHostParts = useMemo(() => {
    if (providerApiBase) {
      return parseHost(providerApiBase)
    }
    if (envProviderApiBase) {
      return parseHost(envProviderApiBase)
    }
    return null
  }, [providerApiBase, envProviderApiBase])

  const providerHost = providerHostParts?.host ?? null

  const assistantName = (() => {
    const candidate = sanitizedDisplayName ?? providerModel ?? null
    if (!candidate) return "Umbra"
    return /concrete/i.test(candidate) ? "Umbra" : candidate
  })()

  const connectionSummary = providerApiBase
    ? providerModel
      ? `Direct connection to model ${providerModel}${providerHost ? ` via ${providerHost}` : ""}.`
      : providerHost
        ? `Direct connection via ${providerHost}.`
        : "Direct connection configured."
    : "Provide a confidential provider base URL to enable remote inference."
  const providerConfigured = Boolean(providerApiBase)
  const tokenPresent = providerApiKeyInput.trim().length > 0

  const [messages, setMessages] = useState<Message[]>(() => [
    {
      role: "assistant",
      content: buildGreeting(providerModel, assistantName, providerHost),
    },
  ])

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const raw = window.localStorage.getItem(PROVIDER_SETTINGS_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as StoredProviderSettings
        if (typeof parsed.baseUrl === "string") {
          setProviderBaseUrlInput(parsed.baseUrl)
        }
      }

      const storedToken = window.sessionStorage.getItem(PROVIDER_TOKEN_SESSION_KEY)
      if (typeof storedToken === "string") {
        setProviderApiKeyInput(storedToken)
      }
    } catch (error) {
      console.warn("Failed to restore provider settings", error)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const payload: StoredProviderSettings = {
        baseUrl: providerBaseUrlInput,
      }
      window.localStorage.setItem(PROVIDER_SETTINGS_STORAGE_KEY, JSON.stringify(payload))
    } catch (error) {
      console.warn("Failed to persist provider settings", error)
    }
  }, [providerBaseUrlInput])

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const trimmed = providerApiKeyInput.trim()
      if (trimmed) {
        window.sessionStorage.setItem(PROVIDER_TOKEN_SESSION_KEY, trimmed)
      } else {
        window.sessionStorage.removeItem(PROVIDER_TOKEN_SESSION_KEY)
      }
    } catch (error) {
      console.warn("Failed to persist provider token", error)
    }
  }, [providerApiKeyInput])

  useEffect(() => {
    if (configError && configError.includes("base URL") && providerApiBase) {
      setConfigError(null)
    }
  }, [configError, providerApiBase])

  useEffect(() => {
    setMessages((previous) => {
      if (previous.length === 0) return previous
      if (previous.some((message) => message.role === "user")) return previous

      const [first, ...rest] = previous
      if (first.role !== "assistant") return previous

      const updatedGreeting = buildGreeting(providerModel, assistantName, providerHost)
      if (first.content === updatedGreeting) return previous

      return [{ ...first, content: updatedGreeting }, ...rest]
    })
  }, [providerModel, assistantName, providerHost])
  const [input, setInput] = useState("")
  const [encrypting, setEncrypting] = useState(false)
  const [cipherPreview, setCipherPreview] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [reasoningEffort, setReasoningEffort] = useState<"low" | "medium" | "high">("medium")
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ref that will serve as the "scroll anchor" for the chat bottom
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement | null>(null)
  const lastScrollTopRef = useRef(0)
  const isProgrammaticScrollRef = useRef(false)

  // Track whether we should auto-scroll (only after sending/receiving a message)
  const [shouldScroll, setShouldScroll] = useState(false)
  const [reasoningOpen, setReasoningOpen] = useState<Record<number, boolean>>({})
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true)
  const [hasNewMessages, setHasNewMessages] = useState(false)
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true)
  const { theme: currentTheme, resolvedTheme, setTheme } = useTheme()
  const [themeReady, setThemeReady] = useState(false)
  const [cacheSalt, setCacheSalt] = useState<string | null>(null)

  useEffect(() => {
    setThemeReady(true)
  }, [])

  useEffect(() => {
    const CACHE_SALT_KEY = "confidential-ai-cache-salt"
    let salt = localStorage.getItem(CACHE_SALT_KEY)
    if (!salt) {
      salt = crypto.randomUUID()
      localStorage.setItem(CACHE_SALT_KEY, salt)
    }
    setCacheSalt(salt)
  }, [])

  const activeTheme = (currentTheme === "system" ? resolvedTheme : currentTheme) ?? "light"
  const handleThemeToggle = () => {
    setTheme(activeTheme === "dark" ? "light" : "dark")
  }
  const isStreaming = useMemo(() => messages.some((message) => message.streaming), [messages])


  const toHexPreview = (s: string) => {
    try {
      const hex = Array.from(s)
        .map((ch) => ch.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 48)
      return `0x${hex}${s.length > 24 ? "…" : ""}`
    } catch {
      return "0x…"
    }
  }
  // Upload files
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files) return

    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      // Check file size (limit to 100MB for all files)
      const maxSize = 100 * 1024 * 1024 
      if (file.size > maxSize) {
        const maxSizeText = '100MB'
        alert(`File "${file.name}" is too large. Maximum size is ${maxSizeText}.`)
        continue
      }

      try {
        let content: string

        if (file.type === 'application/pdf') {
          // ici
          content = await extractTextFromPDF(file)
        } else {
          content = await file.text()
        }

        const uploadedFile: UploadedFile = {
          name: file.name,
          content,
          size: file.size,
          type: file.type || 'text/plain'
        }

        setUploadedFiles(prev => [...prev, uploadedFile])
      } catch (error) {
        console.error('Error reading file:', error)
        alert(`Failed to read file "${file.name}": ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    // Reset the input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const countWords = (text: string) => {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length
  }

  const formatWordCount = (count: number) => {
    return count === 1 ? '1 word' : `${count} words`
  }
  // Extract only text
  const extractTextFromPDF = async (file: File): Promise<string> => {
    try {

      const pdfjsLibModule = await import(/* webpackIgnore: true */ "/pdfjs/pdf.mjs")
      const pdfjsLib = (pdfjsLibModule as unknown as { default?: any }).default ?? (window as any).pdfjsLib ?? pdfjsLibModule

      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.mjs"

      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      let text = ''

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const textContent = await page.getTextContent()
        const pageText = textContent.items
          .map((item: any) => ("str" in item ? item.str : ""))
          .join(' ')
        text += pageText + '\n'
      }
      return text.trim()
    } catch (error) {
      console.error('Error extracting text from PDF:', error)
      throw new Error('Failed to extract text from PDF')
    }
  }


  const sendMessage = async () => {
    if (isSending) return
    const text = input.trim()
    if (!text && uploadedFiles.length === 0) return

    if (!providerApiBase) {
      setConfigError("Add a confidential provider base URL before starting a session.")
      return
    }

    if (!providerModel) {
      setConfigError("Set NEXT_PUBLIC_VLLM_MODEL in your environment before starting a session.")
      return
    }

    const trimmedToken = providerApiKeyInput.trim()

    // Create message content including file contents
    let messageContent = text
    if (uploadedFiles.length > 0) {
      const fileContents = uploadedFiles.map(file =>
        `\n\n[File: ${file.name}]\n${file.content}`
      ).join('')
      messageContent = text + fileContents
    }

    const userMessage: Message = {
      role: "user",
      content: messageContent,
      attachments: uploadedFiles.length > 0 ? [...uploadedFiles] : undefined,
    }

    const conversationBeforeAssistant: Message[] = [...messages, userMessage]
    const assistantPlaceholder: Message = {
      role: "assistant",
      content: "",
      streaming: true,
    }

    const conversationWithAssistant: Message[] = [...conversationBeforeAssistant, assistantPlaceholder]
    const assistantIndex = conversationWithAssistant.length - 1

    setEncrypting(true)
    setCipherPreview(toHexPreview(messageContent))
    setMessages(conversationWithAssistant)
    setReasoningOpen((prev) => ({ ...prev, [assistantIndex]: false }))
    setInput("")
    setUploadedFiles([])
    setIsSending(true)

    // Trigger scroll only when a new message is sent by the user
    setShouldScroll(true)

    const sanitizedHistory = conversationBeforeAssistant.map((m) => ({ role: m.role, content: m.content }))

    const updateAssistantMessage = (patch: Partial<Message>) => {
      setMessages((prev) => {
        if (assistantIndex < 0 || assistantIndex >= prev.length) return prev
        const next = [...prev]
        const existing = next[assistantIndex]
        if (!existing) return prev
        next[assistantIndex] = { ...existing, ...patch }
        return next
      })
    }

    try {
      let streamedContent = ""
      let streamedReasoning = ""
      let finishReason: string | undefined

      for await (const chunk of streamConfidentialChat(
        {
          messages: sanitizedHistory,
          ...(providerModel ? { model: providerModel } : {}),
          reasoning_effort: reasoningEffort,
          ...(cacheSalt ? { cache_salt: cacheSalt } : {}),
        },
        {
          provider: {
            baseUrl: providerApiBase,
            apiKey: trimmedToken || undefined,
          },
        }
      )) {
        if (chunk.type === "delta" && chunk.content) {
          streamedContent += chunk.content
          updateAssistantMessage({ content: streamedContent })
          setShouldScroll(true)
        }

        if (chunk.type === "reasoning_delta" && chunk.reasoning_content) {
          streamedReasoning += chunk.reasoning_content
          updateAssistantMessage({ reasoning_content: streamedReasoning })
        }

        if (chunk.type === "error") {
          throw new Error(chunk.error)
        }

        if (chunk.type === "done") {
          if (chunk.content) {
            streamedContent = chunk.content
          }
          if (chunk.reasoning_content) {
            streamedReasoning = chunk.reasoning_content
          }
          if (chunk.finish_reason) {
            finishReason = chunk.finish_reason
          }
        }
      }

      const finalContent = streamedContent.trim()
      const finalReasoning = streamedReasoning.trim()

      updateAssistantMessage({
        content: finalContent || "No response received from the confidential service.",
        reasoning_content: finalReasoning || undefined,
        streaming: false,
        finishReason,
      })
      setShouldScroll(true)
    } catch (error) {
      console.warn("Confidential chat request failed", error)
      const fallback = error instanceof Error && error.message ? error.message : "Please try again later."
      updateAssistantMessage({
        content: `We couldn't reach the confidential service right now. ${fallback}`,
        streaming: false,
        reasoning_content: undefined,
        finishReason: undefined,
      })
      setShouldScroll(true)
    } finally {
      setIsSending(false)
      setEncrypting(false)
      setCipherPreview(null)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void sendMessage()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    const handleUserInteraction = () => {
      if (!isProgrammaticScrollRef.current) {
        setAutoScrollEnabled(false)
      }
    }

    const handleScroll = () => {
      const { scrollTop, clientHeight, scrollHeight } = container
      const distanceFromBottom = Math.max(0, scrollHeight - (scrollTop + clientHeight))
      const tolerance = 24
      const isAtBottom = distanceFromBottom <= tolerance
      lastScrollTopRef.current = scrollTop

      setIsPinnedToBottom(isAtBottom)
      if (isAtBottom) {
        setHasNewMessages(false)
        setAutoScrollEnabled(true)
      }
    }

    handleScroll()
    container.addEventListener("scroll", handleScroll, { passive: true })
    container.addEventListener("wheel", handleUserInteraction, { passive: true })
    container.addEventListener("touchstart", handleUserInteraction, { passive: true })
    
    return () => {
      container.removeEventListener("scroll", handleScroll)
      container.removeEventListener("wheel", handleUserInteraction)
      container.removeEventListener("touchstart", handleUserInteraction)
    }
  }, [])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    isProgrammaticScrollRef.current = true

    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior,
      })
    }

    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: "end" })
    }

    window.requestAnimationFrame(() => {
      if (messagesContainerRef.current) {
        lastScrollTopRef.current = messagesContainerRef.current.scrollTop
      }
      window.requestAnimationFrame(() => {
        isProgrammaticScrollRef.current = false
      })
    })

    setHasNewMessages(false)
    setIsPinnedToBottom(true)
    setAutoScrollEnabled(true)
  }, [])

  // Only auto-scroll when user is already viewing the newest messages
  useEffect(() => {
    if (!shouldScroll) return

    if (autoScrollEnabled) {
      const behavior: ScrollBehavior = messages.length <= 2 || isStreaming ? "auto" : "smooth"
      scrollToBottom(behavior)
    } else {
      setHasNewMessages(true)
    }

    setShouldScroll(false)
  }, [messages, shouldScroll, autoScrollEnabled, scrollToBottom, isStreaming])

  useEffect(() => {
    if (isPinnedToBottom || autoScrollEnabled) {
      scrollToBottom("smooth")
    }
  }, [reasoningOpen, isPinnedToBottom, autoScrollEnabled, scrollToBottom])

  const showScrollToLatest = !isPinnedToBottom && (!autoScrollEnabled || hasNewMessages)

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-[#E2E2E2] text-black">
      <div
        className="pointer-events-none absolute left-1/2 top-[-10rem] h-[440px] w-[848px] -translate-x-1/2 rounded-[50%] border border-black/10 opacity-60"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute right-[-12%] top-[-28%] h-[320px] w-[320px] rounded-full blur-3xl"
        style={{
          background: "radial-gradient(circle at top, rgba(27,9,134,0.35) 0%, rgba(27,9,134,0) 70%)",
        }}
        aria-hidden="true"
      />
      <script src="/pdfjs/pdf.mjs" type="module" />
      <header className="relative z-20 border-b border-black/10 bg-[#E2E2E2]/70 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 md:px-6">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.32em] text-black/60">
            <Lock className="size-4 text-black" />
            <span>Confidential Space</span>
          </div>
          <div className="flex items-center gap-3">
            {themeReady && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleThemeToggle}
                className="rounded-full border border-black/15 bg-white/70 text-black hover:bg-white/90"
              >
                {activeTheme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
                <span className="sr-only">Toggle theme</span>
              </Button>
            )}
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white/70 px-3 py-1 text-sm font-semibold shadow-sm transition hover:bg-white"
            >
              <Image src="/logo.png" alt="Concrete AI logo" width={20} height={20} className="rounded-sm" />
              <span className="tracking-tight">Concrete AI</span>
            </Link>
          </div>
        </div>
      </header>
      <main className="relative z-10 flex flex-1 flex-col min-h-0">
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col min-h-0 px-4 py-8 md:px-6 md:py-10">
          <div className="flex flex-1 flex-col min-h-0 gap-6 md:gap-8" aria-label="Confidential space">
            <div className="grid flex-1 min-h-0 gap-6 lg:grid-cols-[minmax(320px,1fr)_minmax(0,2.2fr)] xl:grid-cols-[minmax(340px,1fr)_minmax(0,2.6fr)]">
              <section className="relative order-1 flex flex-1 flex-col min-h-0 lg:order-2">
                <div className="relative flex flex-1 flex-col overflow-hidden rounded-[32px] border border-black/15 bg-white/80 shadow-[0_45px_90px_-65px_rgba(0,0,0,0.7)] backdrop-blur">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 px-6 py-5 text-[11px] font-semibold uppercase tracking-[0.28em] text-black/60">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-1 text-white">
                        <Lock className="size-3.5 text-white" />
                        Secure session
                      </span>
                      {encrypting && cipherPreview && (
                        <>
                          <span className="opacity-40">•</span>
                          <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.32em] text-black/70">
                            Encrypting {cipherPreview}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-3 py-1 text-black/70">
                      <Sparkles className="size-3.5 text-black" />
                      <span>{reasoningEffort.charAt(0).toUpperCase() + reasoningEffort.slice(1)} reasoning</span>
                    </div>
                  </div>
                  <Card className="flex flex-1 flex-col min-h-0 border-0 bg-transparent shadow-none">
                      <CardContent className="flex flex-1 flex-col min-h-0 p-0">
                        <div className="relative flex flex-1 flex-col min-h-0 overflow-hidden">
                          <div
                            ref={messagesContainerRef}
                            className="flex-1 min-w-0 overflow-y-auto px-5 py-6 space-y-6 sm:px-6"
                            role="log"
                            aria-live="polite"
                            aria-label="Confidential space transcript"
                          >
                            {messages.map((m, i) => {
                              const isUser = m.role === "user"
                              const isAssistant = !isUser
                              const isReasoningOpen = reasoningOpen[i] ?? false
                              const reasoningAvailable =
                                typeof m.reasoning_content === "string" && m.reasoning_content.trim().length > 0
                              const showReasoningPanel = isAssistant && (m.streaming || reasoningAvailable)
                              const truncatedByLength = isAssistant && m.finishReason === "length"
                              const reasoningLabel = m.streaming
                                ? isReasoningOpen
                                  ? "Hide thinking"
                                  : "Show thinking"
                                : isReasoningOpen
                                  ? "Hide reasoning"
                                  : "Show reasoning"

                              const bubbleText =
                                isUser && m.attachments && m.attachments.length > 0
                                  ? m.content.split("\n\n[File:")[0] || "File(s) attached"
                                  : m.content.trim().length > 0
                                    ? m.content
                                    : isAssistant && m.streaming
                                      ? "Synthesising a confidential response…"
                                      : m.content

                              const label = isUser ? "You" : assistantName

                              const bubbleClass = isUser
                                ? "inline-block max-w-[65ch] whitespace-pre-wrap break-words rounded-2xl bg-black px-4 py-3 text-left text-sm leading-6 text-white shadow-[0_20px_45px_-40px_rgba(0,0,0,0.8)]"
                                : "w-full whitespace-pre-wrap break-words rounded-2xl border border-black/10 bg-white/80 px-5 py-4 text-left text-sm leading-7 text-black/85 shadow-sm backdrop-blur"

                              const truncatedNoteClass = isUser ? "max-w-[65ch]" : "w-full"

                              const attachmentsContainerClass = cn(
                                "flex flex-col gap-1 text-xs text-black/70",
                                isUser ? "items-end" : "items-start w-full"
                              )

                              const toggleReasoningPanel = () => {
                                setReasoningOpen((prev) => ({ ...prev, [i]: !isReasoningOpen }))
                              }

                              return (
                                <div key={i} className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
                                  <div
                                    className={cn(
                                      "flex w-full max-w-4xl gap-3",
                                      isUser ? "justify-end" : "justify-start"
                                    )}
                                  >
                                    {isAssistant && (
                                      <div className="relative">
                                        <button
                                          type="button"
                                          onClick={showReasoningPanel ? toggleReasoningPanel : undefined}
                                          disabled={!showReasoningPanel}
                                          className={cn(
                                            "mt-1 flex size-8 items-center justify-center rounded-full border border-black/10 bg-white/75 text-black transition-all",
                                            showReasoningPanel && "cursor-pointer hover:bg-black hover:text-white",
                                            isReasoningOpen && "bg-black text-white",
                                            !showReasoningPanel && "cursor-default opacity-50"
                                          )}
                                          title={showReasoningPanel ? (isReasoningOpen ? "Hide reasoning" : "Show reasoning") : undefined}
                                        >
                                          <Bot className={cn("size-5", isReasoningOpen ? "text-white" : "text-black/60")} />
                                          {showReasoningPanel && (
                                            <div className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-black text-white">
                                              <Sparkles className="size-2.5" />
                                            </div>
                                          )}
                                        </button>
                                      </div>
                                    )}
                                    <div
                                      className={cn(
                                        "flex flex-col gap-2",
                                        isUser
                                          ? "max-w-3xl items-end text-right"
                                          : "flex-1 items-start text-left"
                                      )}
                                    >
                                      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-black/50">
                                        {label}
                                        {m.streaming && " · streaming"}
                                        {truncatedByLength && " · truncated"}
                                      </div>
                                      {m.attachments && m.attachments.length > 0 && (
                                        <div className={attachmentsContainerClass}>
                                          {m.attachments.map((file, fileIndex) => (
                                            <div
                                              key={fileIndex}
                                              className={cn(
                                                "flex items-center gap-2 rounded-xl border border-black/10 bg-white/75 p-2",
                                                !isUser && "w-full"
                                              )}
                                            >
                                              <FileText className="size-3 text-black/60" />
                                              <span className="font-medium text-black/80">{file.name}</span>
                                              <span className="text-black/60">
                                                ({formatFileSize(file.size)}, {formatWordCount(countWords(file.content))})
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    <div
                                      className={bubbleClass}
                                    >
                                      <Markdown content={bubbleText} className="markdown-body text-sm" />
                                    </div>
                                    {showReasoningPanel && isReasoningOpen && (
                                      <div className="w-full overflow-hidden rounded-2xl border border-black/10 bg-white/85 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="flex items-center gap-2 border-b border-black/10 px-3 py-2 text-xs font-medium uppercase tracking-[0.2em] text-black/60">
                                          <Sparkles className="size-3.5 text-black" />
                                          <span>{m.streaming ? "Thinking..." : "Reasoning"}</span>
                                        </div>
                                        <div className="px-3 py-3 text-xs text-black/70">
                                          <Markdown
                                            content={
                                              reasoningAvailable
                                                ? m.reasoning_content?.trim() ?? ""
                                                : m.streaming
                                                  ? "Gathering confidential reasoning..."
                                                  : "No reasoning shared for this turn."
                                            }
                                            className="markdown-body text-xs"
                                          />
                                        </div>
                                      </div>
                                    )}
                                      {truncatedByLength && (
                                        <div className={cn("text-[11px] text-black/60", truncatedNoteClass)}>
                                          Umbra paused because the API token limit was reached. Ask to continue for more detail.
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                            <div ref={messagesEndRef} aria-hidden />
                          </div>
                          {showScrollToLatest && (
                            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className={cn(
                                  "pointer-events-auto gap-1 rounded-full border border-black/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] shadow-sm transition",
                                  hasNewMessages
                                    ? "bg-black text-white hover:bg-black/90"
                                    : "bg-white/80 text-black hover:bg-white"
                                )}
                                onClick={() => scrollToBottom()}
                              >
                                <ArrowDown className="size-4" />
                                <span>{hasNewMessages ? "New reply" : "Scroll to latest"}</span>
                              </Button>
                            </div>
                          )}
                        </div>
                        <form onSubmit={onSubmit} className="shrink-0 border-t border-black/10 bg-white/75 px-6 py-5">
                          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-black/55">
                            <span>
                              Reasoning intensity
                            </span>
                            <div className="flex gap-1">
                              {["low", "medium", "high"].map((effort) => (
                                <Button
                                  key={effort}
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className={cn(
                                    "h-8 rounded-full border px-4 text-[11px] uppercase tracking-[0.24em]",
                                    reasoningEffort === effort
                                      ? "border-black bg-black text-white hover:bg-black/90"
                                      : "border-black/20 bg-transparent text-black/60 hover:bg-black/10"
                                  )}
                                  onClick={() => setReasoningEffort(effort as "low" | "medium" | "high")}
                                  disabled={isSending}
                                >
                                  {effort}
                                </Button>
                              ))}
                            </div>
                          </div>
                          {uploadedFiles.length > 0 && (
                            <div className="mb-3 space-y-2">
                              {uploadedFiles.map((file, index) => (
                                <div
                                  key={index}
                                  className="flex items-center justify-between rounded-xl border border-black/10 bg-white/75 p-3 text-xs text-black/70"
                                >
                                  <div className="flex items-center gap-2">
                                    <FileText className="size-3 text-black/60" />
                                    <span className="font-medium text-black/80">{file.name}</span>
                                    <span className="text-black/60">
                                      ({formatFileSize(file.size)}, {formatWordCount(countWords(file.content))})
                                    </span>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeFile(index)}
                                    className="h-6 w-6 rounded-full border border-black/10 p-0 text-black hover:bg-black/10"
                                  >
                                    <X className="size-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="flex w-full items-start gap-2">
                            <div className="flex-1">
                              <label htmlFor="secure-input" className="sr-only">
                                Secure message input
                              </label>
                              <textarea
                                id="secure-input"
                                value={input}
                                onChange={(e) => {
                                  setInput(e.target.value)
                                }}
                                onKeyDown={onKeyDown}
                                disabled={isSending}
                                placeholder="Shift+Enter for a newline. Messages and attachments stay encrypted end-to-end."
                                className="h-[60px] w-full resize-none rounded-2xl border border-black/10 bg-white/80 px-4 py-3.5 text-sm text-black placeholder:text-black/40 shadow-sm focus:outline-none focus:ring-2 focus:ring-black/60"
                                rows={2}
                              />
                            </div>
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
                              disabled={isSending}
                              className="h-[60px] w-[60px] shrink-0 rounded-xl border border-black/10 bg-white/75 text-black hover:bg-white"
                              title="Upload files"
                            >
                              <Paperclip className="size-5" />
                            </Button>
                            <Button
                              type="submit"
                              size="icon"
                              className="h-[60px] w-[60px] shrink-0 rounded-xl bg-black text-white hover:bg-black/90"
                              disabled={isSending || (!input.trim() && uploadedFiles.length === 0) || !providerApiBase}
                            >
                              <Send className="size-5" />
                              <span className="sr-only">Send secure message</span>
                            </Button>
                          </div>
                        </form>
                      </CardContent>
                    </Card>
                </div>
              </section>
              <aside className="order-2 flex flex-col gap-4 lg:order-1">
                <Card className="border border-black/15 bg-white/75 shadow-[0_35px_80px_-65px_rgba(0,0,0,0.65)] backdrop-blur">
                  <CardContent className="space-y-4 p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h2 className="text-sm font-semibold text-black">Session details</h2>
                        <p className="mt-1 text-xs text-black/60">{connectionSummary}</p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 shrink-0 self-start rounded-full border border-black/20 px-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-black transition hover:bg-black hover:text-white"
                        onClick={() => setShowAdvancedSettings((previous) => !previous)}
                      >
                        {showAdvancedSettings ? "Hide Advanced" : "Advanced"}
                      </Button>
                    </div>
                    <div className="space-y-3 text-xs">
                      {providerModel && (
                        <div className="flex items-center gap-2">
                          <Bot className="size-4 text-black/60" />
                          <span className="text-black/60">
                            <span className="font-medium">Model:</span> {providerModel}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Bot className="size-4 text-black/60" />
                        <span className="text-black/60">
                          <span className="font-medium">Assistant:</span> {assistantName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className={cn("size-4", providerConfigured ? "text-black" : "text-black/25")} />
                        <span className="text-black/60">
                          <span className="font-medium">Base URL:</span>{" "}
                          {providerApiBase ? truncateMiddle(providerApiBase, 35) : "Not configured"}
                        </span>
                      </div>
                      {providerHost && (
                        <div className="flex items-center gap-2">
                          <Globe className="size-4 text-black/60" />
                          <span className="text-black/60" title={providerHost}>
                            <span className="font-medium">Host:</span> {truncateMiddle(providerHost, 35)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Lock className="size-4 text-black/60" />
                        <span className="text-black/60">
                          <span className="font-medium">Bearer token:</span> {tokenPresent ? "Loaded in session" : "Not provided"}
                        </span>
                      </div>
                      {cacheSalt && (
                        <div className="flex items-center gap-2">
                          <Key className="size-4 text-black/60" />
                          <span className="text-black/60" title={cacheSalt}>
                            <span className="font-medium">KV cache salt:</span>{" "}
                            <span className="font-mono">{cacheSalt.slice(0, 8)}...{cacheSalt.slice(-4)}</span>
                          </span>
                        </div>
                      )}
                    </div>
                    {showAdvancedSettings && (
                      <div className="space-y-3 rounded-2xl border border-black/15 bg-white/80 p-5 text-xs text-black/70">
                        <h3 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-black/60">
                          Advanced provider settings
                        </h3>
                        <label htmlFor="provider-base-url" className="block space-y-1 text-black/60">
                          <span className="font-medium text-black">Base URL</span>
                          <input
                            id="provider-base-url"
                            type="url"
                            inputMode="url"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="https://tee.example.com/v1"
                            value={providerBaseUrlInput}
                            onChange={(event) => setProviderBaseUrlInput(event.target.value)}
                            className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm text-black placeholder:text-black/40 focus:outline-none focus:ring-2 focus:ring-black/30"
                          />
                        </label>
                        <label htmlFor="provider-api-key" className="block space-y-1 text-black/60">
                          <span className="font-medium text-black">Bearer token</span>
                          <input
                            id="provider-api-key"
                            type="password"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="token-..."
                            value={providerApiKeyInput}
                            onChange={(event) => setProviderApiKeyInput(event.target.value)}
                            className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black/30"
                          />
                        </label>
                        {configError && (
                          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
                            {configError}
                          </div>
                        )}
                        <p className="text-[11px] text-black/55">
                          Stored locally. Refreshing the page clears the token (session storage).
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Card className="border border-black/15 bg-white/75 shadow-[0_35px_80px_-65px_rgba(0,0,0,0.65)] backdrop-blur">
                  <CardContent className="p-0">
                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem value="proofs" className="border-b-0">
                        <AccordionTrigger className="px-5 py-4 text-sm font-medium text-black hover:no-underline hover:bg-white/70">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="size-4 text-black" />
                            <span>Proof of Confidentiality</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-3 px-5 pb-5 text-sm text-black/70">
                          <p>
                            These attestations verify that your data is processed within a secure, isolated, and measured
                            environment.
                          </p>
                          <div className="space-y-3">
                            <div className="rounded-lg border border-black/10 bg-white/85 p-3">
                              <div className="flex items-center justify-between text-xs font-medium">
                                <span className="inline-flex items-center gap-2">
                                  <Cpu className="size-3.5 text-black/70" /> Intel TDX
                                </span>
                                <span className="inline-flex items-center gap-1 text-success">
                                  <CheckCircle2 className="size-3.5" /> Verified
                                </span>
                              </div>
                              <p className="mt-1.5 break-all font-mono text-xs text-black/60">quote: 0x9f…a3c</p>
                            </div>
                            <div className="rounded-lg border border-black/10 bg-white/85 p-3">
                              <div className="flex items-center justify-between text-xs font-medium">
                                <span className="inline-flex items-center gap-2">
                                  <Shield className="size-3.5 text-black/70" /> TLS Channel
                                </span>
                                <span className="inline-flex items-center gap-1 text-success">
                                  <CheckCircle2 className="size-3.5" /> Verified
                                </span>
                              </div>
                              <p className="mt-1.5 break-all font-mono text-xs text-black/60">
                                tls: 1.3 · ECDHE-RSA · AES-256-GCM
                              </p>
                            </div>
                            <div className="rounded-lg border border-black/10 bg-white/85 p-3">
                              <div className="flex items-center justify-between text-xs font-medium">
                                <span className="inline-flex items-center gap-2">
                                  <Cpu className="size-3.5 text-black/70" /> NVIDIA GPU
                                </span>
                                <span className="inline-flex items-center gap-1 text-success">
                                  <CheckCircle2 className="size-3.5" /> Verified
                                </span>
                              </div>
                              <p className="mt-1.5 break-all font-mono text-xs text-black/60">attest: device cert</p>
                            </div>
                            <div className="rounded-lg border border-black/10 bg-white/85 p-3">
                              <div className="flex items-center justify-between text-xs font-medium">
                                <span className="inline-flex items-center gap-2">
                                  <Lock className="size-3.5 text-black/70" /> Runtime
                                </span>
                                <span className="inline-flex items-center gap-1 text-success">
                                  <CheckCircle2 className="size-3.5" /> Verified
                                </span>
                              </div>
                              <p className="mt-1.5 break-all font-mono text-xs text-black/60">policy: sha256:…</p>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </CardContent>
                </Card>
              </aside>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
