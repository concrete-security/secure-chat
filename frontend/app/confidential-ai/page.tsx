"use client"

import { useState, FormEvent, KeyboardEvent, useMemo, useRef, useEffect, useCallback, Suspense, type CSSProperties } from "react"

import Link from "next/link"
import Image from "next/image"
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
  Circle,
  UserCircle2,
  ExternalLink,
  Terminal,
  Settings2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FeedbackButton } from "@/components/feedback-button"
import { streamConfidentialChat, confidentialChatConfig } from "@/lib/confidential-chat"
import { createAtlasClient, warmupAtlasConnection, getAtlasProxyUrl, deriveTargetHost, getPolicy, parseAppComposeServices, getImageUrl, categorizeAtlsError, GITHUB_REPO_URL, DOCKER_COMPOSE_URL, type AtlasAttestationResult, type AtlasPolicy, type AtlsErrorCategory, type CategorizedAtlsError } from "@/lib/atlas-client"
import { scheduleAtlsAutoConnect } from "@/lib/atls-connect-scheduler"
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

type AtlsConnectionState =
  | { status: "disconnected" }
  | { status: "connecting"; attempt?: number; maxAttempts?: number }
  | { status: "connected"; attestation: AtlasAttestationResult }
  | { status: "error"; error: string; category?: AtlsErrorCategory; hint?: string }

type AtlsLogEntry = {
  timestamp: Date
  level: "info" | "success" | "warn" | "error"
  message: string
}

const PROVIDER_SETTINGS_STORAGE_KEY = "confidential-provider-settings-v1"
const GUEST_USAGE_STORAGE_KEY = "confidential-chat-guest-used"
const GUEST_ACTIVE_SESSION_KEY = "confidential-chat-guest-active"
const LANDING_PROMPT_HANDOFF_KEY = "confidential-chat-landing-prompt"
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
  const atlsProxyUrl = getAtlasProxyUrl()

  const [providerBaseUrlInput, setProviderBaseUrlInput] = useState(() => envProviderApiBase ?? "")
  const [providerApiKeyInput, setProviderApiKeyInput] = useState("")
  const [configError, setConfigError] = useState<string | null>(null)
  const [providerSettingsRestored, setProviderSettingsRestored] = useState(false)
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
  const [atlsState, setAtlsState] = useState<AtlsConnectionState>({ status: "disconnected" })
  const atlasFetchRef = useRef<typeof fetch | null>(null)
  const [proofDetailsModalOpen, setProofDetailsModalOpen] = useState(false)
  const [atlsLogs, setAtlsLogs] = useState<AtlsLogEntry[]>([])
  const lastAtlsLogRef = useRef<{ level: AtlsLogEntry["level"]; message: string; atMs: number } | null>(null)

  const addAtlsLog = useCallback((level: AtlsLogEntry["level"], message: string) => {
    const now = Date.now()
    const last = lastAtlsLogRef.current
    if (last && last.level === level && last.message === message && now - last.atMs < 1500) {
      return
    }
    lastAtlsLogRef.current = { level, message, atMs: now }
    const entry: AtlsLogEntry = { timestamp: new Date(), level, message }
    setAtlsLogs(prev => [...prev, entry])
    // Also log to console
    const consoleMethod = level === "error" ? console.error : level === "warn" ? console.warn : console.log
    consoleMethod(`[aTLS] ${message}`)
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
  const guestRestrictionActive = guestLimitsEnabled && authState === "signed-out" && guestUsageRestricted

  const [messages, setMessages] = useState<Message[]>(() => [
    {
      role: "assistant",
      content: buildGreeting(providerModel, assistantName, providerHost),
    },
  ])

  const secureChannelReady = atlsState.status === "connected" && atlsState.attestation.trusted
  const secureWorkspaceLabel = secureChannelReady
    ? "Verified end-to-end encrypted workspace"
    : atlsState.status === "connecting"
      ? "Verifying encrypted workspace"
      : atlsState.status === "error"
        ? "Secure workspace unavailable"
        : "Secure workspace pending"
  const secureWorkspaceHint = secureChannelReady
    ? "Messages and attachments are sent only through attested infrastructure."
    : atlsState.status === "connecting"
      ? "Checking enclave identity and policy before enabling secure messaging."
      : atlsState.status === "error"
        ? "Verification failed. Reconnect from Proof of Confidentiality."
        : "Configure provider and complete attestation to enable secure messaging."
  const secureWorkspaceDotClass = secureChannelReady
    ? "bg-emerald-500"
    : atlsState.status === "connecting"
      ? "bg-sky-500 animate-pulse"
      : atlsState.status === "error"
        ? "bg-rose-500"
        : "bg-slate-400"
  const secureWorkspaceTextClass = secureChannelReady
    ? "text-emerald-700 dark:text-emerald-300"
    : atlsState.status === "connecting"
      ? "text-sky-700 dark:text-sky-300"
      : atlsState.status === "error"
        ? "text-rose-700 dark:text-rose-300"
        : "text-slate-700 dark:text-slate-300"
  const [composerNotice, setComposerNotice] = useState<{ type: "error" | "info"; message: string } | null>(null)
  const [confirmNewConversation, setConfirmNewConversation] = useState(false)
  const [pendingLandingPrompt, setPendingLandingPrompt] = useState<string | null>(null)
  const newConversationTimeoutRef = useRef<number | null>(null)
  const hasPromptedSetupRef = useRef(false)
  const autoConnectInFlightRef = useRef<{ key: string; promise: Promise<void> } | null>(null)
  const lastAutoConnectRef = useRef<{ key: string; atMs: number } | null>(null)
  const sendMessageRef = useRef<(overrideText?: string) => Promise<void>>(async () => {})

  const sidebarIconButtonClass =
    "h-8 w-8 rounded-full border border-border/50 bg-white/70 text-muted-foreground shadow-sm transition hover:border-brand-primary/35 hover:bg-white hover:text-foreground dark:border-white/15 dark:bg-[#101D3A] dark:text-slate-100 dark:hover:border-brand-primary/60 dark:hover:bg-[#162B57] dark:hover:text-white"
  const sidebarSessionButtonClass =
    "gap-2 border-border/50 bg-card/50 text-foreground shadow-sm transition hover:bg-card/80 hover:text-foreground dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100 dark:hover:bg-white/[0.1] dark:hover:text-white"
  const proofActionButtonClass =
    "rounded-full border-border/50 bg-card/70 font-semibold text-foreground shadow-sm transition hover:border-brand-primary/45 hover:bg-brand-primary/10 hover:text-foreground dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100 dark:hover:border-brand-primary/55 dark:hover:bg-brand-primary/20 dark:hover:text-white"

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
    if (typeof window === "undefined") return

    try {
      const fromSession = window.sessionStorage.getItem(LANDING_PROMPT_HANDOFF_KEY)
      if (fromSession !== null) {
        window.sessionStorage.removeItem(LANDING_PROMPT_HANDOFF_KEY)
      }

      const fromQuery = new URLSearchParams(window.location.search).get("prompt")
      const candidate = (fromSession ?? fromQuery ?? "").trim()
      if (candidate.length > 0) {
        setPendingLandingPrompt(candidate)
      }
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Failed to resolve landing prompt handoff", error)
      }
    }
  }, [])

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
    } catch (error) {
      console.warn("Failed to restore provider settings", error)
    } finally {
      setProviderSettingsRestored(true)
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
    if (configError && configError.includes("base URL") && providerApiBase) {
      setConfigError(null)
    }
  }, [configError, providerApiBase])

  useEffect(() => {
    if (!providerSettingsRestored || hasPromptedSetupRef.current) return
    if (!providerApiBase) {
      setSessionDialogOpen(true)
    }
    hasPromptedSetupRef.current = true
  }, [providerApiBase, providerSettingsRestored])

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

  const [isSending, setIsSending] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const reasoningEffort: "low" | "medium" | "high" = "medium"
  const fileInputRef = useRef<HTMLInputElement>(null)
  const chatFormRef = useRef<HTMLFormElement | null>(null)

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

  const [cacheSalt, setCacheSalt] = useState<string | null>(null)

  useEffect(() => {
    const CACHE_SALT_KEY = "confidential-ai-cache-salt"
    let salt = localStorage.getItem(CACHE_SALT_KEY)
    if (!salt) {
      salt = generateUUID()
      localStorage.setItem(CACHE_SALT_KEY, salt)
    }
    setCacheSalt(salt)
  }, [])
  const isStreaming = useMemo(() => messages.some((message) => message.streaming), [messages])
  const hasConversationHistory = useMemo(
    () => messages.some((message) => message.role === "user") || messages.length > 1,
    [messages]
  )
  const showScrollToLatest = !isPinnedToBottom || hasNewMessages

  const connectAtls = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    const connectionKey = `${providerApiBase ?? ""}|${atlsProxyUrl ?? ""}`
    const now = Date.now()

    if (!force) {
      if (autoConnectInFlightRef.current?.key === connectionKey) {
        await autoConnectInFlightRef.current.promise
        return
      }

      if (
        lastAutoConnectRef.current &&
        lastAutoConnectRef.current.key === connectionKey &&
        now - lastAutoConnectRef.current.atMs < 2000
      ) {
        return
      }
    }

    const runPromise = (async () => {
      // Connection settings
      const MAX_ATTEMPTS = 3
      const CONNECTION_TIMEOUT_MS = 30000 // 30 seconds per attempt
      const RETRY_DELAYS = [1000, 2000, 4000] // Exponential backoff delays

      // Categories that are worth retrying (transient failures)
      const RETRYABLE_CATEGORIES: AtlsErrorCategory[] = ["proxy_connection", "timeout", "handshake"]

      // Clear previous logs on new connection attempt
      lastAtlsLogRef.current = null
      setAtlsLogs([])

      if (!providerApiBase) {
        addAtlsLog("info", "Waiting for provider configuration...")
        setAtlsState({ status: "disconnected" })
        return
      }

      // Test mode: auto-verify attestation for E2E testing (only in non-production builds).
      // Always prefer the deterministic test-mode path when enabled.
      if (ATTESTATION_TEST_MODE) {
        addAtlsLog("info", "Test mode: simulating attestation...")
        setAtlsState({ status: "connecting" })
        await new Promise(resolve => setTimeout(resolve, 500))
        addAtlsLog("success", "Test mode: attestation auto-verified")
        // Use regular fetch in test mode so chat messages can be sent
        atlasFetchRef.current = fetch
        setAtlsState({
          status: "connected",
          attestation: {
            trusted: true,
            teeType: "TEST_MODE",
            tcbStatus: "UpToDate",
          },
        })
        return
      }

      if (!atlsProxyUrl) {
        addAtlsLog("error", "No proxy URL configured")
        setAtlsState({ status: "error", error: "aTLS proxy URL not configured" })
        return
      }

      const targetHost = deriveTargetHost(providerApiBase)
      const policy = getPolicy()
      const config = { proxyUrl: atlsProxyUrl, targetHost, policy }

      // Helper to wrap a promise with a timeout
      const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> => {
        return Promise.race([
          promise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Connection timed out after ${ms / 1000}s`)), ms)
          ),
        ])
      }

      // Attempt connection with retries
      let lastError: CategorizedAtlsError | null = null

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const isRetry = attempt > 1

        if (isRetry) {
          const delay = RETRY_DELAYS[attempt - 2] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1]
          addAtlsLog("info", `Retrying connection in ${delay / 1000}s... (attempt ${attempt}/${MAX_ATTEMPTS})`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }

        addAtlsLog("info", `Initiating connection to ${targetHost}${isRetry ? ` (attempt ${attempt}/${MAX_ATTEMPTS})` : ""}`)
        setAtlsState({ status: "connecting", attempt, maxAttempts: MAX_ATTEMPTS })

        try {
          if (!isRetry) {
            addAtlsLog("info", "Loading WASM attestation module...")
            addAtlsLog("info", "Verifying WASM integrity (SHA-384)...")
          }

          addAtlsLog("info", `Connecting to proxy at ${atlsProxyUrl}`)
          addAtlsLog("info", "Establishing TLS connection...")
          addAtlsLog("info", "Performing TLS handshake with TEE server...")

          await withTimeout(
            warmupAtlasConnection(config, (att) => {
              addAtlsLog("info", "Received attestation quote from server")
              addAtlsLog("info", `TEE Type: ${att.teeType.toUpperCase()}`)
              addAtlsLog("info", "Verifying Intel TDX quote with DCAP...")
              addAtlsLog("info", `TCB Status: ${att.tcbStatus}`)

              if (policy.expected_bootchain?.mrtd) {
                addAtlsLog("info", "Verifying MRTD measurement...")
              }
              if (policy.expected_bootchain?.rtmr0) {
                addAtlsLog("info", "Verifying RTMR0 (firmware)...")
              }
              if (policy.expected_bootchain?.rtmr1) {
                addAtlsLog("info", "Verifying RTMR1 (OS)...")
              }
              if (policy.expected_bootchain?.rtmr2) {
                addAtlsLog("info", "Verifying RTMR2 (application)...")
              }
              if (policy.os_image_hash) {
                addAtlsLog("info", "Verifying OS image hash...")
              }
              if (policy.app_compose?.docker_compose_file) {
                addAtlsLog("info", "Verifying container image digests...")
              }

              if (att.trusted) {
                addAtlsLog("success", "All attestation checks passed")
                addAtlsLog("success", "Secure channel established")
              } else {
                addAtlsLog("warn", "Attestation verification completed with warnings")
              }

              setAtlsState({
                status: "connected",
                attestation: att,
              })
            }),
            CONNECTION_TIMEOUT_MS
          )

          // Create the fetch client (will reuse the warmed-up connection)
          const atlasFetch = await createAtlasClient(config)
          atlasFetchRef.current = atlasFetch

          // Success - exit the retry loop
          return

        } catch (error) {
          // Categorize error for user-friendly display
          const categorized = categorizeAtlsError(error)
          lastError = categorized

          // Log the error
          const logMessage = process.env.NODE_ENV === "production"
            ? `Connection failed: ${categorized.message}`
            : `Connection failed: ${categorized.message} - ${categorized.details ?? ""}`
          addAtlsLog("error", logMessage)

          // Check if we should retry
          const isRetryable = RETRYABLE_CATEGORIES.includes(categorized.category)
          const hasMoreAttempts = attempt < MAX_ATTEMPTS

          if (isRetryable && hasMoreAttempts) {
            // Will retry in next iteration
            continue
          }

          // Non-retryable error or out of attempts - fail immediately
          break
        }
      }

      // All attempts failed - set final error state
      if (lastError) {
        setAtlsState({
          status: "error",
          error: lastError.message,
          category: lastError.category,
          hint: lastError.hint,
        })
      }
    })()

    if (!force) {
      autoConnectInFlightRef.current = { key: connectionKey, promise: runPromise }
    }

    try {
      await runPromise
    } finally {
      if (!force) {
        lastAutoConnectRef.current = { key: connectionKey, atMs: Date.now() }
        if (autoConnectInFlightRef.current?.promise === runPromise) {
          autoConnectInFlightRef.current = null
        }
      }
    }
  }, [atlsProxyUrl, providerApiBase, addAtlsLog])

  useEffect(() => {
    return scheduleAtlsAutoConnect(() => {
      void connectAtls()
    })
  }, [connectAtls])

  const AtlsProofContent = ({
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
      switch (atlsState.status) {
        case "connected":
          return (
            <div className={cn(badgeBase, "border-[#1BAF9F]/60 bg-[#1BAF9F]/10 text-[#037C6A]")}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Connected
            </div>
          )
        case "connecting":
          return (
            <div className={cn(badgeBase, "border-brand-primary/40 bg-brand-primary/10 text-brand-primary")}>
              <Sparkles className="h-3.5 w-3.5" /> Connecting{atlsState.attempt && atlsState.attempt > 1 ? ` (${atlsState.attempt}/${atlsState.maxAttempts})` : ""}
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
      atlsState.status === "connecting"
        ? "running"
        : atlsState.status === "connected"
          ? "ok"
          : atlsState.status === "error"
            ? "error"
            : "pending"
    const attestationState: ChecklistState =
      atlsState.status === "connecting"
        ? "running"
        : atlsState.status === "connected" && atlsState.attestation.trusted
          ? "ok"
          : atlsState.status === "error"
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
        description: atlsState.status === "connected"
          ? `${atlsState.attestation.teeType} - ${atlsState.attestation.tcbStatus}`
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
      switch (atlsState.status) {
        case "connected": {
          const isVerified = atlsState.attestation.trusted
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
              Verifying server security...{atlsState.attempt && atlsState.attempt > 1 ? ` (attempt ${atlsState.attempt}/${atlsState.maxAttempts})` : ""}
            </div>
          )
        case "error":
          return (
            <div className={cn("space-y-2", isCompact ? "text-xs" : "text-sm")}>
              <div className="border-l-2 border-rose-400 pl-3 text-rose-700 dark:text-rose-300">
                <div className="font-medium">{atlsState.error}</div>
                {atlsState.hint && (
                  <div className="mt-1 text-muted-foreground text-[11px]">
                    {atlsState.hint}
                  </div>
                )}
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
            variant="outline"
            size={isCompact ? "sm" : "default"}
            onClick={() => void connectAtls({ force: true })}
            disabled={atlsState.status === "connecting" || !providerApiBase}
            className={cn(
              proofActionButtonClass,
              isCompact ? "text-xs" : "text-sm"
            )}
          >
            {atlsState.status === "connecting" ? "Connecting..." : "Reconnect"}
          </Button>
          {onViewDetails && atlsState.status === "connected" && (
            <Button
              type="button"
              variant="outline"
              size={isCompact ? "sm" : "default"}
              onClick={onViewDetails}
              className={cn(
                proofActionButtonClass,
                isCompact ? "text-xs" : "text-sm"
              )}
            >
              View Details
            </Button>
          )}
        </div>
      </div>
    )
  }

  const AtlsDetailsModal = () => {
    if (atlsState.status !== "connected") return null

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
                {atlsState.attestation.trusted ? (
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
                      {atlsState.attestation.teeType}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">TCB Status</dt>
                    <dd className="font-mono text-foreground/80">
                      {atlsState.attestation.tcbStatus}
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
            {atlsLogs.length > 0 && (
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="logs" className="border-none">
                  <AccordionTrigger className="py-2 hover:no-underline">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Terminal className="h-4 w-4" />
                      Attestation Log
                      <span className="text-xs font-normal text-muted-foreground">
                        ({atlsLogs.length} entries)
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="rounded-lg border border-border/40 bg-zinc-950 dark:bg-zinc-900 overflow-hidden">
                      <div className="max-h-[200px] overflow-y-auto p-3 font-mono text-xs">
                        {atlsLogs.map((log, index) => (
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

    setComposerNotice(null)

    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      // Check file size (limit to 100MB for all files)
      const maxSize = 100 * 1024 * 1024
      if (file.size > maxSize) {
        setComposerNotice({
          type: "error",
          message: `File "${file.name}" is too large. Maximum size is 100MB.`,
        })
        continue
      }

      try {
        let content: string

        if (file.type === "application/pdf") {
          content = await extractTextFromPDF(file)
        } else {
          content = await file.text()
        }

        const uploadedFile: UploadedFile = {
          name: file.name,
          content,
          size: file.size,
          type: file.type || "text/plain",
        }

        setUploadedFiles((prev) => [...prev, uploadedFile])
      } catch (error) {
        console.error("Error reading file:", error)
        setComposerNotice({
          type: "error",
          message: `Failed to read file "${file.name}": ${error instanceof Error ? error.message : "Unknown error"}`,
        })
      }
    }

    // Reset the input
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index))
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
    if (hasConversationHistory && !confirmNewConversation) {
      setConfirmNewConversation(true)
      setComposerNotice({ type: "info", message: "Press New again within 5 seconds to clear this transcript." })
      if (newConversationTimeoutRef.current !== null) {
        window.clearTimeout(newConversationTimeoutRef.current)
      }
      newConversationTimeoutRef.current = window.setTimeout(() => {
        setConfirmNewConversation(false)
      }, 5000)
      return
    }

    if (newConversationTimeoutRef.current !== null) {
      window.clearTimeout(newConversationTimeoutRef.current)
      newConversationTimeoutRef.current = null
    }
    setConfirmNewConversation(false)
    setComposerNotice(null)

    const greeting = buildGreeting(providerModel, assistantName, providerHost)
    setMessages([{ role: "assistant", content: greeting }])
    setReasoningOpen({})
    setInput("")
    setUploadedFiles([])
    setIsSending(false)
    scrollToBottom("auto")
  }, [assistantName, confirmNewConversation, hasConversationHistory, providerHost, providerModel, scrollToBottom])

  const handleSaveConversation = useCallback(() => {
    if (messages.length === 0 || typeof window === "undefined") return

    const exportedAt = new Date().toISOString()
    const exportPayload = {
      exportedAt,
      assistant: assistantName,
      attachmentContentsIncluded: false,
      provider: {
        model: providerModel ?? null,
        baseUrl: providerApiBase ?? null,
        host: providerHost ?? null,
      },
      messages: messages.map(({ role, content, attachments, reasoning_content, finishReason }) => ({
        role,
        content,
        attachments:
          attachments?.map(({ name, type, size }) => ({
            name,
            type,
            size,
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

  useEffect(() => {
    return () => {
      if (newConversationTimeoutRef.current !== null) {
        window.clearTimeout(newConversationTimeoutRef.current)
      }
    }
  }, [])

  const sendMessage = async (overrideText?: string) => {
    if (isSending) return
    setComposerNotice(null)
    if (!secureChannelReady) {
      setComposerNotice({ type: "info", message: "Wait for secure session verification before sending." })
      return
    }
    if (guestRestrictionActive) {
      setGuestNotice("You've already used your guest confidential session. Sign in to continue.")
      return
    }
    const rawText = overrideText ?? input
    const activeFiles = overrideText !== undefined ? [] : uploadedFiles
    const text = rawText.trim()
    if (!text && activeFiles.length === 0) return

    if (!providerApiBase) {
      setConfigError("Add a confidential provider base URL before starting a session.")
      setComposerNotice({ type: "error", message: "Session setup is incomplete. Add your provider URL first." })
      setSessionDialogOpen(true)
      return
    }

    if (!providerModel) {
      setConfigError("Set NEXT_PUBLIC_VLLM_MODEL in your environment before starting a session.")
      setComposerNotice({ type: "error", message: "Model configuration is missing for this environment." })
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

    setMessages(conversationWithAssistant)
    setReasoningOpen((prev) => ({ ...prev, [assistantIndex]: false }))
    setInput("")
    setUploadedFiles([])
    setIsSending(true)
    setConfirmNewConversation(false)

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
      if (!atlasFetchRef.current) {
        throw new Error("aTLS connection not established. Cannot connect to model securely.")
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
          fetchImpl: atlasFetchRef.current,
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
    }
  }

  sendMessageRef.current = sendMessage

  useEffect(() => {
    if (!pendingLandingPrompt) return
    if (!secureChannelReady || !providerApiBase || !providerModel || isSending || guestRestrictionActive) return

    const prompt = pendingLandingPrompt
    setPendingLandingPrompt(null)
    void sendMessageRef.current(prompt)
  }, [
    guestRestrictionActive,
    isSending,
    pendingLandingPrompt,
    providerApiBase,
    providerModel,
    secureChannelReady,
  ])

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
    <div className="flex h-[100dvh] flex-col bg-[#E8E7F0] text-foreground dark:bg-[#050C1B]">
      <main className="flex flex-1 flex-col min-h-0">
        <section className="relative flex h-full w-full flex-1 flex-col md:flex-row" aria-label="Confidential space">
          <aside
            className={cn(
              "flex flex-col border-border/40 bg-white/95 transition-[opacity,transform,width] duration-200 dark:border-white/10 dark:bg-[#0C1832]/95 md:border-border/40 md:bg-white/85 md:dark:bg-[#0C1832]/84",
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setSidebarOpen(false)}
                        className={sidebarIconButtonClass}
                      >
                        <PanelLeftClose className="h-4 w-4" />
                        <span className="sr-only">Collapse panel</span>
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/50 bg-card/40 p-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <UserCircle2 className="h-3.5 w-3.5 text-brand-accent" />
                      <span className="truncate max-w-[180px]">
                        {authState === "signed-in" ? authUserEmail : "Guest User"}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">Session</h3>
                    <div className="grid grid-cols-3 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={sidebarSessionButtonClass}
                        onClick={() => setSessionDialogOpen(true)}
                        title="Settings"
                      >
                        <Settings2 className="h-3.5 w-3.5 text-brand-primary dark:text-sky-300" />
                        <span className="text-xs">Settings</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={sidebarSessionButtonClass}
                        onClick={handleSaveConversation}
                        disabled={!hasConversationHistory}
                        title="Download JSON"
                      >
                        <Save className="h-3.5 w-3.5 text-brand-primary dark:text-sky-300" />
                        <span className="text-xs">Save</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={sidebarSessionButtonClass}
                        onClick={handleStartNewConversation}
                        disabled={isSending || isStreaming}
                      >
                        <MessageSquarePlus className="h-3.5 w-3.5 text-brand-primary dark:text-sky-300" />
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
                      <AtlsProofContent
                        variant="sidebar"
                        onViewDetails={() => setProofDetailsModalOpen(true)}
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

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
              <div className="flex h-full flex-col items-center justify-between py-3">
                <div className="flex flex-col items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setSidebarOpen(true)}
                    className={sidebarIconButtonClass}
                  >
                    <PanelLeftOpen className="h-4 w-4" />
                    <span className="sr-only">Expand panel</span>
                  </Button>
                </div>
                <div className="flex flex-col items-center gap-3 text-muted-foreground dark:text-slate-300">
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
              className="fixed left-4 top-[calc(env(safe-area-inset-top,0)+16px)] z-30 rounded-full border border-border/50 bg-white/90 text-muted-foreground shadow-md backdrop-blur transition hover:bg-white md:hidden dark:border-white/15 dark:bg-[#0F1A37]/92 dark:text-slate-100 dark:hover:bg-[#13254E]"
            >
              <PanelLeftOpen className="h-4 w-4" />
              <span className="sr-only">Open confidential tools</span>
            </Button>
          ) : null}

          <div className="flex flex-1 min-h-0 px-3 pb-3 pt-2 sm:px-5 sm:pb-5 sm:pt-3">
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[26px] border border-brand-primary/25 bg-[linear-gradient(155deg,hsl(var(--brand-primary)/0.08),hsl(var(--brand-secondary)/0.14))] shadow-[0_24px_60px_-36px_rgba(8,7,11,0.8)] dark:border-[#365082]/45 dark:bg-[linear-gradient(158deg,rgba(10,22,47,0.94),rgba(7,16,35,0.95))]">
              <div className="pointer-events-none absolute left-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full border border-brand-primary/35 bg-white/92 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-primary shadow-[0_12px_30px_-18px_rgba(27,9,134,0.8)] backdrop-blur dark:border-sky-300/35 dark:bg-[#102144]/85 dark:text-sky-100">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Private</span>
              </div>
              <div className="shrink-0 border-b border-brand-primary/20 bg-white/80 px-4 py-3 backdrop-blur dark:border-[#2E4674]/70 dark:bg-[#0E1935]/84 sm:px-6">
                <div className="mx-auto flex w-full max-w-4xl items-center gap-2 pl-[84px] sm:pl-[90px]">
                  <span className={cn("h-2.5 w-2.5 rounded-full", secureWorkspaceDotClass)} />
                  <p className={cn("text-sm font-semibold", secureWorkspaceTextClass)} title={secureWorkspaceHint}>
                    {secureWorkspaceLabel}
                  </p>
                </div>
              </div>
              <div
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto px-4 py-6 sm:px-8"
                role="log"
                aria-live="polite"
                aria-label="Confidential space transcript"
              >
              <div className="mx-auto flex w-full max-w-4xl flex-col space-y-8">
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

                  const bubbleClass = isUser
                    ? "w-fit sm:max-w-[85%] md:max-w-3xl self-end whitespace-pre-wrap break-words rounded-3xl bg-brand-gradient px-6 py-4 text-left text-white shadow-md dark:shadow-none"
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
                              variant={isUser ? "inverted" : "default"}
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
              <div className="pointer-events-none absolute inset-x-0 bottom-24 flex justify-center sm:bottom-20">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={cn(
                    "pointer-events-auto gap-1 rounded-full border border-border/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] shadow-sm backdrop-blur transition dark:border-border/60",
                    hasNewMessages
                      ? "bg-brand-gradient text-white hover:brightness-110"
                      : "bg-white/95 text-foreground hover:bg-white dark:bg-[#13213E]/90 dark:text-slate-100 dark:hover:bg-[#172A50]"
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
              className="shrink-0 border-t border-brand-primary/20 bg-white/85 px-4 py-4 shadow-inner backdrop-blur dark:border-[#2E4674]/70 dark:bg-[#0C1630]/92"
            >
              <div className="mx-auto w-full max-w-4xl">
                <div className="rounded-2xl border border-brand-primary/25 bg-white/95 shadow-sm dark:border-[#335188]/60 dark:bg-[#132447]/88">
                  {uploadedFiles.length > 0 && (
                    <div className="space-y-2 border-b border-border/40 px-3 py-3 dark:border-border/60">
                      {uploadedFiles.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between rounded-lg bg-card/40 px-2 py-2 text-xs text-muted-foreground dark:bg-[#0E1D3D]/72"
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
                            className="h-6 w-6 rounded-full border border-border/40 p-0 text-foreground hover:bg-card/80 dark:border-white/20 dark:text-slate-100 dark:hover:bg-white/[0.08]"
                          >
                            <X className="size-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {composerNotice && (
                    <div className="px-3 pt-3">
                      <div
                        className={cn(
                          "rounded-xl border px-3 py-2 text-xs",
                          composerNotice.type === "error"
                            ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/50 dark:bg-rose-500/10 dark:text-rose-200"
                            : "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/50 dark:bg-sky-500/10 dark:text-sky-200"
                        )}
                      >
                        {composerNotice.message}
                      </div>
                    </div>
                  )}

                  <div className="relative flex w-full items-center gap-3 px-3 py-2">
                    <label htmlFor="secure-input" className="sr-only">
                      Secure message input
                    </label>
                    <textarea
                      id="secure-input"
                      value={input}
                      onChange={(e) => {
                        setInput(e.target.value)
                        if (composerNotice) setComposerNotice(null)
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
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted/50 hover:text-foreground disabled:opacity-50 dark:text-slate-200 dark:hover:bg-white/[0.08] dark:hover:text-white"
                      title="Upload files"
                    >
                      <Paperclip className="h-5 w-5" />
                    </button>
                    <Button
                      type="submit"
                      size="icon"
                      className="h-10 w-10 shrink-0 rounded-xl bg-brand-gradient text-white transition hover:brightness-110 dark:bg-[linear-gradient(135deg,rgba(31,74,201,0.95),rgba(18,49,146,0.95))]"
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
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
        </section>
      </main>
      <Dialog open={sessionDialogOpen} onOpenChange={setSessionDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border border-border/50 bg-background/95 backdrop-blur dark:border-border/60 dark:bg-background/80">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
              <Lock className="h-5 w-5 text-brand-primary" />
              Session Settings
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
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
                  Base URL is stored locally for convenience. Bearer token stays in memory only and is cleared on refresh.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <AtlsDetailsModal />
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
