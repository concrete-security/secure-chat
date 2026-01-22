"use client"

import { useState, FormEvent, KeyboardEvent, useMemo, useRef, useEffect, useCallback, Suspense, type CSSProperties } from "react"

import Link from "next/link"
import Image from "next/image"
import { useTheme } from "next-themes"
import {
  ArrowDown,
  Send,
  Lock,
  ShieldCheck,
  CheckCircle2,
  Bot,
  Globe,
  Paperclip,
  FileText,
  X,
  Sparkles,
  Save,
  MessageSquarePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Key,
  Sun,
  Moon,
  Info,
  Circle,
  UserCircle2,
  ExternalLink,
  Terminal,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FeedbackButton } from "@/components/feedback-button"
import { streamConfidentialChat, confidentialChatConfig } from "@/lib/confidential-chat"
import { createRatlsClient, warmupRatlsConnection, getRatlsProxyUrl, deriveTargetHost, getPolicy, parseAppComposeServices, getImageUrl, GITHUB_REPO_URL, DOCKER_COMPOSE_URL, type RatlsAttestationResult, type RatlsPolicy } from "@/lib/ratls-client"
import { Markdown } from "@/components/markdown"
import { cn } from "@/lib/utils"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import { isAuthSessionMissingError } from "@/lib/supabase/errors"


type Message = {
  role: "user" | "assistant"
  content: string
  attachments?: UploadedFile[]
  reasoning_content?: string
  streaming?: boolean
  finishReason?: string
  reasoningStartTime?: number
  reasoningEndTime?: number
}
type UploadedFile = { name: string; content: string; size: number; type: string }

type HostParts = {
  host: string
  hostname: string
}

type StoredProviderSettings = {
  baseUrl?: string
}

type RatlsConnectionState =
  | { status: "disconnected" }
  | { status: "connecting" }
  | { status: "connected"; attestation: RatlsAttestationResult }
  | { status: "error"; error: string }

type RatlsLogEntry = {
  timestamp: Date
  level: "info" | "success" | "warn" | "error"
  message: string
}

const PROVIDER_SETTINGS_STORAGE_KEY = "confidential-provider-settings-v1"
const PROVIDER_TOKEN_SESSION_KEY = "confidential-provider-token"
const HERO_MESSAGE_STORAGE_KEY = "hero-initial-message"
const HERO_FILES_STORAGE_KEY = "hero-uploaded-files"
const GUEST_USAGE_STORAGE_KEY = "confidential-chat-guest-used"
const GUEST_ACTIVE_SESSION_KEY = "confidential-chat-guest-active"
const GUEST_LIMITS_ENABLED = process.env.NEXT_PUBLIC_CONFIDENTIAL_ENABLE_GUEST_LIMITS === "true"

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

function formatIdentifierSnippet(value: string, maxLength = 40) {
  if (!value) return "—"
  return truncateMiddle(value, maxLength)
}



function generateUUID(): string {
  if (typeof crypto === "undefined") {
    throw new Error("crypto is not available in this environment")
  }
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  if (typeof crypto.getRandomValues !== "function") {
    throw new Error("crypto.getRandomValues is not available in this environment")
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}


// Test mode can ONLY be activated in non-production builds (dev/test)
// This ensures the bypass code is dead code in production builds
const ATTESTATION_TEST_MODE =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_ATTESTATION_TEST_MODE === "true"

function ConfidentialAIContent() {
  const envProviderApiBase = normalize(confidentialChatConfig.providerApiBase)
  const envProviderModel = normalize(confidentialChatConfig.providerModel)
  const envProviderName = normalize(confidentialChatConfig.providerName)
  const ratlsProxyUrl = getRatlsProxyUrl()

  const [providerBaseUrlInput, setProviderBaseUrlInput] = useState(() => envProviderApiBase ?? "")
  const [providerApiKeyInput, setProviderApiKeyInput] = useState("")
  const [configError, setConfigError] = useState<string | null>(null)
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false)
  const [sessionDialogOpen, setSessionDialogOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const supabase = useMemo(() => {
    try {
      return createSupabaseBrowserClient()
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Supabase client unavailable in confidential chat:", error)
      }
      return null
    }
  }, [])
  const [authState, setAuthState] = useState<"loading" | "signed-in" | "signed-out">(supabase ? "loading" : "signed-out")
  const [authUserEmail, setAuthUserEmail] = useState<string | null>(null)
  const [guestUsageRestricted, setGuestUsageRestricted] = useState(false)
  const [guestNotice, setGuestNotice] = useState<string | null>(null)
  const [ratlsState, setRatlsState] = useState<RatlsConnectionState>({ status: "disconnected" })
  const ratlsFetchRef = useRef<typeof fetch | null>(null)
  const [proofDetailsModalOpen, setProofDetailsModalOpen] = useState(false)
  const [ratlsLogs, setRatlsLogs] = useState<RatlsLogEntry[]>([])

  const addRatlsLog = useCallback((level: RatlsLogEntry["level"], message: string) => {
    const entry: RatlsLogEntry = { timestamp: new Date(), level, message }
    setRatlsLogs(prev => [...prev, entry])
    // Also log to console
    const consoleMethod = level === "error" ? console.error : level === "warn" ? console.warn : console.log
    consoleMethod(`[RA-TLS] ${message}`)
  }, [])

  const providerApiBase = normalize(providerBaseUrlInput)
  const providerModel = envProviderModel
  const sanitizedEnvDisplayName = sanitizeDisplayName(envProviderName)
  const sanitizedModelDisplayName = sanitizeDisplayName(providerModel)
  const providerDisplayName = sanitizedEnvDisplayName ?? sanitizedModelDisplayName

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
    if (providerDisplayName) {
      return providerDisplayName
    }
    if (!providerModel) {
      return "Umbra"
    }
    return /concrete/i.test(providerModel) ? "Umbra" : providerModel
  })()

  const connectionSummary = providerApiBase
    ? providerDisplayName
      ? `Direct connection to ${providerDisplayName}${providerHost ? ` via ${providerHost}` : ""}.`
      : providerModel
        ? `Direct connection to model ${providerModel}${providerHost ? ` via ${providerHost}` : ""}.`
        : providerHost
          ? `Direct connection via ${providerHost}.`
          : "Direct connection configured."
    : "Provide a confidential provider base URL to enable remote inference."
  const modelDisplayLabel = providerDisplayName ?? providerModel ?? null
  const modelDisplayTitle =
    modelDisplayLabel && providerModel && modelDisplayLabel !== providerModel ? providerModel : undefined
  const providerConfigured = Boolean(providerApiBase)
  const tokenPresent = providerApiKeyInput.trim().length > 0
  const guestLimitsEnabled = Boolean(supabase) && GUEST_LIMITS_ENABLED
  const connectionState: "connected" | "disconnected" = providerConfigured ? "connected" : "disconnected"
  const connectionLabel = providerConfigured ? "Connected" : "Not connected"
  const guestRestrictionActive = guestLimitsEnabled && authState === "signed-out" && guestUsageRestricted
  const authStatusLabel =
    !guestLimitsEnabled
      ? "Beta preview"
      : authState === "loading"
        ? "Checking access…"
        : authState === "signed-in"
          ? authUserEmail
            ? `Signed in as ${authUserEmail}`
            : "Signed in"
          : guestRestrictionActive
            ? "Guest preview · limit reached"
            : "Guest preview"

  const [messages, setMessages] = useState<Message[]>(() => [
    {
      role: "assistant",
      content: buildGreeting(providerModel, assistantName, providerHost),
    },
  ])

  const secureChannelReady = ratlsState.status === "connected" && ratlsState.attestation.trusted

  const applySupabaseSession = useCallback(
    (sessionUserEmail: string | null) => {
      setAuthState((previous) => {
        const next = sessionUserEmail ? "signed-in" : "signed-out"
        return previous === next ? previous : next
      })
      setAuthUserEmail((previous) => (previous === sessionUserEmail ? previous : sessionUserEmail))
    },
    []
  )

  useEffect(() => {
    const client = supabase
    if (!client) {
      applySupabaseSession(null)
      return
    }
    const authClient = client as NonNullable<typeof client>

    let mounted = true

    async function resolveInitialUser() {
      try {
        const { data, error } = await authClient.auth.getUser()
        if (!mounted) return
        if (error) {
          if (isAuthSessionMissingError(error)) {
            applySupabaseSession(null)
            return
          }
          console.error("Failed to resolve Supabase user", error)
          applySupabaseSession(null)
          return
        }
        applySupabaseSession(data.user?.email ?? null)
      } catch (error) {
        console.error("Unexpected error resolving Supabase user", error)
        if (mounted) {
          applySupabaseSession(null)
        }
      }
    }

    void resolveInitialUser()

    const {
      data: { subscription },
    } = authClient.auth.onAuthStateChange((_event: string, session: { user?: { email?: string | null } } | null) => {
      if (!mounted) return
      applySupabaseSession(session?.user?.email ?? null)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [applySupabaseSession, supabase])

  useEffect(() => {
    if (!guestLimitsEnabled) {
      setGuestUsageRestricted(false)
      setGuestNotice(null)
      return
    }

    if (authState === "loading") {
      return
    }

    if (authState === "signed-in") {
      setGuestUsageRestricted(false)
      setGuestNotice(null)
      try {
        sessionStorage.removeItem(GUEST_ACTIVE_SESSION_KEY)
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("Failed to reset guest session flag", error)
        }
      }
      return
    }

    try {
      const alreadyUsed = localStorage.getItem(GUEST_USAGE_STORAGE_KEY)
      const activeSession = sessionStorage.getItem(GUEST_ACTIVE_SESSION_KEY)
      const locked = Boolean(alreadyUsed && !activeSession)
      setGuestUsageRestricted(locked)
      setGuestNotice(
        locked ? "You've already used your guest confidential session. Sign in to continue." : null
      )
    } catch (error) {
      console.warn("Failed to resolve guest usage state", error)
      setGuestUsageRestricted(false)
      setGuestNotice(null)
    }
  }, [authState, guestLimitsEnabled])

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
  const chatFormRef = useRef<HTMLFormElement | null>(null)
  const heroSubmissionRef = useRef<{ message: string; hasFiles: boolean } | null>(null)
  const heroAutoSubmitAttemptedRef = useRef(false)
  const sendMessageRef = useRef<((payload?: { text: string; files: UploadedFile[] }) => Promise<void>) | null>(null)
  const [heroSubmissionVersion, setHeroSubmissionVersion] = useState(0)

  useEffect(() => {
    try {
      const storedMessage = sessionStorage.getItem(HERO_MESSAGE_STORAGE_KEY)
      const storedFiles = sessionStorage.getItem(HERO_FILES_STORAGE_KEY)

      if (storedMessage === null && !storedFiles) {
        return
      }

      let parsedFiles: UploadedFile[] = []
      if (storedFiles) {
        try {
          parsedFiles = JSON.parse(storedFiles) as UploadedFile[]
        } catch (error) {
          console.error("Failed to parse hero files", error)
        }
      }

      if (parsedFiles.length > 0) {
        setUploadedFiles(parsedFiles)
      }

      const message = storedMessage ?? ""
      const hasMessage = message.trim().length > 0
      const hasFiles = parsedFiles.length > 0

      if (hasMessage) {
        setInput(message)
      } else if (hasFiles) {
        setInput("")
      }

      if (hasMessage || hasFiles) {
        heroSubmissionRef.current = { message, hasFiles }
        setHeroSubmissionVersion((previous) => previous + 1)
      }

      sessionStorage.removeItem(HERO_MESSAGE_STORAGE_KEY)
      sessionStorage.removeItem(HERO_FILES_STORAGE_KEY)
    } catch (error) {
      console.error("Failed to restore hero submission", error)
    }
  }, [])

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
      salt = generateUUID()
      localStorage.setItem(CACHE_SALT_KEY, salt)
    }
    setCacheSalt(salt)
  }, [])

  const activeTheme = (currentTheme === "system" ? resolvedTheme : currentTheme) ?? "light"
  const isStreaming = useMemo(() => messages.some((message) => message.streaming), [messages])
  const hasConversationHistory = useMemo(
    () => messages.some((message) => message.role === "user") || messages.length > 1,
    [messages]
  )
  const showScrollToLatest = !isPinnedToBottom || hasNewMessages
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

  const connectRatls = useCallback(async () => {
    // Clear previous logs on new connection attempt
    setRatlsLogs([])

    if (!providerApiBase) {
      addRatlsLog("info", "Waiting for provider configuration...")
      setRatlsState({ status: "disconnected" })
      return
    }

    // Test mode: auto-verify attestation for E2E testing (only in non-production builds)
    if (ATTESTATION_TEST_MODE && !ratlsProxyUrl) {
      addRatlsLog("info", "Test mode: simulating attestation...")
      setRatlsState({ status: "connecting" })
      await new Promise(resolve => setTimeout(resolve, 500))
      addRatlsLog("success", "Test mode: attestation auto-verified")
      // Use regular fetch in test mode so chat messages can be sent
      ratlsFetchRef.current = fetch
      setRatlsState({
        status: "connected",
        attestation: {
          trusted: true,
          teeType: "TEST_MODE",
          tcbStatus: "UpToDate",
        },
      })
      return
    }

    if (!ratlsProxyUrl) {
      addRatlsLog("error", "No proxy URL configured")
      setRatlsState({ status: "error", error: "RA-TLS proxy URL not configured" })
      return
    }

    const targetHost = deriveTargetHost(providerApiBase)
    addRatlsLog("info", `Initiating connection to ${targetHost}`)
    setRatlsState({ status: "connecting" })

    try {
      // Use the environment-appropriate policy (production or dev)
      const policy = getPolicy()
      const config = { proxyUrl: ratlsProxyUrl, targetHost, policy }

      addRatlsLog("info", "Loading WASM attestation module...")
      addRatlsLog("info", "Verifying WASM integrity (SHA-384)...")

      // Pre-establish the TLS connection immediately on page load
      addRatlsLog("info", `Connecting to proxy at ${ratlsProxyUrl}`)
      addRatlsLog("info", "Establishing TLS connection...")
      addRatlsLog("info", "Performing TLS handshake with TEE server...")

      await warmupRatlsConnection(config, (att) => {
        addRatlsLog("info", "Received attestation quote from server")
        addRatlsLog("info", `TEE Type: ${att.teeType.toUpperCase()}`)
        addRatlsLog("info", "Verifying Intel TDX quote with DCAP...")
        addRatlsLog("info", `TCB Status: ${att.tcbStatus}`)

        if (policy.expected_bootchain?.mrtd) {
          addRatlsLog("info", "Verifying MRTD measurement...")
        }
        if (policy.expected_bootchain?.rtmr0) {
          addRatlsLog("info", "Verifying RTMR0 (firmware)...")
        }
        if (policy.expected_bootchain?.rtmr1) {
          addRatlsLog("info", "Verifying RTMR1 (OS)...")
        }
        if (policy.expected_bootchain?.rtmr2) {
          addRatlsLog("info", "Verifying RTMR2 (application)...")
        }
        if (policy.os_image_hash) {
          addRatlsLog("info", "Verifying OS image hash...")
        }
        if (policy.app_compose?.docker_compose_file) {
          addRatlsLog("info", "Verifying container image digests...")
        }

        if (att.trusted) {
          addRatlsLog("success", "All attestation checks passed")
          addRatlsLog("success", "Secure channel established")
        } else {
          addRatlsLog("warn", "Attestation verification completed with warnings")
        }

        setRatlsState({
          status: "connected",
          attestation: att,
        })
      })

      // Create the fetch client (will reuse the warmed-up connection)
      const ratlsFetch = await createRatlsClient(config)
      ratlsFetchRef.current = ratlsFetch

    } catch (error) {
      // Sanitize error message in production
      const errorMessage = process.env.NODE_ENV === "production"
        ? "Failed to establish secure connection"
        : error instanceof Error ? error.message : "Failed to establish RA-TLS connection"
      addRatlsLog("error", `Connection failed: ${errorMessage}`)
      setRatlsState({
        status: "error",
        error: errorMessage,
      })
    }
  }, [ratlsProxyUrl, providerApiBase, addRatlsLog])

  useEffect(() => {
    void connectRatls()
  }, [connectRatls])

  const RatlsProofContent = ({
    variant,
    onViewDetails,
  }: {
    variant: "sidebar" | "dialog"
    onViewDetails?: () => void
  }) => {
    const isCompact = variant === "sidebar"
    const badgeBase =
      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.24em]"

    const targetHost = providerApiBase ? deriveTargetHost(providerApiBase) : null
    const connectionCopy = targetHost
      ? `Secure connection to ${targetHost}.`
      : "Configure a provider URL to establish secure connection."

    const statusBadge = (() => {
      switch (ratlsState.status) {
        case "connected":
          return (
            <div className={cn(badgeBase, "border-[#1BAF9F]/60 bg-[#1BAF9F]/10 text-[#037C6A]")}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Connected
            </div>
          )
        case "connecting":
          return (
            <div className={cn(badgeBase, "border-brand-primary/40 bg-brand-primary/10 text-brand-primary")}>
              <Sparkles className="h-3.5 w-3.5" /> Connecting
            </div>
          )
        case "error":
          return (
            <div className={cn(badgeBase, "border-rose-400/60 bg-rose-400/10 text-rose-600")}>
              <X className="h-3.5 w-3.5" /> Error
            </div>
          )
        default:
          return (
            <div className={cn(badgeBase, "border-border/60 bg-card/40 text-muted-foreground")}>Pending</div>
          )
      }
    })()

    type ChecklistState = "pending" | "running" | "ok" | "error"
    const connectionState: ChecklistState =
      ratlsState.status === "connecting"
        ? "running"
        : ratlsState.status === "connected"
          ? "ok"
          : ratlsState.status === "error"
            ? "error"
            : "pending"
    const attestationState: ChecklistState =
      ratlsState.status === "connecting"
        ? "running"
        : ratlsState.status === "connected" && ratlsState.attestation.trusted
          ? "ok"
          : ratlsState.status === "error"
            ? "error"
            : "pending"

    const checklistItems: Array<{ label: string; description: string; state: ChecklistState }> = [
      {
        label: "Server identity confirmed",
        description: connectionCopy,
        state: connectionState,
      },
      {
        label: "Hardware protection active",
        description: ratlsState.status === "connected"
          ? `${ratlsState.attestation.teeType} - ${ratlsState.attestation.tcbStatus}`
          : "Verifying secure environment...",
        state: attestationState,
      },
    ]

    const renderChecklistIcon = (state: ChecklistState) => {
      switch (state) {
        case "ok":
          return <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        case "running":
          return <Sparkles className="h-4 w-4 text-brand-primary animate-pulse" />
        case "error":
          return <X className="h-4 w-4 text-rose-600" />
        default:
          return <Circle className="h-4 w-4 text-muted-foreground" />
      }
    }

    const body = (() => {
      switch (ratlsState.status) {
        case "connected": {
          const isVerified = ratlsState.attestation.trusted
          return (
            <div className={cn("space-y-2", isCompact ? "text-xs" : "text-sm")}>
              <div
                className={cn(
                  "flex items-center gap-2 rounded-2xl border px-3 py-2.5 shadow-sm",
                  isVerified
                    ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-600 dark:border-emerald-400/40 dark:bg-emerald-400/5"
                    : "border-rose-400/60 bg-rose-400/10 text-rose-600 dark:border-rose-400/40 dark:bg-rose-400/5"
                )}
              >
                {isVerified ? (
                  <>
                    <Lock className="h-4 w-4" />
                    <span className="text-xs font-medium">Protected and verified</span>
                  </>
                ) : (
                  <>
                    <X className="h-4 w-4" />
                    <span className="text-xs font-medium">Security check failed</span>
                  </>
                )}
              </div>
            </div>
          )
        }
        case "connecting":
          return (
            <div
              className={cn(
                "rounded-2xl border border-border/40 bg-card/70 px-3 py-2 text-muted-foreground shadow-sm dark:border-border/60 dark:bg-card/20",
                isCompact ? "text-xs" : "text-sm"
              )}
            >
              <Sparkles className="h-4 w-4 inline-block mr-2 animate-pulse" />
              Verifying server security...
            </div>
          )
        case "error":
          return (
            <div className={cn("space-y-2", isCompact ? "text-xs" : "text-sm")}>
              <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive">
                {ratlsState.error}
              </div>
            </div>
          )
        default:
          return (
            <div
              className={cn(
                "rounded-2xl border border-border/40 bg-card/60 px-3 py-2 text-muted-foreground dark:border-border/60 dark:bg-card/15",
                isCompact ? "text-xs" : "text-sm"
              )}
            >
              Waiting for provider configuration…
            </div>
          )
      }
    })()

    return (
      <div className="space-y-3">
        <div className="space-y-2">
          <div className={cn("flex items-start justify-between gap-3", !isCompact && "gap-4")}>
            <div className="flex items-start gap-3">
              <div className={cn("rounded-full border border-brand-primary/40 bg-brand-primary/10 text-brand-primary", isCompact ? "p-2" : "p-3")}>
                <ShieldCheck className={cn("text-brand-primary", isCompact ? "h-4 w-4" : "h-5 w-5")} />
              </div>
              <div className="space-y-1">
                <p className={cn("font-semibold text-foreground", isCompact ? "text-sm" : "text-base")}>Security Proof</p>
                <p className={cn("text-muted-foreground", isCompact ? "text-[10px]" : "text-xs")}>Hardware-verified protection</p>
              </div>
            </div>
            {statusBadge}
          </div>
          <p className={cn("text-muted-foreground w-full", isCompact ? "text-[11px]" : "text-sm")}>{connectionCopy}</p>
        </div>
        <div className="rounded-2xl border border-border/40 bg-card/70 p-3 shadow-sm dark:border-border/60 dark:bg-card/15">
          <p className="text-[10px] uppercase tracking-[0.32em] text-muted-foreground/80 mb-2">
            Security checklist
          </p>
          <div className="space-y-2">
            {checklistItems.map((item) => (
              <div key={item.label} className="flex items-start gap-3">
                <div className="mt-0.5">{renderChecklistIcon(item.state)}</div>
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-foreground">{item.label}</p>
                  <p className="text-[11px] text-muted-foreground">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        {body}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size={isCompact ? "sm" : "default"}
            onClick={() => void connectRatls()}
            disabled={ratlsState.status === "connecting" || !providerApiBase}
            className="rounded-full"
          >
            {ratlsState.status === "connecting" ? "Connecting…" : "Reconnect"}
          </Button>
          {onViewDetails && ratlsState.status === "connected" && (
            <Button
              type="button"
              variant="outline"
              size={isCompact ? "sm" : "default"}
              onClick={onViewDetails}
              className="rounded-full"
            >
              View Details
            </Button>
          )}
        </div>
      </div>
    )
  }

  const RatlsDetailsModal = () => {
    if (ratlsState.status !== "connected") return null

    const targetHost = providerApiBase ? deriveTargetHost(providerApiBase) : "Unknown"
    const policy = getPolicy()
    const services = parseAppComposeServices(policy)

    return (
      <Dialog open={proofDetailsModalOpen} onOpenChange={setProofDetailsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border border-border/50 bg-background/95 backdrop-blur dark:border-border/60 dark:bg-background/80">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
              <ShieldCheck className="h-5 w-5 text-brand-primary" />
              Security Details
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Verification Status - moved to top */}
            <div className="rounded-2xl border border-border/40 bg-card/70 p-3 shadow-sm dark:border-border/60 dark:bg-card/10">
              <div className="flex items-center gap-2">
                {ratlsState.attestation.trusted ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm font-medium text-emerald-600">
                      Connection attested and verified
                    </span>
                  </>
                ) : (
                  <>
                    <X className="h-4 w-4 text-rose-600" />
                    <span className="text-sm font-medium text-rose-600">
                      Security verification failed
                    </span>
                  </>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                The connection to <span className="font-mono">{targetHost}</span> has been attested and verified
                using Attested TLS. The server&apos;s certificate is cryptographically bound to the
                hardware measurements below, proving the exact code running in the secure enclave.
              </p>
            </div>

            {/* TEE Information */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">TEE Information</h3>
              <div className="rounded-2xl border border-border/40 bg-card/80 p-3 shadow-sm dark:border-border/60 dark:bg-card/20">
                <dl className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">TEE Type</dt>
                    <dd className="font-mono text-foreground/80 uppercase">
                      {ratlsState.attestation.teeType}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">TCB Status</dt>
                    <dd className="font-mono text-foreground/80">
                      {ratlsState.attestation.tcbStatus}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            {/* VM & OS Measurements */}
            {(policy.os_image_hash || policy.expected_bootchain) && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">VM & OS Measurements</h3>
                <div className="rounded-2xl border border-border/40 bg-card/80 p-3 shadow-sm dark:border-border/60 dark:bg-card/20">
                  <dl className="space-y-3 text-sm">
                    {policy.os_image_hash && (
                      <div>
                        <dt className="text-muted-foreground text-xs mb-1">OS Image Hash</dt>
                        <dd>
                          <code className="block text-[10px] text-foreground/80 font-mono break-all select-all bg-muted/50 px-2 py-1 rounded">
                            {policy.os_image_hash}
                          </code>
                        </dd>
                      </div>
                    )}
                    {policy.expected_bootchain?.mrtd && (
                      <div>
                        <dt className="text-muted-foreground text-xs mb-1">MRTD (Initial TD Measurement)</dt>
                        <dd>
                          <code className="block text-[10px] text-foreground/80 font-mono break-all select-all bg-muted/50 px-2 py-1 rounded">
                            {policy.expected_bootchain.mrtd}
                          </code>
                        </dd>
                      </div>
                    )}
                    {policy.expected_bootchain?.rtmr0 && (
                      <div>
                        <dt className="text-muted-foreground text-xs mb-1">RTMR0 (Firmware Measurement)</dt>
                        <dd>
                          <code className="block text-[10px] text-foreground/80 font-mono break-all select-all bg-muted/50 px-2 py-1 rounded">
                            {policy.expected_bootchain.rtmr0}
                          </code>
                        </dd>
                      </div>
                    )}
                    {policy.expected_bootchain?.rtmr1 && (
                      <div>
                        <dt className="text-muted-foreground text-xs mb-1">RTMR1 (OS Measurement)</dt>
                        <dd>
                          <code className="block text-[10px] text-foreground/80 font-mono break-all select-all bg-muted/50 px-2 py-1 rounded">
                            {policy.expected_bootchain.rtmr1}
                          </code>
                        </dd>
                      </div>
                    )}
                    {policy.expected_bootchain?.rtmr2 && (
                      <div>
                        <dt className="text-muted-foreground text-xs mb-1">RTMR2 (Application Measurement)</dt>
                        <dd>
                          <code className="block text-[10px] text-foreground/80 font-mono break-all select-all bg-muted/50 px-2 py-1 rounded">
                            {policy.expected_bootchain.rtmr2}
                          </code>
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>
            )}

            {/* Verified Container Images */}
            {services.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Verified Container Images</h3>
                <div className="rounded-2xl border border-border/40 bg-card/80 p-3 shadow-sm dark:border-border/60 dark:bg-card/20">
                  <ul className="space-y-4">
                    {services.map((service) => {
                      const imageUrl = getImageUrl(service.image, service.digest)
                      return (
                        <li key={service.name} className="text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-foreground">{service.name}</span>
                            {imageUrl && (
                              <a
                                href={imageUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-brand-primary hover:underline"
                              >
                                {service.image.startsWith("ghcr.io") ? "GHCR" : "Docker Hub"}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                          <code className="mt-1.5 block text-[10px] text-muted-foreground font-mono break-all select-all bg-muted/50 px-2 py-1 rounded">
                            {service.image}
                          </code>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </div>
            )}

            {/* Attestation Logs Console */}
            {ratlsLogs.length > 0 && (
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="logs" className="border-none">
                  <AccordionTrigger className="py-2 hover:no-underline">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Terminal className="h-4 w-4" />
                      Attestation Log
                      <span className="text-xs font-normal text-muted-foreground">
                        ({ratlsLogs.length} entries)
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="rounded-lg border border-border/40 bg-zinc-950 dark:bg-zinc-900 overflow-hidden">
                      <div className="max-h-[200px] overflow-y-auto p-3 font-mono text-xs">
                        {ratlsLogs.map((log, index) => (
                          <div key={index} className="flex gap-2 py-0.5">
                            <span className="text-zinc-500 shrink-0">
                              {log.timestamp.toLocaleTimeString("en-US", {
                                hour12: false,
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                                fractionalSecondDigits: 3,
                              })}
                            </span>
                            <span className={cn(
                              log.level === "error" && "text-red-400",
                              log.level === "warn" && "text-yellow-400",
                              log.level === "success" && "text-emerald-400",
                              log.level === "info" && "text-zinc-300",
                            )}>
                              {log.message}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            <div className="flex flex-wrap gap-3 pt-2 border-t border-border/40">
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-brand-primary hover:underline"
              >
                View Source on GitHub
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <a
                href={DOCKER_COMPOSE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-brand-primary hover:underline"
              >
                View docker-compose.yml
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // Upload files
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (guestRestrictionActive) {
      return
    }
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
      const pdfModuleUrl = `${window.location.origin}/pdfjs/pdf.mjs`
      const pdfWorkerUrl = `${window.location.origin}/pdfjs/pdf.worker.mjs`
      const pdfjsLibModule = await import(/* webpackIgnore: true */ pdfModuleUrl)
      const pdfjsLib = (pdfjsLibModule as unknown as { default?: any }).default ?? (window as any).pdfjsLib ?? pdfjsLibModule

      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

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
    })

    const releaseDelay = behavior === "smooth" ? 250 : 0
    window.setTimeout(() => {
      isProgrammaticScrollRef.current = false
    }, releaseDelay)

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

  const handleStartNewConversation = useCallback(() => {
    if (hasConversationHistory && typeof window !== "undefined") {
      const confirmed = window.confirm(
        "Starting a new conversation will clear the current transcript. Conversations aren't saved automatically. Continue?"
      )
      if (!confirmed) {
        return
      }
    }

    const greeting = buildGreeting(providerModel, assistantName, providerHost)
    setMessages([{ role: "assistant", content: greeting }])
    setReasoningOpen({})
    setInput("")
    setUploadedFiles([])
    setCipherPreview(null)
    setEncrypting(false)
    setIsSending(false)
    heroSubmissionRef.current = null
    heroAutoSubmitAttemptedRef.current = false
    scrollToBottom("auto")
  }, [assistantName, hasConversationHistory, providerHost, providerModel, scrollToBottom])

  const handleSaveConversation = useCallback(() => {
    if (messages.length === 0 || typeof window === "undefined") return

    const exportedAt = new Date().toISOString()
    const exportPayload = {
      exportedAt,
      assistant: assistantName,
      provider: {
        model: providerModel ?? null,
        baseUrl: providerApiBase ?? null,
        host: providerHost ?? null,
      },
      messages: messages.map(({ role, content, attachments, reasoning_content, finishReason }) => ({
        role,
        content,
        attachments:
          attachments?.map(({ name, type, size, content }) => ({
            name,
            type,
            size,
            content,
          })) ?? undefined,
        reasoning_content,
        finishReason,
      })),
    }

    const json = JSON.stringify(exportPayload, null, 2)
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const fileName = `confidential-conversation-${exportedAt.replace(/[:.]/g, "-")}.json`

    const link = document.createElement("a")
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    window.setTimeout(() => {
      URL.revokeObjectURL(url)
    }, 0)
  }, [assistantName, messages, providerApiBase, providerHost, providerModel])

  useEffect(() => {
    if (!autoScrollRef.current) return

    const container = messagesContainerRef.current
    if (!container) return

    const { scrollTop, clientHeight, scrollHeight } = container
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight)

    if (distanceFromBottom > 100) return

    scrollToBottom("smooth")
  }, [reasoningOpen, scrollToBottom])

  const sendMessage = async (override?: { text: string; files: UploadedFile[] }) => {
    if (isSending) return
    if (!secureChannelReady) {
      return
    }
    if (guestRestrictionActive) {
      setGuestNotice("You've already used your guest confidential session. Sign in to continue.")
      return
    }
    const rawText = override?.text ?? input
    const activeFiles = override?.files ?? uploadedFiles
    const text = rawText.trim()
    if (!text && activeFiles.length === 0) return

    if (!providerApiBase) {
      setConfigError("Add a confidential provider base URL before starting a session.")
      return
    }

    if (!providerModel) {
      setConfigError("Set NEXT_PUBLIC_VLLM_MODEL in your environment before starting a session.")
      return
    }

    if (guestLimitsEnabled && authState !== "signed-in") {
      try {
        sessionStorage.setItem(GUEST_ACTIVE_SESSION_KEY, "1")
        localStorage.setItem(GUEST_USAGE_STORAGE_KEY, new Date().toISOString())
        setGuestUsageRestricted(false)
        setGuestNotice(null)
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("Failed to persist guest usage state", error)
        }
      }
    }

    const trimmedToken = providerApiKeyInput.trim()

    let messageContent = text
    if (activeFiles.length > 0) {
      const fileContents = activeFiles
        .map((file) => `\n\n[File: ${file.name}]\n${file.content}`)
        .join("")
      messageContent = `${text}${fileContents}`
    }

    const userMessage: Message = {
      role: "user",
      content: messageContent,
      attachments: activeFiles.length > 0 ? activeFiles.map((file) => ({ ...file })) : undefined,
    }

    const conversationBeforeAssistant: Message[] = [...messages, userMessage]
      const assistantPlaceholder: Message = {
      role: "assistant",
      content: "",
      streaming: true,
      reasoningStartTime: Date.now(),
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
      if (!ratlsFetchRef.current) {
        throw new Error("RA-TLS connection not established. Cannot connect to model securely.")
      }
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
          fetchImpl: ratlsFetchRef.current,
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
        reasoningEndTime: Date.now(),
      })
      handleStreamingFollow("smooth")
    } catch (error) {
      console.warn("Confidential chat request failed", error)
      const errorMessage = error instanceof Error && error.message ? error.message : "An unexpected error occurred. Please try again later."
      updateAssistantMessage({
        content: errorMessage,
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

  sendMessageRef.current = sendMessage

  useEffect(() => {
    if (heroAutoSubmitAttemptedRef.current) {
      return
    }
    if (!providerApiBase) {
      return
    }
    if (!secureChannelReady) {
      return
    }
    const pendingSubmission = heroSubmissionRef.current
    if (!pendingSubmission) {
      return
    }
    if (guestLimitsEnabled && guestUsageRestricted) {
      heroSubmissionRef.current = null
      return
    }

    const pendingMessage = pendingSubmission.message ?? ""
    const pendingFiles = pendingSubmission.hasFiles ? [...uploadedFiles] : []
    const hasContent = pendingMessage.trim().length > 0 || pendingFiles.length > 0
    if (!hasContent) {
      heroSubmissionRef.current = null
      return
    }

    if (pendingSubmission.hasFiles && pendingFiles.length === 0) {
      heroAutoSubmitAttemptedRef.current = false
      return
    }

    heroAutoSubmitAttemptedRef.current = true
    const timeout = window.setTimeout(() => {
      const send = sendMessageRef.current
      if (!send) {
        heroAutoSubmitAttemptedRef.current = false
        return
      }

      heroSubmissionRef.current = null
      void send({ text: pendingMessage, files: pendingFiles })
    }, 600)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [providerApiBase, guestLimitsEnabled, guestUsageRestricted, uploadedFiles, secureChannelReady, heroSubmissionVersion])

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

      // Detect user scrolling up (scrollTop decreased)
      const previousScrollTop = lastScrollTopRef.current
      const scrolledUp = scrollTop < previousScrollTop - 1 // 1px threshold for sensitive detection

      lastScrollTopRef.current = scrollTop

      setIsPinnedToBottom(isAtBottom)

      if (isAtBottom) {
        // User scrolled back to bottom, re-enable auto-scroll
        setHasNewMessages(false)
        updateAutoScrollEnabled(true)
      } else if (scrolledUp && !isProgrammaticScrollRef.current) {
        // User actively scrolled up, disable auto-scroll
        updateAutoScrollEnabled(false)
      }
      // Otherwise, don't change auto-scroll state (content added, programmatic scroll, etc.)
    }

    // Detect wheel events (mousewheel/trackpad) to immediately disable auto-scroll
    const handleWheel = (e: WheelEvent) => {
      // If user scrolls up (negative deltaY), immediately disable auto-scroll
      if (e.deltaY < 0) {
        updateAutoScrollEnabled(false)
      }
    }

    // Detect touch start for mobile scrolling
    const handleTouchStart = () => {
      // When user starts touching to scroll, disable auto-scroll
      // We'll re-enable if they scroll back to bottom (detected by handleScroll)
      const { scrollTop, clientHeight, scrollHeight } = container
      const distanceFromBottom = scrollHeight - (scrollTop + clientHeight)
      // Only disable if not already at bottom
      if (distanceFromBottom > 24) {
        updateAutoScrollEnabled(false)
      }
    }

    handleScroll()
    container.addEventListener("scroll", handleScroll, { passive: true })
    container.addEventListener("wheel", handleWheel, { passive: true })
    container.addEventListener("touchstart", handleTouchStart, { passive: true })

    return () => {
      container.removeEventListener("scroll", handleScroll)
      container.removeEventListener("wheel", handleWheel)
      container.removeEventListener("touchstart", handleTouchStart)
    }
  }, [updateAutoScrollEnabled])

  return (
    <div className="flex h-[100dvh] flex-col bg-[#E8E7F0] text-foreground dark:bg-background">
      <main className="flex flex-1 flex-col min-h-0">
        <section className="relative flex h-full w-full flex-1 flex-col md:flex-row" aria-label="Confidential space">
          <aside
            className={cn(
              "flex flex-col border-border/40 bg-white/95 transition-[opacity,transform,width] duration-200 dark:border-border/60 dark:bg-[#0B0820]/95 md:border-border/40 md:bg-white/85 md:dark:bg-card/25",
              "fixed inset-y-0 left-0 z-40 h-[100dvh] w-[min(360px,90vw)] overflow-y-auto border-r shadow-[0_20px_60px_-25px_rgba(5,3,15,0.85)] md:static md:h-full md:w-auto md:flex-none md:border-b-0 md:border-r md:shadow-none",
              sidebarOpen
                ? "translate-x-0 opacity-100 pointer-events-auto gap-6 p-5 sm:p-6 md:p-4 md:w-full md:max-w-[320px]"
                : "-translate-x-full opacity-0 pointer-events-none md:translate-x-0 md:opacity-100 md:pointer-events-auto md:w-[56px] md:items-center md:justify-between md:px-2 md:py-4"
            )}
          >
            {sidebarOpen ? (
              <>
                <div className="space-y-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                        <Lock className="h-4 w-4 text-brand-accent" />
                        <span className="tracking-tight">Confidential Space</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {themeReady && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setTheme(activeTheme === "dark" ? "light" : "dark")}
                          className="h-7 w-7 rounded-full text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                          title={`Switch to ${activeTheme === "dark" ? "light" : "dark"} theme`}
                        >
                          {activeTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setSidebarOpen(false)}
                        className="h-7 w-7 rounded-full text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      >
                        <PanelLeftClose className="h-4 w-4" />
                        <span className="sr-only">Collapse panel</span>
                      </Button>
                    </div>
                  </div>

                  <div className={cn(
                    "rounded-xl border p-3 transition-colors",
                    secureChannelReady 
                      ? "border-emerald-500/20 bg-emerald-500/5 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                      : "border-amber-500/20 bg-amber-500/5"
                  )}>
                    <div className="flex items-center gap-2">
                      <div className={cn("h-2 w-2 rounded-full animate-pulse", secureChannelReady ? "bg-emerald-500" : "bg-amber-500")} />
                      <span className={cn("text-xs font-medium", secureChannelReady ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400")}>
                        {secureChannelReady ? "Secure Channel Active" : "Establishing Security..."}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-col gap-1 border-t border-border/50 pt-2">
                       <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <UserCircle2 className="h-3.5 w-3.5 text-brand-accent" />
                          <span className="truncate max-w-[180px]">{authState === "signed-in" ? authUserEmail : "Guest User"}</span>
                       </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">Session</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2 border-border/50 bg-card/50 hover:bg-card/80"
                        onClick={handleSaveConversation}
                        disabled={!hasConversationHistory}
                        title="Download JSON"
                      >
                        <Save className="h-3.5 w-3.5 text-brand-primary" />
                        <span className="text-xs">Save</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2 border-border/50 bg-card/50 hover:bg-card/80"
                        onClick={handleStartNewConversation}
                        disabled={isSending || isStreaming}
                      >
                        <MessageSquarePlus className="h-3.5 w-3.5 text-brand-primary" />
                        <span className="text-xs">New</span>
                      </Button>
                    </div>
                  </div>
                </div>

                <Accordion type="single" collapsible>
                  <AccordionItem value="proof" className="border-none">
                    <AccordionTrigger
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-brand-primary/60 bg-[linear-gradient(130deg,hsl(var(--brand-primary)/0.18),hsl(var(--brand-secondary)/0.42))] px-4 py-3 text-left text-sm font-semibold uppercase tracking-[0.24em] text-white shadow-[0_18px_35px_-24px_rgba(16,42,140,0.9)] transition hover:brightness-110 data-[state=open]:brightness-110 dark:border-brand-primary dark:bg-[linear-gradient(130deg,rgba(16,42,140,0.32),rgba(11,31,102,0.45))]"
                    >
                      <span className="inline-flex items-center gap-2 text-[11px]">
                        <ShieldCheck className="h-4 w-4" />
                        Proof of Confidentiality
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="mt-3 space-y-3 rounded-2xl border border-brand-primary/30 bg-[linear-gradient(135deg,hsl(var(--brand-primary)/0.08),hsl(var(--brand-secondary)/0.12))] p-4 shadow-sm dark:border-brand-primary/40 dark:bg-[linear-gradient(135deg,rgba(16,42,140,0.18),rgba(11,31,102,0.28))]">
                      <RatlsProofContent
                        variant="sidebar"
                        onViewDetails={() => setProofDetailsModalOpen(true)}
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                <div className="space-y-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">Reasoning intensity</h3>
                  <div className="flex flex-wrap gap-2">
                    {["low", "medium", "high"].map((effort) => (
                      <Button
                        key={effort}
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "h-8 rounded-full border px-4 text-[11px] uppercase tracking-[0.24em]",
                          reasoningEffort === effort
                            ? "border-brand-primary bg-brand-gradient text-white hover:brightness-110"
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

                <div className="mt-auto pt-4 flex items-center justify-center">
                  <Link
                    href="/"
                    className="inline-flex items-center justify-center whitespace-nowrap transition-opacity hover:opacity-80"
                  >
                    <Image src="/logo.png" alt="Confidential AI logo" width={20} height={20} className="shrink-0" />
                  </Link>
                </div>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-between gap-4 py-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setSidebarOpen(true)}
                  className="rounded-full border border-border/40 bg-card/80 text-muted-foreground transition hover:bg-card/90 dark:border-border/60 dark:bg-card/20 dark:text-foreground dark:hover:bg-card/30"
                >
                  <PanelLeftOpen className="h-4 w-4" />
                  <span className="sr-only">Expand panel</span>
                </Button>
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <Lock className="h-5 w-5 text-brand-accent" />
                  <span className="text-[10px] font-semibold uppercase tracking-[0.4em] [writing-mode:vertical-rl] [text-orientation:mixed]">
                    Confidential
                  </span>
                </div>
                <Link
                  href="/"
                  className="inline-flex items-center justify-center whitespace-nowrap transition-opacity hover:opacity-80"
                >
                  <Image src="/logo.png" alt="Confidential AI logo" width={20} height={20} className="shrink-0" />
                </Link>
              </div>
            )}
          </aside>

          {sidebarOpen ? (
            <button
              type="button"
              aria-label="Close confidential tools"
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 z-30 bg-[#08070B]/40 backdrop-blur-[2px] transition-opacity md:hidden"
            />
          ) : null}

          {!sidebarOpen ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
              className="fixed left-4 top-[calc(env(safe-area-inset-top,0)+16px)] z-30 rounded-full border border-border/50 bg-white/90 text-muted-foreground shadow-md backdrop-blur md:hidden"
            >
              <PanelLeftOpen className="h-4 w-4" />
              <span className="sr-only">Open confidential tools</span>
            </Button>
          ) : null}

          <div className="flex flex-1 flex-col min-h-0">
            <div
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto px-4 py-6 sm:px-8"
              role="log"
              aria-live="polite"
              aria-label="Confidential space transcript"
            >
              <div className="mx-auto flex w-full max-w-4xl flex-col space-y-8">
                {/* Onboarding Banner */}
                {messages.length <= 1 && !guestNotice && (
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-primary/10 via-brand-secondary/5 to-transparent p-6 border border-brand-primary/20 dark:border-brand-primary/30">
                     <div className="relative z-10 flex gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary dark:text-brand-accent dark:bg-brand-accent/10">
                           <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div className="space-y-2">
                           <h3 className="font-semibold text-foreground">Welcome to Confidential AI</h3>
                           <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
                              This chat session is end-to-end encrypted. 
                              Your data remains confidential. 
                              Verify the Attestation status to have more information on system integrity.
                           </p>
                        </div>
                     </div>
                     {/* Background decoration */}
                     <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-brand-primary/5 blur-3xl" />
                  </div>
                )}
                {guestNotice ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 shadow-sm dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p>{guestNotice}</p>
                      {authState !== "signed-in" ? (
                        <Button
                          asChild
                          size="sm"
                          variant="ghost"
                          className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-700 transition hover:bg-white dark:border-amber-400/70 dark:bg-transparent dark:text-amber-200 dark:hover:bg-amber-400/10"
                        >
                          <Link href="/sign-in">Sign in</Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {messages.map((m, i) => {
                  const isUser = m.role === "user"
                  const isAssistant = !isUser
                  const isReasoningOpen = reasoningOpen[i] ?? false
                  const reasoningAvailable =
                    typeof m.reasoning_content === "string" && m.reasoning_content.trim().length > 0
                  const hasReasoningActivity = m.streaming || reasoningAvailable
                  const showReasoningPanel = isAssistant && (m.streaming || reasoningAvailable)
                  const truncatedByLength = isAssistant && m.finishReason === "length"

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
                    ? "w-full sm:max-w-[85%] md:max-w-3xl self-end whitespace-pre-wrap break-words rounded-3xl bg-brand-gradient px-6 py-4 text-left text-white shadow-md dark:shadow-none"
                    : "w-full sm:max-w-[85%] md:max-w-4xl self-start whitespace-pre-wrap break-words rounded-none bg-transparent px-0 py-0 text-left text-foreground leading-7"

                  const bubbleStyle: CSSProperties | undefined = isUser
                    ? ({
                        "--foreground": "0 0% 100%",
                        "--muted-foreground": "0 0% 85%",
                      } as CSSProperties)
                    : undefined

                  const attachmentsContainerClass = cn(
                    "flex flex-col gap-1 text-xs text-muted-foreground",
                    isUser ? "items-end self-end text-right" : "items-start self-start text-left"
                  )

                  const toggleReasoningPanel = () => {
                    setReasoningOpen((prev) => ({ ...prev, [i]: !isReasoningOpen }))
                  }

                  const messageRowClass = cn(
                    "flex w-full gap-4",
                    isAssistant ? "flex-col items-start sm:flex-row sm:items-start" : "flex-row",
                    isUser ? "justify-end" : "justify-start"
                  )

                  return (
                    <div key={i} className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
                      <div className={messageRowClass}>
                        {isAssistant && (
                          <div className="relative mt-1">
                            <button
                              type="button"
                              onClick={showReasoningPanel ? toggleReasoningPanel : undefined}
                              disabled={!showReasoningPanel}
                              className={cn(
                                "flex size-8 items-center justify-center rounded-full border border-border/40 bg-card/80 text-brand-primary transition-all dark:border-border/60 dark:bg-card/30",
                                "cursor-pointer hover:brightness-110 hover:bg-brand-primary/10",
                                isReasoningOpen && "text-brand-primary ring-2 ring-brand-primary/20"
                              )}
                              title={showReasoningPanel ? (isReasoningOpen ? "Hide reasoning" : "Show reasoning") : undefined}
                            >
                              <Bot className="h-5 w-5" />
                              {hasReasoningActivity && !isReasoningOpen && (
                                <div className="absolute -right-0.5 -top-0.5 flex size-3 items-center justify-center rounded-full bg-brand-primary text-white ring-2 ring-background">
                                  <Sparkles className="h-2 w-2" />
                                </div>
                              )}
                            </button>
                          </div>
                        )}
                        <div
                          className={cn(
                            "flex w-full sm:max-w-[85%] flex-col gap-1",
                            isUser ? "items-end text-right" : "items-start text-left"
                          )}
                        >
                          {isAssistant && hasReasoningActivity && isReasoningOpen && (
                            <div className="w-full overflow-hidden border-l-2 border-brand-primary/30 pl-4 ml-1 mb-4 mt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                              <div className="text-sm text-muted-foreground/90 leading-relaxed">
                                <Markdown
                                  content={
                                    reasoningAvailable
                                      ? m.reasoning_content?.trim() ?? ""
                                      : m.streaming
                                        ? "Thinking..."
                                        : "No reasoning shared."
                                  }
                                  className="markdown-body text-sm !text-muted-foreground"
                                />
                              </div>
                            </div>
                          )}
                          {m.attachments && m.attachments.length > 0 && (
                            <div className={cn(attachmentsContainerClass, "w-full mb-2")}>
                              {m.attachments.map((file, fileIndex) => (
                                <div
                                  key={fileIndex}
                                  className={cn(
                                    "flex max-w-full items-center gap-2 rounded-xl border p-2",
                                    isUser
                                      ? "border-brand-primary/20 bg-brand-primary/10 text-foreground self-end dark:border-white/20 dark:bg-white/10 dark:text-white"
                                      : "border-border/40 bg-card/50 text-foreground self-start w-full"
                                  )}
                                >
                                  <FileText
                                    className={cn(
                                      "size-3",
                                      isUser ? "text-brand-primary dark:text-white/80" : "text-muted-foreground"
                                    )}
                                  />
                                  <span className="font-medium">{file.name}</span>
                                  <span className={cn("text-xs", isUser ? "text-muted-foreground dark:text-white/70" : "text-muted-foreground")}>
                                    ({formatFileSize(file.size)}, {formatWordCount(countWords(file.content))})
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className={bubbleClass} style={bubbleStyle}>
                            <Markdown
                              content={bubbleText}
                              className={cn("markdown-body", isUser ? "text-white" : "text-foreground")}
                            />
                          </div>
                          {truncatedByLength && (
                            <div className="w-full text-[11px] text-muted-foreground">
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
            </div>
            {showScrollToLatest && (
              <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={cn(
                    "pointer-events-auto gap-1 rounded-full border border-border/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] shadow-sm backdrop-blur transition dark:border-border/60",
                    hasNewMessages
                      ? "bg-brand-gradient text-white hover:brightness-110"
                      : "bg-white/95 text-foreground hover:bg-white dark:bg-card/30 dark:text-foreground dark:hover:bg-card/40"
                  )}
                  onClick={() => scrollToBottom()}
                >
                  <ArrowDown className="size-4" />
                  <span>{hasNewMessages ? "New reply" : "Scroll to latest"}</span>
                </Button>
              </div>
            )}
            <form
              ref={chatFormRef}
              onSubmit={onSubmit}
              className="shrink-0 border-t border-border/40 bg-white/95 px-4 py-4 shadow-inner dark:bg-card/25"
            >
               <div className="mx-auto w-full space-y-4">
                {uploadedFiles.length > 0 && (
                  <div className="space-y-2">
                    {uploadedFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between rounded-xl border border-border/40 bg-white p-3 text-xs text-muted-foreground dark:border-border/60 dark:bg-card/25"
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="size-3 text-brand-primary" />
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

                {/* Input area with security indicator wrapper */}
                {(() => {
                  const isConnecting = ratlsState.status === "connecting"
                  const isVerified = secureChannelReady
                  const hasFailed = ratlsState.status === "error"
                  const showSecurityState = ratlsState.status !== "disconnected"

                  const tooltipText = isVerified
                    ? "Session secured with hardware protection"
                    : isConnecting
                      ? "Verifying security..."
                      : hasFailed
                        ? "Security check failed"
                        : ""

                  return (
                    <div
                      className={cn(
                        "relative flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-2 shadow-sm transition-all dark:bg-card/30",
                        showSecurityState && isVerified
                          ? "ring-2 ring-emerald-500/40"
                          : showSecurityState && isConnecting
                            ? "ring-2 ring-brand-primary/30"
                            : showSecurityState && hasFailed
                              ? "ring-2 ring-rose-500/40"
                              : "ring-1 ring-border/40 dark:ring-border/60"
                      )}
                      title={tooltipText}
                    >
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
                        disabled={isSending || guestRestrictionActive}
                        placeholder="Type your message..."
                        className="min-h-[44px] flex-1 resize-none border-0 bg-transparent py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                        rows={1}
                      />
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        multiple
                        accept=".txt,.md,.json,.csv,.py,.js,.ts,.tsx,.jsx,.html,.css,.xml,.yaml,.yml,.pdf"
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isSending || guestRestrictionActive}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
                        title="Upload files"
                      >
                        <Paperclip className="h-5 w-5" />
                      </button>
                      <Button
                        type="submit"
                        size="icon"
                        className="h-10 w-10 shrink-0 rounded-xl bg-brand-gradient text-white transition hover:brightness-110 dark:bg-brand-primary"
                        disabled={
                          guestRestrictionActive ||
                          isSending ||
                          (!input.trim() && uploadedFiles.length === 0) ||
                          !providerApiBase ||
                          !secureChannelReady
                        }
                      >
                        <Send className="h-4 w-4" />
                        <span className="sr-only">Send secure message</span>
                      </Button>
                      {/* Security badge overlay */}
                      {showSecurityState && (
                        <div
                          className={cn(
                            "absolute -top-2 -right-2 flex items-center justify-center size-6 rounded-full border-2 border-white dark:border-background shadow-sm",
                            isVerified
                              ? "bg-emerald-500"
                              : isConnecting
                                ? "bg-brand-primary"
                                : hasFailed
                                  ? "bg-rose-500"
                                  : "bg-gray-400"
                          )}
                        >
                          {isVerified ? (
                            <ShieldCheck className="h-3.5 w-3.5 text-white" />
                          ) : isConnecting ? (
                            <Sparkles className="h-3 w-3 text-white animate-pulse" />
                          ) : hasFailed ? (
                            <X className="h-3 w-3 text-white" />
                          ) : (
                            <Circle className="h-3 w-3 text-white" />
                          )}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            </form>
          </div>
        </section>
      </main>
      <Dialog open={sessionDialogOpen} onOpenChange={setSessionDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border border-border/50 bg-background/95 backdrop-blur dark:border-border/60 dark:bg-background/80">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
              <Lock className="h-5 w-5 text-brand-primary" />
              Secure Session
            </DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="session" className="w-full">
            <TabsList className="grid w-full grid-cols-2 gap-2 rounded-full border border-border/40 bg-card/80 p-1 dark:border-border/60 dark:bg-card/20">
              <TabsTrigger
                value="session"
                className="rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.24em] data-[state=active]:bg-[linear-gradient(135deg,#102A8C,#0B1F66)] data-[state=active]:text-white"
              >
                Session Details
              </TabsTrigger>
              <TabsTrigger
                value="proof"
                className="rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.24em] data-[state=active]:bg-[linear-gradient(135deg,#102A8C,#0B1F66)] data-[state=active]:text-white"
              >
                Proof of Confidentiality
              </TabsTrigger>
            </TabsList>
            <TabsContent value="session" className="space-y-4 mt-4">
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{connectionSummary}</p>
                <div className="space-y-3 text-xs">
                  {modelDisplayLabel && (
                    <div className="flex items-center gap-2">
                      <Bot className="size-4 text-brand-primary" />
                      <span className="text-muted-foreground">
                        <span className="font-medium">Model:</span>{" "}
                        <span title={modelDisplayTitle}>{modelDisplayLabel}</span>
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Bot className="size-4 text-brand-primary" />
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
                      <span className="font-medium">Bearer token:</span>{" "}
                      {tokenPresent ? "Loaded in session" : "Not provided (optional)"}
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
                        placeholder="https://tee.example.com"
                        value={providerBaseUrlInput}
                        onChange={(event) => setProviderBaseUrlInput(event.target.value)}
                        className="w-full rounded-xl border border-border/40 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-[#102A8C]/35 dark:border-border/60 dark:bg-card/15"
                      />
                    </label>
                    <label htmlFor="provider-api-key" className="block space-y-1 text-muted-foreground">
                      <span className="font-medium text-foreground">Bearer token (optional)</span>
                      <input
                        id="provider-api-key"
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="token-..."
                        value={providerApiKeyInput}
                        onChange={(event) => setProviderApiKeyInput(event.target.value)}
                        className="w-full rounded-xl border border-border/40 bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-[#102A8C]/35 dark:border-border/60 dark:bg-card/15"
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
            <TabsContent value="proof" className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">
                {providerApiBase
                  ? `Secure connection to ${deriveTargetHost(providerApiBase)}.`
                  : "Configure a provider URL to establish secure connection."}
              </p>
              <RatlsProofContent
                variant="dialog"
                onViewDetails={() => setProofDetailsModalOpen(true)}
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      <RatlsDetailsModal />
      <FeedbackButton source="confidential" position="top-right" />
    </div>
  )
}

export default function ConfidentialAIPage() {
  return (
    <Suspense fallback={
      <div className="flex h-[100dvh] items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Loading confidential space...</p>
        </div>
      </div>
    }>
      <ConfidentialAIContent />
    </Suspense>
  )
}
