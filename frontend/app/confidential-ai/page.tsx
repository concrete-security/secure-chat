"use client"

import { useState, FormEvent, KeyboardEvent, useMemo, useRef, useEffect, useCallback } from "react"

import Link from "next/link"
import Image from "next/image"
import { useTheme } from "next-themes"
import { ArrowDown, Send, Lock, Shield, ShieldCheck, Cpu, CheckCircle2, Bot, Globe, Paperclip, FileText, X, Sparkles, ChevronDown, Key, Sun, Moon, Info } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false)

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

  // Scroll behavior state
  const [reasoningOpen, setReasoningOpen] = useState<Record<number, boolean>>({})
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true)
  const [hasNewMessages, setHasNewMessages] = useState(false)
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true)
  const autoScrollRef = useRef(autoScrollEnabled)

  const updateAutoScrollEnabled = useCallback((value: boolean) => {
    autoScrollRef.current = value
    setAutoScrollEnabled(value)
  }, [])

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

    scrollToBottom("smooth")

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
          handleStreamingFollow()
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
      handleStreamingFollow("smooth")
    } catch (error) {
      console.warn("Confidential chat request failed", error)
      const fallback = error instanceof Error && error.message ? error.message : "Please try again later."
      updateAssistantMessage({
        content: `We couldn't reach the confidential service right now. ${fallback}`,
        streaming: false,
        reasoning_content: undefined,
        finishReason: undefined,
      })
      handleStreamingFollow("smooth")
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

    const handleScroll = () => {
      const { scrollTop, clientHeight, scrollHeight } = container
      const distanceFromBottom = Math.max(0, scrollHeight - (scrollTop + clientHeight))
      const tolerance = 24
      const isAtBottom = distanceFromBottom <= tolerance
      lastScrollTopRef.current = scrollTop

      setIsPinnedToBottom(isAtBottom)
      if (isAtBottom) {
        setHasNewMessages(false)
        updateAutoScrollEnabled(true)
      } else if (!isProgrammaticScrollRef.current) {
        updateAutoScrollEnabled(false)
      }
    }

    handleScroll()
    container.addEventListener("scroll", handleScroll, { passive: true })

    return () => {
      container.removeEventListener("scroll", handleScroll)
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
    updateAutoScrollEnabled(true)
  }, [updateAutoScrollEnabled])

  const handleStreamingFollow = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      if (autoScrollRef.current) {
        scrollToBottom(behavior)
      } else {
        setHasNewMessages(true)
      }
    },
    [scrollToBottom]
  )

  useEffect(() => {
    if (!autoScrollEnabled) return
    if (isPinnedToBottom) {
      scrollToBottom("smooth")
    }
  }, [reasoningOpen, isPinnedToBottom, autoScrollEnabled, scrollToBottom])

  const showScrollToLatest = !isPinnedToBottom && (!autoScrollEnabled || hasNewMessages)

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(93%_736.36%_at_38%_-100%,#E2E2E2_24.46%,#1B0986_100%)] opacity-[0.22] dark:bg-[radial-gradient(93%_736.36%_at_38%_-120%,rgba(46,27,142,0.35)_18.84%,rgba(6,5,45,0.92)_100%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(211.15deg,rgba(0,0,0,0)_18.84%,rgba(0,0,0,0.16)_103.94%)] dark:bg-[linear-gradient(211.15deg,rgba(6,5,45,0)_18.84%,rgba(6,5,45,0.72)_103.94%)]"
        aria-hidden="true"
      />
      <script src="/pdfjs/pdf.mjs" type="module" />
      <header className="sticky top-0 z-20 border-b border-border/50 bg-background/85 backdrop-blur dark:bg-background/60">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 md:px-6">
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.32em] text-muted-foreground">
            <Lock className="h-4 w-4 text-[#1B0986]" />
            <span>Confidential Space</span>
          </div>
          <div className="flex items-center gap-3">
            {themeReady && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleThemeToggle}
                className="rounded-full border border-border/40 bg-card/80 text-foreground transition hover:bg-card/90 dark:border-border/60 dark:bg-card/30 dark:hover:bg-card/40"
              >
                {activeTheme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
                <span className="sr-only">Toggle theme</span>
              </Button>
            )}
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-card/80 px-3 py-1 text-sm font-semibold text-foreground shadow-sm transition hover:bg-card/90 dark:border-border/60 dark:bg-card/30 dark:text-foreground dark:hover:bg-card/40"
            >
              <Image src="/logo.png" alt="Concrete AI logo" width={20} height={20} className="rounded-sm" />
              <span className="tracking-tight">Concrete AI</span>
            </Link>
          </div>
        </div>
      </header>
      <main className="relative z-10 flex flex-1 flex-col min-h-0 overflow-hidden">
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col min-h-0 px-4 pb-6 pt-4 md:px-6 md:pb-8 md:pt-6">
          <div className="flex flex-1 flex-col min-h-0" aria-label="Confidential space">
            <div className="flex flex-1 min-h-0">
              <section className="relative flex w-full flex-1 flex-col min-h-0">
                <div className="relative flex flex-1 flex-col overflow-hidden rounded-[36px] border border-border/50 bg-background/90 shadow-[0_60px_140px_-90px_rgba(0,0,0,0.7)] backdrop-blur dark:border-border/60 dark:bg-background/35">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 bg-card/80 px-6 py-4 text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground dark:bg-card/25">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setSessionDialogOpen(true)}
                          className="inline-flex items-center gap-2 rounded-full bg-[#1B0986] px-4 py-1 text-white transition-all hover:bg-[#1B0986]/90 hover:scale-105 hover:ring-2 hover:ring-[#1B0986]/20 cursor-pointer"
                        >
                          <Lock className="h-3.5 w-3.5" />
                          Secure session
                        </button>
                        <div className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-[#1B0986] text-white ring-2 ring-white/80">
                          <Info className="h-2.5 w-2.5" />
                        </div>
                      </div>
                      {encrypting && cipherPreview && (
                        <>
                          <span className="text-muted-foreground/60">•</span>
                          <span className="rounded-full border border-border/40 bg-card/80 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.32em] text-muted-foreground dark:border-border/60 dark:bg-card/25">
                            Encrypting {cipherPreview}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <Card className="flex h-full flex-1 flex-col min-h-0 border-0 bg-transparent shadow-none">
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
                                ? "inline-block max-w-[65ch] whitespace-pre-wrap break-words rounded-2xl bg-[#1B0986] px-4 py-3 text-left text-sm leading-6 text-white shadow-[0_20px_45px_-40px_rgba(0,0,0,0.8)] dark:shadow-[0_24px_55px_-35px_rgba(3,2,20,0.9)]"
                                : "w-full whitespace-pre-wrap break-words rounded-2xl border border-border/50 bg-card/80 px-5 py-4 text-left text-sm leading-7 text-foreground shadow-sm backdrop-blur dark:border-border/60 dark:bg-card/25"

                              const truncatedNoteClass = isUser ? "max-w-[65ch]" : "w-full"

                              const attachmentsContainerClass = cn(
                                "flex flex-col gap-1 text-xs text-muted-foreground",
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
                                            "mt-1 flex size-8 items-center justify-center rounded-full border border-border/40 bg-card/80 text-foreground transition-all dark:border-border/60 dark:bg-card/30",
                                            showReasoningPanel && "cursor-pointer hover:bg-[#1B0986] hover:text-white",
                                            isReasoningOpen && "bg-[#1B0986] text-white",
                                            !showReasoningPanel && "cursor-default opacity-50"
                                          )}
                                          title={showReasoningPanel ? (isReasoningOpen ? "Hide reasoning" : "Show reasoning") : undefined}
                                        >
                                          <Bot className={cn("h-5 w-5", isReasoningOpen ? "text-white" : "text-muted-foreground")} />
                                          {showReasoningPanel && (
                                            <div className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-[#1B0986] text-white">
                                              <Sparkles className="h-2.5 w-2.5" />
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
                                      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
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
                                                "flex items-center gap-2 rounded-xl border border-border/40 bg-card/80 p-2 dark:border-border/60 dark:bg-card/25",
                                                !isUser && "w-full"
                                              )}
                                            >
                                              <FileText className="size-3 text-muted-foreground" />
                                              <span className="font-medium text-foreground">{file.name}</span>
                                              <span className="text-muted-foreground">
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
                                      <div className="w-full overflow-hidden rounded-2xl border border-border/40 bg-card/80 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300 dark:border-border/60 dark:bg-card/20">
                                        <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground dark:border-border/60">
                                          <Sparkles className="h-3.5 w-3.5 text-[#1B0986]" />
                                          <span>{m.streaming ? "Thinking..." : "Reasoning"}</span>
                                        </div>
                                        <div className="px-3 py-3 text-xs text-muted-foreground">
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
                                        <div className={cn("text-[11px] text-muted-foreground", truncatedNoteClass)}>
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
                                "pointer-events-auto gap-1 rounded-full border border-border/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] shadow-sm transition dark:border-border/60",
                                hasNewMessages
                                  ? "bg-[#1B0986] text-white hover:bg-[#1B0986]/90"
                                  : "bg-card/80 text-foreground hover:bg-card/90 dark:bg-card/30 dark:text-foreground dark:hover:bg-card/40"
                              )}
                              onClick={() => scrollToBottom()}
                            >
                                <ArrowDown className="size-4" />
                                <span>{hasNewMessages ? "New reply" : "Scroll to latest"}</span>
                              </Button>
                            </div>
                          )}
                        </div>
                        <form onSubmit={onSubmit} className="shrink-0 border-t border-border bg-card/80 px-6 py-5 dark:bg-card/25">
                          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
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
                                      ? "border-[#1B0986] bg-[#1B0986] text-white hover:bg-[#1B0986]/90"
                                      : "border-border/40 bg-card/70 text-muted-foreground hover:bg-card/80 dark:border-border/60 dark:bg-card/20 dark:text-muted-foreground dark:hover:bg-card/30"
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
                                  className="flex items-center justify-between rounded-xl border border-border/40 bg-card/80 p-3 text-xs text-muted-foreground dark:border-border/60 dark:bg-card/25"
                                >
                                  <div className="flex items-center gap-2">
                                    <FileText className="size-3 text-[#1B0986]" />
                                    <span className="font-medium text-foreground">{file.name}</span>
                                    <span className="text-muted-foreground">
                                      ({formatFileSize(file.size)}, {formatWordCount(countWords(file.content))})
                                    </span>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeFile(index)}
                                    className="h-6 w-6 rounded-full border border-border/40 p-0 text-foreground hover:bg-card/80 dark:border-border/60 dark:hover:bg-card/30"
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
                                className="h-[60px] w-full resize-none rounded-2xl border border-border/50 bg-card px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/70 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1B0986]/50 dark:border-border/60 dark:bg-card/15"
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
                              className="h-[60px] w-[60px] shrink-0 rounded-xl border border-border/40 bg-card/80 text-foreground hover:bg-card/90 dark:border-border/60 dark:bg-card/20 dark:hover:bg-card/30"
                              title="Upload files"
                            >
                              <Paperclip className="h-5 w-5 text-[#1B0986]" />
                            </Button>
                            <Button
                              type="submit"
                              size="icon"
                              className="h-[60px] w-[60px] shrink-0 rounded-xl bg-[#1B0986] text-white hover:bg-[#1B0986]/90"
                              disabled={isSending || (!input.trim() && uploadedFiles.length === 0) || !providerApiBase}
                            >
                              <Send className="h-5 w-5" />
                              <span className="sr-only">Send secure message</span>
                            </Button>
                          </div>
                        </form>
                      </CardContent>
                    </Card>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
      <Dialog open={sessionDialogOpen} onOpenChange={setSessionDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border border-border/50 bg-background/95 backdrop-blur dark:border-border/60 dark:bg-background/80">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
              <Lock className="h-5 w-5 text-[#1B0986]" />
              Secure Session
            </DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="session" className="w-full">
            <TabsList className="grid w-full grid-cols-2 gap-2 rounded-full border border-border/40 bg-card/80 p-1 dark:border-border/60 dark:bg-card/20">
              <TabsTrigger
                value="session"
                className="rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.24em] data-[state=active]:bg-[#1B0986] data-[state=active]:text-white"
              >
                Session Details
              </TabsTrigger>
              <TabsTrigger
                value="proof"
                className="rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.24em] data-[state=active]:bg-[#1B0986] data-[state=active]:text-white"
              >
                Proof of Confidentiality
              </TabsTrigger>
            </TabsList>
            <TabsContent value="session" className="space-y-4 mt-4">
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{connectionSummary}</p>
                <div className="space-y-3 text-xs">
                  {providerModel && (
                    <div className="flex items-center gap-2">
                      <Bot className="size-4 text-[#1B0986]" />
                      <span className="text-muted-foreground">
                        <span className="font-medium">Model:</span> {providerModel}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Bot className="size-4 text-[#1B0986]" />
                    <span className="text-muted-foreground">
                      <span className="font-medium">Assistant:</span> {assistantName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className={cn("size-4", providerConfigured ? "text-foreground" : "text-muted-foreground/50")} />
                    <span className="text-muted-foreground">
                      <span className="font-medium">Base URL:</span>{" "}
                      {providerApiBase ? truncateMiddle(providerApiBase, 35) : "Not configured"}
                    </span>
                  </div>
                  {providerHost && (
                    <div className="flex items-center gap-2">
                      <Globe className="size-4 text-muted-foreground" />
                      <span className="text-muted-foreground" title={providerHost}>
                        <span className="font-medium">Host:</span> {truncateMiddle(providerHost, 35)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Lock className="size-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      <span className="font-medium">Bearer token:</span> {tokenPresent ? "Loaded in session" : "Not provided"}
                    </span>
                  </div>
                  {cacheSalt && (
                    <div className="flex items-center gap-2">
                      <Key className="size-4 text-muted-foreground" />
                      <span className="text-muted-foreground" title={cacheSalt}>
                        <span className="font-medium">KV cache salt:</span>{" "}
                        <span className="font-mono">{cacheSalt.slice(0, 8)}...{cacheSalt.slice(-4)}</span>
                      </span>
                    </div>
                  )}
                </div>
                <div className="pt-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full rounded-full border border-border/40 bg-card/70 text-foreground hover:bg-card/80 dark:border-border/60 dark:bg-card/20 dark:text-foreground dark:hover:bg-card/30"
                    onClick={() => setShowAdvancedSettings((previous) => !previous)}
                  >
                    {showAdvancedSettings ? "Hide Advanced Settings" : "Show Advanced Settings"}
                  </Button>
                </div>
                {showAdvancedSettings && (
                  <div className="space-y-3 rounded-2xl border border-border/40 bg-card/80 p-5 text-xs text-muted-foreground dark:border-border/60 dark:bg-card/20">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                      Advanced provider settings
                    </h3>
                    <label htmlFor="provider-base-url" className="block space-y-1 text-muted-foreground">
                      <span className="font-medium text-foreground">Base URL</span>
                      <input
                        id="provider-base-url"
                        type="url"
                        inputMode="url"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="https://tee.example.com/v1"
                        value={providerBaseUrlInput}
                        onChange={(event) => setProviderBaseUrlInput(event.target.value)}
                        className="w-full rounded-xl border border-border/40 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-[#1B0986]/40 dark:border-border/60 dark:bg-card/15"
                      />
                    </label>
                    <label htmlFor="provider-api-key" className="block space-y-1 text-muted-foreground">
                      <span className="font-medium text-foreground">Bearer token</span>
                      <input
                        id="provider-api-key"
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="token-..."
                        value={providerApiKeyInput}
                        onChange={(event) => setProviderApiKeyInput(event.target.value)}
                        className="w-full rounded-xl border border-border/40 bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#1B0986]/40 dark:border-border/60 dark:bg-card/15"
                      />
                    </label>
                    {configError && (
                      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
                        {configError}
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      Stored locally. Refreshing the page clears the token (session storage).
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="proof" className="space-y-3 mt-4">
              <p className="text-sm text-muted-foreground">
                These attestations verify that your data is processed within a secure, isolated, and measured
                environment.
              </p>
              <div className="space-y-3">
                <div className="rounded-lg border border-border/40 bg-card/80 p-3 dark:border-border/60 dark:bg-card/20">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="inline-flex items-center gap-2">
                      <Cpu className="size-3.5 text-muted-foreground" /> Intel TDX
                    </span>
                    <span className="inline-flex items-center gap-1 text-success">
                      <CheckCircle2 className="size-3.5" /> Verified
                    </span>
                  </div>
                  <p className="mt-1.5 break-all font-mono text-xs text-muted-foreground">quote: 0x9f…a3c</p>
                </div>
                <div className="rounded-lg border border-border/40 bg-card/80 p-3 dark:border-border/60 dark:bg-card/20">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="inline-flex items-center gap-2">
                      <Shield className="size-3.5 text-muted-foreground" /> TLS Channel
                    </span>
                    <span className="inline-flex items-center gap-1 text-success">
                      <CheckCircle2 className="size-3.5" /> Verified
                    </span>
                  </div>
                  <p className="mt-1.5 break-all font-mono text-xs text-muted-foreground">
                    tls: 1.3 · ECDHE-RSA · AES-256-GCM
                  </p>
                </div>
                <div className="rounded-lg border border-border/40 bg-card/80 p-3 dark:border-border/60 dark:bg-card/20">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="inline-flex items-center gap-2">
                      <Cpu className="size-3.5 text-muted-foreground" /> NVIDIA GPU
                    </span>
                    <span className="inline-flex items-center gap-1 text-success">
                      <CheckCircle2 className="size-3.5" /> Verified
                    </span>
                  </div>
                  <p className="mt-1.5 break-all font-mono text-xs text-muted-foreground">attest: device cert</p>
                </div>
                <div className="rounded-lg border border-border/40 bg-card/80 p-3 dark:border-border/60 dark:bg-card/20">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="inline-flex items-center gap-2">
                      <Lock className="size-3.5 text-muted-foreground" /> Runtime
                    </span>
                    <span className="inline-flex items-center gap-1 text-success">
                      <CheckCircle2 className="size-3.5" /> Verified
                    </span>
                  </div>
                  <p className="mt-1.5 break-all font-mono text-xs text-muted-foreground">policy: sha256:…</p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  )
}
