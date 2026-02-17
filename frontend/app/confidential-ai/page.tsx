"use client"

import { useState, FormEvent, KeyboardEvent, useMemo, useRef, useEffect, useCallback, Suspense, type CSSProperties } from "react"

import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
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
  LogOut,
  Home,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FeedbackButton } from "@/components/feedback-button"
import { streamConfidentialChat, confidentialChatConfig } from "@/lib/confidential-chat"
import { createAtlasClient, warmupAtlasConnection, getAtlasProxyUrl, deriveTargetHost, getPolicy, parseAppComposeServices, getImageUrl, categorizeAtlsError, GITHUB_REPO_URL, DOCKER_COMPOSE_URL, type AtlasAttestationResult, type AtlasPolicy, type AtlsErrorCategory, type CategorizedAtlsError } from "@/lib/atlas-client"
import { scheduleAtlsAutoConnect } from "@/lib/atls-connect-scheduler"
import { EXAMPLE_THEMES } from "@/lib/example-themes"
import { DEMO_HANDOFF_STORAGE_KEY, canAutoSendDemo, parseDemoHandoffPayload } from "@/lib/demo-handoff"
import {
  LANDING_FILES_STORAGE_KEY,
  LANDING_MESSAGE_STORAGE_KEY,
  parseLandingUploadedFiles,
} from "@/lib/landing-handoff"
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

type DemoFilePayload = {
  name: string
  type: string
  data: string
}

type DemoDocsResponse = {
  files?: DemoFilePayload[]
  error?: string
}

type SendMessageOverride = {
  text?: string
  files?: UploadedFile[]
}

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
  const router = useRouter()
  const [authState, setAuthState] = useState<"loading" | "signed-in" | "signed-out">(supabase ? "loading" : "signed-out")
  const [authUserEmail, setAuthUserEmail] = useState<string | null>(null)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
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
    ? "bg-brand-primary"
    : atlsState.status === "connecting"
      ? "bg-brand-primary/50 animate-pulse"
      : atlsState.status === "error"
        ? "bg-destructive"
        : "bg-muted-foreground/50"
  const secureWorkspaceTextClass = secureChannelReady
    ? "text-brand-primary"
    : atlsState.status === "connecting"
      ? "text-brand-primary/60"
      : atlsState.status === "error"
        ? "text-destructive"
        : "text-muted-foreground"
  const [composerNotice, setComposerNotice] = useState<{ type: "error" | "info"; message: string } | null>(null)
  const [confirmNewConversation, setConfirmNewConversation] = useState(false)
  const [pendingDemoSend, setPendingDemoSend] = useState<SendMessageOverride | null>(null)
  const newConversationTimeoutRef = useRef<number | null>(null)
  const hasPromptedSetupRef = useRef(false)
  const autoConnectInFlightRef = useRef<{ key: string; promise: Promise<void> } | null>(null)
  const lastAutoConnectRef = useRef<{ key: string; atMs: number } | null>(null)
  const sendMessageRef = useRef<(override?: SendMessageOverride) => Promise<void>>(async () => {})

  const sidebarIconButtonClass =
    "h-8 w-8 rounded-full border border-border/50 bg-card/70 text-muted-foreground shadow-sm transition hover:border-brand-primary/50 hover:bg-card hover:text-foreground"
  const sidebarSessionButtonClass =
    "gap-2 border-border/50 bg-card/50 text-foreground shadow-sm transition hover:bg-card/80 hover:text-foreground"
  const proofActionButtonClass =
    "rounded-full border-border/50 bg-card/70 font-semibold text-foreground shadow-sm transition hover:border-brand-primary/45 hover:bg-brand-primary/10 hover:text-foreground"

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
    if (!userMenuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [userMenuOpen])

  const handleSignOut = useCallback(async () => {
    if (!supabase) return
    setUserMenuOpen(false)
    try {
      await supabase.auth.signOut()
      router.replace("/sign-in")
    } catch (error) {
      console.error("Failed to sign out", error)
    }
  }, [supabase, router])

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
      atlasFetchRef.current = null

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

          const attestation = await withTimeout(
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
              } else {
                addAtlsLog("warn", "Attestation verification completed with warnings")
              }
            }),
            CONNECTION_TIMEOUT_MS
          )

          if (attestation.teeType.trim().toUpperCase() === "TEST_MODE") {
            throw new Error(
              "Remote attestation reported TEST_MODE. Simulated attestation is only allowed via NEXT_PUBLIC_ATTESTATION_TEST_MODE in non-production builds."
            )
          }

          // Create the fetch client (will reuse the warmed-up connection)
          const atlasFetch = await createAtlasClient(config)
          atlasFetchRef.current = atlasFetch
          addAtlsLog("success", "Secure channel established")
          setAtlsState({
            status: "connected",
            attestation,
          })

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
            <div className={cn(badgeBase, "border-success/60 bg-success/10 text-success")}>
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
            <div className={cn(badgeBase, "border-destructive/60 bg-destructive/10 text-destructive")}>
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
          return <CheckCircle2 className="h-4 w-4 text-success" />
        case "running":
          return <Sparkles className="h-4 w-4 text-brand-primary animate-pulse" />
        case "error":
          return <X className="h-4 w-4 text-destructive" />
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
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-destructive/40 bg-destructive/10 text-destructive"
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
                "rounded-2xl border border-border/40 bg-card/70 px-3 py-2 text-muted-foreground shadow-sm",
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
              <div className="border-l-2 border-destructive pl-3 text-destructive">
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
                "rounded-2xl border border-border/40 bg-card/60 px-3 py-2 text-muted-foreground",
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
        <div className="rounded-2xl border border-border/40 bg-card/70 p-3 shadow-sm">
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border border-border/50 bg-background/95 backdrop-blur">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
              <ShieldCheck className="h-5 w-5 text-brand-primary" />
              Security Details
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Verification Status - moved to top */}
            <div className="rounded-2xl border border-border/40 bg-card/70 p-3 shadow-sm">
              <div className="flex items-center gap-2">
                {atlsState.attestation.trusted ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <span className="text-sm font-medium text-success">
                      Connection attested and verified
                    </span>
                  </>
                ) : (
                  <>
                    <X className="h-4 w-4 text-destructive" />
                    <span className="text-sm font-medium text-destructive">
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
              <div className="rounded-2xl border border-border/40 bg-card/80 p-3 shadow-sm ">
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
                <div className="rounded-2xl border border-border/40 bg-card/80 p-3 shadow-sm ">
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
                <div className="rounded-2xl border border-border/40 bg-card/80 p-3 shadow-sm ">
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
                    <div className="rounded-lg border border-border/40 bg-zinc-950 overflow-hidden">
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
  const extractTextFromPDF = useCallback(async (file: File): Promise<string> => {
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
      throw new Error(
        `Failed to extract text from PDF: ${error instanceof Error ? error.message : "Unknown PDF parse error"}`
      )
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    let cancelled = false
    const textDecoder = new TextDecoder()

    const decodeBase64 = (value: string) => {
      const normalized = value.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/")
      const binary = window.atob(normalized)
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index)
      }
      return bytes
    }

    const isPdfBytes = (bytes: Uint8Array) =>
      bytes.length >= 5 &&
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46 &&
      bytes[4] === 0x2d

    const isGitLfsPointer = (text: string) =>
      text.startsWith("version https://git-lfs.github.com/spec/v1") && text.includes("\noid sha256:")

    const loadDemoHandoff = async () => {
      const raw = window.sessionStorage.getItem(DEMO_HANDOFF_STORAGE_KEY)
      if (!raw) return
      const payload = parseDemoHandoffPayload(raw)
      if (!payload) {
        window.sessionStorage.removeItem(DEMO_HANDOFF_STORAGE_KEY)
        return
      }

      const example = EXAMPLE_THEMES[payload.exampleId]
      if (!example) return

      if (cancelled) return
      setInput(example.prompt)
      setUploadedFiles([])

      try {
        const response = await fetch(`/api/example-docs/${encodeURIComponent(payload.exampleId)}`)
        if (!response.ok) {
          if (cancelled) return
          setComposerNotice({
            type: "error",
            message: "Demo files could not be loaded. You can still send the demo prompt manually.",
          })
          if (payload.autoSend) {
            setPendingDemoSend({
              text: example.prompt,
              files: [],
            })
          }
          return
        }

        const docs = (await response.json()) as DemoDocsResponse
        const files = Array.isArray(docs.files) ? docs.files : []
        const failedFiles: string[] = []
        const preloadedFiles: UploadedFile[] = []

        for (const filePayload of files) {
          try {
            const bytes = decodeBase64(filePayload.data)
            const fileType = filePayload.type || "application/pdf"
            let content: string
            let normalizedType = fileType

            if (fileType === "application/pdf" && !isPdfBytes(bytes)) {
              const decodedText = textDecoder.decode(bytes)
              if (isGitLfsPointer(decodedText)) {
                failedFiles.push(`${filePayload.name} (missing Git LFS asset)`)
                continue
              }
              normalizedType = "text/plain"
              content = decodedText
            } else {
              const file = new File([bytes], filePayload.name, { type: fileType })
              content =
                fileType === "application/pdf"
                  ? await extractTextFromPDF(file)
                  : await file.text()
            }

            preloadedFiles.push({
              name: filePayload.name,
              type: normalizedType,
              size: bytes.byteLength,
              content,
            })
          } catch {
            failedFiles.push(filePayload.name)
          }
        }

        if (cancelled) return

        setUploadedFiles(preloadedFiles)
        setInput(example.prompt)

        if (failedFiles.length > 0) {
          setComposerNotice({
            type: "error",
            message: `Some demo files could not be processed: ${failedFiles.join(", ")}`,
          })
        } else {
          setComposerNotice(null)
        }

        if (payload.autoSend) {
          setPendingDemoSend({
            text: example.prompt,
            files: preloadedFiles,
          })
        }
      } catch (error) {
        console.error("Failed to load demo files", error)
        if (cancelled) return
        setComposerNotice({
          type: "error",
          message: "Demo files could not be loaded. You can still send the demo prompt manually.",
        })
        if (payload.autoSend) {
          setPendingDemoSend({
            text: example.prompt,
            files: [],
          })
        }
      } finally {
        if (!cancelled) {
          window.sessionStorage.removeItem(DEMO_HANDOFF_STORAGE_KEY)
        }
      }
    }

    void loadDemoHandoff()

    return () => {
      cancelled = true
    }
  }, [extractTextFromPDF])

  useEffect(() => {
    if (typeof window === "undefined") return

    let cancelled = false
    const timer = window.setTimeout(() => {
      if (cancelled) return
      if (window.sessionStorage.getItem(DEMO_HANDOFF_STORAGE_KEY)) return

      const rawMessage = window.sessionStorage.getItem(LANDING_MESSAGE_STORAGE_KEY)
      const rawFiles = window.sessionStorage.getItem(LANDING_FILES_STORAGE_KEY)
      const restoredFiles = parseLandingUploadedFiles(rawFiles)
      const restoredMessage = (rawMessage ?? "").trim()
      const hasMessage = restoredMessage.length > 0
      const hasFiles = restoredFiles.length > 0

      if (!hasMessage && !hasFiles) {
        if (rawMessage !== null || rawFiles !== null) {
          window.sessionStorage.removeItem(LANDING_MESSAGE_STORAGE_KEY)
          window.sessionStorage.removeItem(LANDING_FILES_STORAGE_KEY)
        }
        return
      }

      setInput(restoredMessage)
      setUploadedFiles(restoredFiles)
      setPendingDemoSend({
        text: restoredMessage,
        files: restoredFiles,
      })
      setComposerNotice(null)

      window.sessionStorage.removeItem(LANDING_MESSAGE_STORAGE_KEY)
      window.sessionStorage.removeItem(LANDING_FILES_STORAGE_KEY)
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
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

  const sendMessage = async (override?: SendMessageOverride) => {
    if (isSending) return
    setComposerNotice(null)
    if (!secureChannelReady) {
      setComposerNotice({ type: "info", message: "Wait for secure session verification before sending." })
      return
    }
    const rawText = override?.text ?? input
    const activeFiles = override?.files ?? uploadedFiles
    const text = rawText.trim()
    if (!text && activeFiles.length === 0) return

    if (!providerApiBase) {
      setConfigError("Add a confidential provider base URL before starting a session.")
      setComposerNotice({ type: "error", message: "Session setup is incomplete. Add your provider URL first." })
      setSessionDialogOpen(true)
      return
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
    if (!pendingDemoSend) return

    const readiness = {
      pendingDemoSend: true,
      secureChannelReady,
      providerConfigured: Boolean(providerApiBase),
      guestRestricted: false,
      isSending,
    }

    if (!providerApiBase) {
      setComposerNotice((previous) =>
        previous ?? {
          type: "info",
          message: "Demo is preloaded. Configure session settings to send securely.",
        }
      )
      return
    }

    if (!canAutoSendDemo(readiness)) return

    const nextSend = pendingDemoSend
    setPendingDemoSend(null)
    void sendMessageRef.current(nextSend)
  }, [
    isSending,
    pendingDemoSend,
    providerApiBase,
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
    <div className="flex h-[100dvh] flex-col bg-background text-foreground">
      <main className="flex flex-1 flex-col min-h-0">
        <section className="relative flex h-full w-full flex-1 flex-col md:flex-row" aria-label="Confidential space">
          <aside
            className={cn(
              "flex flex-col border-border/40 bg-card/95 transition-[opacity,transform,width] duration-200 md:border-border/40 md:bg-card/85",
              "fixed inset-y-0 left-0 z-40 h-[100dvh] w-[min(360px,90vw)] overflow-y-auto border-r shadow-elevated md:static md:h-full md:w-auto md:flex-none md:border-b-0 md:border-r md:shadow-none",
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
                        <Settings2 className="h-3.5 w-3.5 text-primary" />
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
                        <Save className="h-3.5 w-3.5 text-primary" />
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
                        <MessageSquarePlus className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs">New</span>
                      </Button>
                    </div>
                  </div>
                </div>

                <Accordion type="single" collapsible>
                  <AccordionItem value="proof" className="border-none">
                    <AccordionTrigger
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-brand-primary/60 bg-brand-gradient px-4 py-3 text-left text-sm font-semibold uppercase tracking-[0.24em] text-white shadow-glow-primary transition hover:brightness-110 data-[state=open]:brightness-110"
                    >
                      <span className="inline-flex items-center gap-2 text-[11px]">
                        <ShieldCheck className="h-4 w-4" />
                        Proof of Confidentiality
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="mt-3 space-y-3 rounded-2xl border border-brand-primary/30 bg-brand-primary/10 p-4 shadow-sm">
                      <AtlsProofContent
                        variant="sidebar"
                        onViewDetails={() => setProofDetailsModalOpen(true)}
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                <div className="mt-auto space-y-3 pt-4">
                  <FeedbackButton source="confidential" position="inline" label="Contact" />
                  <div className="flex items-center justify-center">
                    <Link
                      href="/"
                      className="inline-flex items-center justify-center whitespace-nowrap transition-opacity hover:opacity-80"
                    >
                      <Image src="/logo.png" alt="Confidential AI logo" width={20} height={20} className="shrink-0 dark:invert" />
                    </Link>
                  </div>
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
                  <Image src="/logo.png" alt="Confidential AI logo" width={20} height={20} className="shrink-0 dark:invert" />
                </Link>
              </div>
            )}
          </aside>

          {sidebarOpen ? (
            <button
              type="button"
              aria-label="Close confidential tools"
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 z-30 bg-background/40 backdrop-blur-[2px] transition-opacity md:hidden"
            />
          ) : null}

          {!sidebarOpen ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
              className="fixed left-4 top-[calc(env(safe-area-inset-top,0)+16px)] z-30 rounded-full border border-border/50 bg-card/90 text-muted-foreground shadow-md backdrop-blur transition hover:bg-card md:hidden"
            >
              <PanelLeftOpen className="h-4 w-4" />
              <span className="sr-only">Open confidential tools</span>
            </Button>
          ) : null}

          <div className="flex flex-1 min-h-0 px-3 pb-3 pt-[calc(env(safe-area-inset-top,0)+56px)] sm:px-5 sm:pb-5 sm:pt-3">
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[26px] border border-brand-primary/40 bg-card/90 shadow-elevated">
              <div className="shrink-0 border-b border-border/60 bg-card/80 px-4 py-3 backdrop-blur sm:px-6">
                <div className="mx-auto flex w-full max-w-4xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 rounded-full", secureWorkspaceDotClass)} />
                    <p className={cn("truncate text-sm font-semibold", secureWorkspaceTextClass)} title={secureWorkspaceHint}>
                      {secureWorkspaceLabel}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-brand-primary/30 bg-brand-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-primary">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>Private</span>
                    </div>
                    {authState === "signed-in" && authUserEmail ? (
                      <div className="relative" ref={userMenuRef}>
                        <button
                          type="button"
                          onClick={() => setUserMenuOpen((prev) => !prev)}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-primary/20 text-xs font-semibold text-brand-primary transition hover:bg-brand-primary/30"
                          title={authUserEmail}
                        >
                          {authUserEmail[0].toUpperCase()}
                        </button>
                        {userMenuOpen ? (
                          <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-border/60 bg-card p-1 shadow-lg">
                            <div className="px-3 py-2 text-xs text-muted-foreground truncate">
                              {authUserEmail}
                            </div>
                            <div className="h-px bg-border/60" />
                            <Link
                              href="/"
                              onClick={() => setUserMenuOpen(false)}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
                            >
                              <Home className="h-3.5 w-3.5" />
                              Back to Umbra
                            </Link>
                            <button
                              type="button"
                              onClick={handleSignOut}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
                            >
                              <LogOut className="h-3.5 w-3.5" />
                              Sign out
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
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
                                "flex size-8 items-center justify-center rounded-full border border-border/40 bg-card/80 text-brand-primary transition-all",
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
                                      ? "border-primary/20 bg-primary/10 text-foreground self-end"
                                      : "border-border/40 bg-card/50 text-foreground self-start w-full"
                                  )}
                                >
                                  <FileText
                                    className={cn(
                                      "size-3",
                                      isUser ? "text-primary" : "text-muted-foreground"
                                    )}
                                  />
                                  <span className="font-medium">{file.name}</span>
                                  <span className={cn("text-xs", "text-muted-foreground")}>
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
                    "pointer-events-auto gap-1 rounded-full border border-border/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] shadow-sm backdrop-blur transition",
                    hasNewMessages
                      ? "bg-brand-gradient text-white hover:brightness-110"
                      : "bg-card/95 text-foreground hover:bg-card"
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
              className="shrink-0 border-t border-border/40 bg-card/85 px-4 py-4 backdrop-blur"
            >
              <div className="mx-auto w-full max-w-4xl">
                <div className="rounded-2xl border border-border/40 bg-card/95 shadow-sm">
                  {uploadedFiles.length > 0 && (
                    <div className="space-y-2 border-b border-border/40 px-3 py-3">
                      {uploadedFiles.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between rounded-lg bg-muted/40 px-2 py-2 text-xs text-muted-foreground"
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
                            className="h-6 w-6 rounded-full border border-border/40 p-0 text-foreground hover:bg-muted/50"
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
                            ? "border-destructive/40 bg-destructive/10 text-destructive"
                            : "border-info/40 bg-info/10 text-info"
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
                      disabled={isSending}
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
                      disabled={isSending}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
                      title="Upload files"
                    >
                      <Paperclip className="h-5 w-5" />
                    </button>
                    <Button
                      type="submit"
                      size="icon"
                      className="h-10 w-10 shrink-0 rounded-xl bg-brand-gradient text-white transition hover:brightness-110"
                      disabled={
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border border-border/50 bg-background/95 backdrop-blur">
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
                className="w-full rounded-full border border-border/40 bg-card/70 text-foreground hover:bg-card/80"
                onClick={() => setShowAdvancedSettings((previous) => !previous)}
              >
                {showAdvancedSettings ? "Hide Advanced Settings" : "Show Advanced Settings"}
              </Button>
            </div>
            {showAdvancedSettings && (
              <div className="space-y-3 rounded-2xl border border-border/40 bg-card/80 p-5 text-xs text-muted-foreground ">
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
                    className="w-full rounded-xl border border-border/40 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-brand-primary/35 "
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
                    className="w-full rounded-xl border border-border/40 bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-primary/35 "
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
