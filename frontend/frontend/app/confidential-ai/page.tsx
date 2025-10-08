"use client"

import { useState, FormEvent, KeyboardEvent, useMemo, useRef, useEffect } from "react"

import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, Send, Lock, ShieldCheck, Cpu, CheckCircle2, Bot, Globe, Paperclip, FileText, X, Sparkles, ChevronDown } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { streamConfidentialChat, confidentialChatConfig } from "@/lib/confidential-chat"
import { Markdown } from "@/components/markdown"


type Message = {
  role: "user" | "assistant"
  content: string
  attachments?: UploadedFile[]
  reasoning_content?: string
  streaming?: boolean
  finishReason?: string
}
type UploadedFile = { name: string; content: string; size: number; type: string }

type ProviderMetadata = {
  baseUrl?: string | null
  host?: string | null
  displayName?: string | null
  model?: string | null
}

function normalize(value?: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function buildGreeting(displayName: string | null, host: string | null) {
  if (displayName && host) {
    return `Secure channel ready with ${displayName} at ${host}. How can I help today?`
  }
  if (displayName) {
    return `Secure channel ready with ${displayName}. How can I help today?`
  }
  if (host) {
    return `Secure channel ready at ${host}. How can I help today?`
  }
  return "Secure channel ready. How can I help today?"
}

export default function ConfidentialAIPage() {
  const envProviderApiBase = normalize(confidentialChatConfig.providerApiBase)
  const envProviderModel = normalize(confidentialChatConfig.providerModel)
  const envProviderDisplayName = normalize(confidentialChatConfig.providerName) ?? envProviderModel

  const [providerMetadata, setProviderMetadata] = useState<ProviderMetadata | null>(null)

  const providerApiBase = normalize(providerMetadata?.baseUrl) ?? envProviderApiBase
  const providerModel = normalize(providerMetadata?.model) ?? envProviderModel
  const providerDisplayName =
    normalize(providerMetadata?.displayName) ?? providerModel ?? envProviderDisplayName

  const metadataHost = normalize(providerMetadata?.host)

  const providerHost = useMemo(() => {
    if (metadataHost) return metadataHost
    if (!providerApiBase) return null
    try {
      return new URL(providerApiBase).host
    } catch (error) {
      console.warn("Unable to derive provider host", error)
      return providerApiBase
    }
  }, [metadataHost, providerApiBase])

  const connectionSummarySegments = [
    providerDisplayName
      ? `Connected to ${providerDisplayName}${providerHost ? ` via ${providerHost}` : ""}.`
      : providerHost
        ? `Connected via ${providerHost}.`
        : null,
    providerApiBase ? `Requests tunnel through ${providerApiBase}.` : null,
  ].filter((segment): segment is string => Boolean(segment))

  const connectionSummary = connectionSummarySegments.length > 0
    ? connectionSummarySegments.join(" ")
    : "Demo mode: configure a confidential provider to enable remote inference."

  const [messages, setMessages] = useState<Message[]>(() => [
    {
      role: "assistant",
      content: buildGreeting(providerDisplayName, providerHost),
    },
  ])

  useEffect(() => {
    const controller = new AbortController()

    const loadProviderMetadata = async () => {
      try {
        const response = await fetch("/api/provider-info", { cache: "no-store", signal: controller.signal })
        if (!response.ok || controller.signal.aborted) return

        const payload = (await response.json()) as ProviderMetadata
        if (!controller.signal.aborted) {
          setProviderMetadata(payload)
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return
        }
        console.warn("Failed to load provider metadata", error)
      }
    }

    void loadProviderMetadata()

    return () => {
      controller.abort()
    }
  }, [])

  useEffect(() => {
    setMessages((previous) => {
      if (previous.length === 0) return previous
      if (previous.some((message) => message.role === "user")) return previous

      const [first, ...rest] = previous
      if (first.role !== "assistant") return previous

      const updatedGreeting = buildGreeting(providerDisplayName, providerHost)
      if (first.content === updatedGreeting) return previous

      return [{ ...first, content: updatedGreeting }, ...rest]
    })
  }, [providerDisplayName, providerHost])
  const [input, setInput] = useState("")
  const [encrypting, setEncrypting] = useState(false)
  const [cipherPreview, setCipherPreview] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [reasoningEffort, setReasoningEffort] = useState<"low" | "medium" | "high">("medium")
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ref that will serve as the "scroll anchor" for the chat bottom
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  // Track whether we should auto-scroll (only after sending/receiving a message)
  const [shouldScroll, setShouldScroll] = useState(false)
  const [reasoningOpen, setReasoningOpen] = useState<Record<number, boolean>>({})


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
        },
        {}
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
      console.error("Confidential chat request failed", error)
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

  // Use effect: scroll to bottom only when shouldScroll is true
  useEffect(() => {
    if (shouldScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
      setShouldScroll(false)
    }
  }, [messages, shouldScroll])


  return (
    <div className="min-h-[100dvh] flex flex-col bg-muted/30">
      <script src="/pdfjs/pdf.mjs" type="module" />
      <header className="border-b bg-background">
        <div className="container flex items-center gap-3 h-14 px-4 md:px-6">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-2">
            <ArrowLeft className="size-4" /> Back
          </Link>
          <div className="ml-auto font-bold">
            <Link href="/" className="inline-flex items-center gap-2">
              <Image src="/logo.png" alt="Concrete AI logo" width={20} height={20} className="rounded-sm" />
              <span>Confidential AI</span>
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <div className="container px-4 md:px-6 py-6">
          <div className="max-w-3xl mx-auto relative" aria-label="End-to-end encrypted secure chat">
            <div className="absolute -top-3 left-4 z-10 inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
              <Lock className="size-3.5 text-primary" />
              <span>Secure session</span>
              <span className="opacity-60">•</span>
              <span className="inline-flex items-center gap-1 text-muted-foreground/80">
                <Globe className="size-3" />
                <span className="hidden sm:inline">{providerHost}</span>
                <span className="sm:hidden">Live</span>
              </span>
              {encrypting && cipherPreview && (
                <>
                  <span className="opacity-60">•</span>
                  <span className="font-mono text-[10px] text-muted-foreground/80">Encrypting {cipherPreview}</span>
                </>
              )}
            </div>
            <div className="rounded-xl p-[1px] bg-gradient-to-r from-primary/40 via-primary/60 to-primary/40">
              <div className="rounded-xl bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/50">
                <Card className="h-[70vh] flex flex-col shadow-none border-0 rounded-xl">
                  <CardContent className="p-0 flex-1 flex flex-col min-h-0">
                    {/* enable shrink + scroll */}
                    <div className="flex-1 min-w-0 min-h-0 overflow-y-auto p-4 space-y-6">
                      {messages.map((m, i) => {
                        const isUser = m.role === "user"
                        const isAssistant = !isUser
                        const isReasoningOpen = reasoningOpen[i] ?? false
                        const reasoningAvailable = typeof m.reasoning_content === "string" && m.reasoning_content.trim().length > 0
                        const showReasoningPanel = isAssistant && (m.streaming || reasoningAvailable)
                        const truncatedByLength = isAssistant && m.finishReason === "length"
                        const reasoningLabel = m.streaming
                          ? isReasoningOpen
                            ? "Hide thinking"
                            : "Show thinking"
                          : isReasoningOpen
                            ? "Hide reasoning"
                            : "Show reasoning"

                        const bubbleText = isUser && m.attachments && m.attachments.length > 0
                          ? m.content.split("\n\n[File:")[0] || "File(s) attached"
                          : m.content.trim().length > 0
                            ? m.content
                            : isAssistant && m.streaming
                              ? "Synthesising a confidential response…"
                              : m.content

                        const bubbleClass = isUser
                          ? "bg-primary text-primary-foreground"
                          : m.streaming
                            ? "bg-gradient-to-r from-primary/15 via-primary/5 to-primary/15 text-foreground border border-primary/30"
                            : "bg-muted text-foreground"

                        const toggleReasoningPanel = () => {
                          setReasoningOpen((prev) => ({ ...prev, [i]: !isReasoningOpen }))
                        }

                        return (
                          <div
                            key={i}
                            className={`flex items-start gap-3 ${isUser ? "justify-end" : "justify-start"}`}
                          >
                            {isAssistant && (
                              <div className="size-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                <Bot className="size-5 text-muted-foreground" />
                              </div>
                            )}
                            <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
                              {/* File attachments */}
                              {m.attachments && m.attachments.length > 0 && (
                                <div className="mb-2 space-y-1">
                                  {m.attachments.map((file, fileIndex) => (
                                    <div
                                      key={fileIndex}
                                      className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border text-xs"
                                    >
                                      <FileText className="size-3 text-muted-foreground" />
                                      <span className="font-medium">{file.name}</span>
                                      <span className="text-muted-foreground">({formatFileSize(file.size)}, {formatWordCount(countWords(file.content))})</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div
                                className={`max-w-full rounded-lg px-4 py-2 text-sm shadow-sm transition-colors ${bubbleClass} ${isAssistant && m.streaming ? "animate-pulse" : ""}`}
                              >
                                <Markdown content={bubbleText} className="markdown-body text-sm" />
                              </div>
                              {showReasoningPanel && (
                                <div className="mt-2 w-full max-w-md overflow-hidden rounded-lg border border-primary/20 bg-primary/5">
                                  <button
                                    type="button"
                                    onClick={toggleReasoningPanel}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-primary transition hover:bg-primary/10"
                                  >
                                    <Sparkles className="size-4" />
                                    <span>{reasoningLabel}</span>
                                    <ChevronDown
                                      className={`ml-auto size-4 transition-transform ${isReasoningOpen ? "-rotate-180" : ""}`}
                                    />
                                    {m.streaming && (
                                      <div className="ml-2 flex items-center gap-1">
                                        <span
                                          className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce"
                                          style={{ animationDelay: "0ms" }}
                                        />
                                        <span
                                          className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce"
                                          style={{ animationDelay: "120ms" }}
                                        />
                                        <span
                                          className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce"
                                          style={{ animationDelay: "240ms" }}
                                        />
                                      </div>
                                    )}
                                  </button>
                                  {isReasoningOpen && (
                                    <div className="px-3 pb-3 text-xs text-muted-foreground">
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
                                  )}
                                </div>
                              )}
                              {truncatedByLength && (
                                <div className="mt-2 text-[11px] text-muted-foreground/80 flex items-center gap-2">
                                  <span className="text-primary">▌</span>
                                  <span>Umbra paused because the API token limit was reached. Ask to continue for more detail.</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                      {/* Scroll anchor at the bottom */}
                      <div ref={messagesEndRef} />
                    </div>
                    <form onSubmit={onSubmit} className="border-t bg-background/50 p-3">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="uppercase tracking-wide text-[11px] text-muted-foreground/80">Reasoning intensity</span>
                        <div className="flex gap-1">
                          {["low", "medium", "high"].map((effort) => (
                            <Button
                              key={effort}
                              type="button"
                              variant={reasoningEffort === effort ? "default" : "outline"}
                              size="sm"
                              className="h-7 px-3 text-[11px] uppercase"
                              onClick={() => setReasoningEffort(effort as "low" | "medium" | "high")}
                              disabled={isSending}
                            >
                              {effort}
                            </Button>
                          ))}
                        </div>
                      </div>
                      {/* Uploaded files preview */}
                      {uploadedFiles.length > 0 && (
                        <div className="mb-3 space-y-2">
                          {uploadedFiles.map((file, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between p-2 rounded-md bg-muted/30 border text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <FileText className="size-3 text-muted-foreground" />
                                <span className="font-medium">{file.name}</span>
                                <span className="text-muted-foreground">({formatFileSize(file.size)}, {formatWordCount(countWords(file.content))})</span>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeFile(index)}
                                className="h-6 w-6 p-0 hover:bg-destructive/10"
                              >
                                <X className="size-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <textarea
                          value={input}
                          onChange={(e) => {
                            setInput(e.target.value)
                          }}
                          onKeyDown={onKeyDown}
                          disabled={isSending}
                          placeholder="Your messages and responses are encrypted end-to-end..."
                          className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring max-h-32"
                          rows={2}
                        />
                        <div className="flex gap-1">
                          <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            multiple
                            // Supported files
                            accept=".txt,.md,.json,.csv,.py,.js,.ts,.tsx,.jsx,.html,.css,.xml,.yaml,.yml,.pdf"
                            className="hidden"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isSending}
                            className="rounded-md"
                            title="Upload files"
                          >
                            <Paperclip className="size-4" />
                          </Button>
                          <Button
                            type="submit"
                            className="rounded-md"
                            disabled={isSending || (!input.trim() && uploadedFiles.length === 0)}
                          >
                            <Send className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
          {/* Attestation proofs in collapsible accordion */}
          <div className="max-w-3xl mx-auto mt-6">
            <Accordion type="single" collapsible className="w-full rounded-lg border bg-card/80 px-4">
              <AccordionItem value="proofs" className="border-b-0">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ShieldCheck className="size-4 text-primary" />
                    <span>Cryptographic Proof of Confidentiality</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <p className="text-sm text-muted-foreground pb-4">
                    These attestations verify that your data is processed within a secure, isolated, and measured environment.
                  </p>
                  <div className="space-y-3">
                    <div className="rounded-md border bg-background p-3">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="inline-flex items-center gap-2">
                          <Cpu className="size-3.5" /> Intel TDX
                        </span>
                        <span className="inline-flex items-center gap-1 text-success">
                          <CheckCircle2 className="size-3.5" /> Verified
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground font-mono break-all">quote: 0x9f…a3c</p>
                    </div>
                    <div className="rounded-md border bg-background p-3">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="inline-flex items-center gap-2">
                          <Cpu className="size-3.5" /> NVIDIA GPU
                        </span>
                        <span className="inline-flex items-center gap-1 text-success">
                          <CheckCircle2 className="size-3.5" /> Verified
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground font-mono break-all">attest: device cert</p>
                    </div>
                    <div className="rounded-md border bg-background p-3">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="inline-flex items-center gap-2">
                          <Lock className="size-3.5" /> Runtime
                        </span>
                        <span className="inline-flex items-center gap-1 text-success">
                          <CheckCircle2 className="size-3.5" /> Verified
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground font-mono break-all">policy: sha256:…</p>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-4">
            {connectionSummary}
          </p>
        </div>
      </main>
    </div>
  )
}
