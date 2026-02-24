"use client"

import { createContext, FormEvent, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { isPlaywrightAuthBypassEnabled } from "@/lib/auth"
import { buildAtlasVerifiedResult, buildLocalDevResult } from "@/lib/atlas-attestation"
import { type CvmManifest, type OwnerStatus, type VaultStatus } from "@/lib/cvm/types"
import { createCvmTransport, type CvmTransport } from "@/lib/cvm/transport"
import { authenticateOwnerWithPasskey, fetchOwnerStatus } from "@/lib/cvm/owner"
import { fetchVaultStatus, lockVault } from "@/lib/cvm/vault"
import { streamOpenClawResponses } from "@/lib/openclaw-chat"
import { enrollPasskey, fetchPasskeyStatus, resetPasskeys, type PasskeyStatus } from "@/lib/passkeys"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import { isAuthSessionMissingError } from "@/lib/supabase/errors"
import { AVAILABLE_MODELS } from "@/lib/workspace-types"
import type { Message, ProofState, SecurityStatus } from "@/lib/workspace-types"
import {
  fetchManifest,
  formatLocalDevTransportError,
  getErrorMessage,
  normalizeBaseUrl,
} from "@/lib/workspace-utils"

type WorkspaceContextValue = {
  // Auth
  authEmail: string | null

  // Manifest
  manifest: CvmManifest | null
  manifestError: string | null
  manifestLoading: boolean
  loadManifest: () => Promise<void>

  // Attestation
  proofState: ProofState
  verifyProof: () => Promise<void>
  connectionMode: CvmManifest["connectionPolicy"]["mode"] | null
  transportError: string | null

  // Vault & Owner
  vaultStatus: VaultStatus | null
  ownerStatus: OwnerStatus | null
  vaultFingerprint: string | null
  vaultError: string | null
  vaultSessionId: string | null
  ownerAuthBusy: boolean
  ownerAuthError: string | null
  handleOwnerAuth: () => Promise<void>
  handleVaultLock: () => Promise<void>

  // Passkeys
  passkeyStatus: PasskeyStatus | null
  passkeyLoading: boolean
  passkeyError: string | null
  passkeyNotice: string | null
  passkeyEnrollBusy: boolean
  passkeyResetBusy: boolean
  passkeysSatisfied: boolean
  passkeyEnrollmentRequired: boolean
  handleEnrollPasskey: () => Promise<void>
  handleResetPasskeys: () => Promise<void>
  loadPasskeyStatus: () => Promise<void>

  // Chat
  messages: Message[]
  input: string
  setInput: (value: string) => void
  isSending: boolean
  runtimeError: string | null
  secureChannelReady: boolean
  selectedModel: string
  setSelectedModel: (value: string) => void
  sendMessage: (event: FormEvent<HTMLFormElement>) => Promise<void>

  // Derived
  securityStatus: SecurityStatus

  // Navigation
  handleSignOut: () => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)
const PLAYWRIGHT_BYPASS_SESSION_ID = "00000000000000000000000000000000"
const PLAYWRIGHT_BYPASS_PASSKEY_STATUS: PasskeyStatus = {
  minRequired: 1,
  count: 1,
  passkeys: [
    {
      id: "playwright-passkey",
      credentialIdB64Url: "playwright-credential",
      createdAt: "1970-01-01T00:00:00.000Z",
    },
  ],
}

function manifestTransportKey(manifest: CvmManifest): string {
  return JSON.stringify({
    baseUrl: manifest.baseUrl,
    mode: manifest.connectionPolicy.mode,
    atlasProxyUrl: manifest.connectionPolicy.atlasProxyUrl,
    atlasPolicy: manifest.connectionPolicy.atlasPolicy,
  })
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider")
  }
  return context
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  const transportRef = useRef<CvmTransport | null>(null)
  const transportKeyRef = useRef<string | null>(null)
  const transportPromiseRef = useRef<Promise<CvmTransport> | null>(null)

  const [manifest, setManifest] = useState<CvmManifest | null>(null)
  const [manifestError, setManifestError] = useState<string | null>(null)
  const [manifestLoading, setManifestLoading] = useState(true)
  const [transportError, setTransportError] = useState<string | null>(null)
  const [proofState, setProofState] = useState<ProofState>({ status: "idle" })
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [authEmail, setAuthEmail] = useState<string | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>(AVAILABLE_MODELS[0].id)
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | null>(null)
  const [ownerStatus, setOwnerStatus] = useState<OwnerStatus | null>(null)
  const [vaultFingerprint, setVaultFingerprint] = useState<string | null>(null)
  const [vaultError, setVaultError] = useState<string | null>(null)
  const [vaultSessionId, setVaultSessionId] = useState<string | null>(null)
  const [ownerAuthBusy, setOwnerAuthBusy] = useState(false)
  const [ownerAuthError, setOwnerAuthError] = useState<string | null>(null)
  const [passkeyStatus, setPasskeyStatus] = useState<PasskeyStatus | null>(null)
  const [passkeyLoading, setPasskeyLoading] = useState(true)
  const [passkeyError, setPasskeyError] = useState<string | null>(null)
  const [passkeyNotice, setPasskeyNotice] = useState<string | null>(null)
  const [passkeyEnrollBusy, setPasskeyEnrollBusy] = useState(false)
  const [passkeyResetBusy, setPasskeyResetBusy] = useState(false)

  const passkeysSatisfied = passkeyStatus ? passkeyStatus.count >= passkeyStatus.minRequired : false
  const passkeyEnrollmentRequired = passkeyStatus !== null && !passkeysSatisfied

  const secureChannelReady = useMemo(() => {
    if (proofState.status !== "ready" || vaultSessionId === null) return false
    return proofState.result.localDevNonAttested || proofState.result.verified
  }, [proofState, vaultSessionId])

  const securityStatus: SecurityStatus = useMemo(() => {
    if (proofState.status === "idle" || proofState.status === "loading") return "verifying"
    if (proofState.status === "error") return "error"
    if (proofState.status === "ready" && proofState.result.localDevNonAttested) return "local_dev_non_attested"
    if (proofState.status === "ready" && proofState.result.verified) return "verified"
    return "error"
  }, [proofState])

  const ensureTransport = useCallback(async (activeManifest: CvmManifest): Promise<CvmTransport> => {
    const key = manifestTransportKey(activeManifest)

    if (transportRef.current && transportKeyRef.current === key) {
      return transportRef.current
    }

    if (transportPromiseRef.current && transportKeyRef.current === key) {
      return transportPromiseRef.current
    }

    transportKeyRef.current = key
    const created = createCvmTransport(activeManifest)
      .then((transport) => {
        transportRef.current = transport
        transportPromiseRef.current = null
        setTransportError(null)
        return transport
      })
      .catch((error) => {
        transportRef.current = null
        transportPromiseRef.current = null
        const message = getErrorMessage(error)
        setTransportError(message)
        throw error
      })

    transportPromiseRef.current = created
    return created
  }, [])

  const loadPasskeyStatus = useCallback(async () => {
    setPasskeyLoading(true)
    setPasskeyError(null)
    try {
      const status = await fetchPasskeyStatus()
      setPasskeyStatus(status)
    } catch (error) {
      setPasskeyStatus(null)
      setPasskeyNotice(null)
      setPasskeyError(getErrorMessage(error))
    } finally {
      setPasskeyLoading(false)
    }
  }, [])

  const loadManifest = useCallback(async () => {
    setManifestLoading(true)
    setManifestError(null)
    try {
      const nextManifest = await fetchManifest()
      setManifest(nextManifest)
    } catch (error) {
      const message = getErrorMessage(error)
      setManifestError(message)
      setManifest(null)
    } finally {
      setManifestLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true

    async function bootstrap() {
      if (isPlaywrightAuthBypassEnabled()) {
        setAuthEmail("playwright-bypass@local.invalid")
        setPasskeyStatus(PLAYWRIGHT_BYPASS_PASSKEY_STATUS)
        setPasskeyError(null)
        setPasskeyLoading(false)
        await loadManifest()
        return
      }

      let supabase
      try {
        supabase = createSupabaseBrowserClient()
      } catch (error) {
        if (active) {
          setManifestError(getErrorMessage(error))
          setManifestLoading(false)
        }
        return
      }

      const { data, error } = await supabase.auth.getUser()
      if (!active) return

      if (error) {
        if (isAuthSessionMissingError(error)) {
          router.replace("/sign-in?auth=required&redirect=/confidential-ai")
          return
        }
        setManifestError(error.message)
        setManifestLoading(false)
        return
      }

      if (!data.user) {
        router.replace("/sign-in?auth=required&redirect=/confidential-ai")
        return
      }

      setAuthEmail(data.user.email ?? null)
      await Promise.all([loadManifest(), loadPasskeyStatus()])
    }

    void bootstrap()
    return () => {
      active = false
    }
  }, [loadManifest, loadPasskeyStatus, router])

  useEffect(() => {
    transportRef.current = null
    transportKeyRef.current = null
    transportPromiseRef.current = null
    setTransportError(null)
  }, [manifest?.baseUrl, manifest?.connectionPolicy.mode, manifest?.connectionPolicy.atlasProxyUrl])

  useEffect(() => {
    if (!isPlaywrightAuthBypassEnabled()) {
      return
    }

    if (proofState.status === "ready") {
      setVaultSessionId((current) => current ?? PLAYWRIGHT_BYPASS_SESSION_ID)
    }
  }, [proofState.status])

  const handleEnrollPasskey = useCallback(async () => {
    setPasskeyEnrollBusy(true)
    setPasskeyError(null)
    setPasskeyNotice(null)
    try {
      const result = await enrollPasskey()
      await Promise.all([loadPasskeyStatus(), loadManifest()])
      if (result.created) {
        if (typeof result.count === "number") {
          setPasskeyNotice(`Passkey added successfully (${result.count}/${result.minRequired}).`)
        } else {
          setPasskeyNotice("Passkey added successfully.")
        }
      } else {
        setPasskeyNotice("Passkey is already registered for this user.")
      }
    } catch (error) {
      setPasskeyError(getErrorMessage(error))
    } finally {
      setPasskeyEnrollBusy(false)
    }
  }, [loadManifest, loadPasskeyStatus])

  const handleResetPasskeys = useCallback(async () => {
    setPasskeyResetBusy(true)
    setPasskeyError(null)
    setPasskeyNotice(null)
    try {
      const result = await resetPasskeys()
      await Promise.all([loadPasskeyStatus(), loadManifest()])
      const suffix = result.deletedCount === 1 ? "" : "s"
      setPasskeyNotice(`Removed ${result.deletedCount} passkey${suffix}.`)
    } catch (error) {
      setPasskeyError(getErrorMessage(error))
    } finally {
      setPasskeyResetBusy(false)
    }
  }, [loadManifest, loadPasskeyStatus])

  const verifyProof = useCallback(async () => {
    if (!manifest) return

    if (manifest.connectionPolicy.mode === "local_dev_non_attested") {
      setProofState({ status: "ready", nonceHex: "local-dev-non-attested", result: buildLocalDevResult() })
      return
    }

    const nonceHex = "atlas-verified"
    setProofState({ status: "loading", nonceHex })

    try {
      // Transport creation IS the attestation verification. Atlas WASM internally fetches the
      // TDX quote, performs DCAP verification, RTMR replay, compose hash check, and EKM channel
      // binding. If ensureTransport succeeds, attestation is verified.
      await ensureTransport(manifest)

      setProofState({ status: "ready", nonceHex, result: buildAtlasVerifiedResult() })
    } catch (error) {
      const message = formatLocalDevTransportError(getErrorMessage(error), normalizeBaseUrl(manifest.baseUrl))
      setProofState({ status: "error", nonceHex, error: message })
    }
  }, [ensureTransport, manifest])

  useEffect(() => {
    if (!manifest) return

    setVaultError(null)
    setVaultStatus(null)
    setOwnerStatus(null)
    setVaultFingerprint(null)
    setVaultSessionId(null)

    const base = normalizeBaseUrl(manifest.baseUrl)

    void ensureTransport(manifest)
      .then((transport) => Promise.allSettled([
        fetchVaultStatus(base, { fetchImpl: transport.fetch }),
        fetchOwnerStatus(base, { fetchImpl: transport.fetch }),
      ]))
      .then((results) => {
        const [vaultResult, ownerResult] = results

        if (vaultResult.status === "fulfilled") {
          setVaultStatus(vaultResult.value)
          setVaultFingerprint(vaultResult.value.vault_fingerprint ?? null)
        } else {
          setVaultStatus({ initialized: false, unlocked: false, claimed: false, vault_fingerprint: null })
          setVaultFingerprint(null)
          setVaultError(getErrorMessage(vaultResult.reason))
        }

        if (ownerResult.status === "fulfilled") {
          setOwnerStatus(ownerResult.value)
        } else {
          setOwnerStatus({ claimed: false, claim_epoch: null, owner_keyset_hash: null, initialized: false })
          setVaultError((current) => current ?? getErrorMessage(ownerResult.reason))
        }
      })
      .catch((error) => {
        setVaultStatus({ initialized: false, unlocked: false, claimed: false, vault_fingerprint: null })
        setOwnerStatus({ claimed: false, claim_epoch: null, owner_keyset_hash: null, initialized: false })
        setVaultError(getErrorMessage(error))
      })
  }, [ensureTransport, manifest])

  useEffect(() => {
    if (!manifest || vaultStatus === null) {
      setProofState({ status: "idle" })
      return
    }
    void verifyProof()
  }, [manifest, vaultStatus, verifyProof])

  const handleOwnerAuth = useCallback(async () => {
    if (!manifest) return

    const base = normalizeBaseUrl(manifest.baseUrl)
    const context = ownerStatus?.claimed ? "unlock" : "claim"

    setOwnerAuthBusy(true)
    setOwnerAuthError(null)

    try {
      const transport = await ensureTransport(manifest)
      const result = await authenticateOwnerWithPasskey({ baseUrl: base, context, fetchImpl: transport.fetch })
      setVaultSessionId(result.vault_session_id)

      const [nextVaultStatus, nextOwnerStatus] = await Promise.all([
        fetchVaultStatus(base, { fetchImpl: transport.fetch }),
        fetchOwnerStatus(base, { fetchImpl: transport.fetch }),
      ])

      setVaultStatus(nextVaultStatus)
      setVaultFingerprint(nextVaultStatus.vault_fingerprint ?? null)
      setOwnerStatus(nextOwnerStatus)
      setRuntimeError(null)
    } catch (error) {
      setOwnerAuthError(getErrorMessage(error))
      setVaultSessionId(null)
    } finally {
      setOwnerAuthBusy(false)
    }
  }, [ensureTransport, manifest, ownerStatus?.claimed])

  const handleVaultLock = useCallback(async () => {
    if (!manifest || !vaultSessionId) return

    const base = normalizeBaseUrl(manifest.baseUrl)
    try {
      const transport = await ensureTransport(manifest)
      await lockVault(base, vaultSessionId, { fetchImpl: transport.fetch })
    } catch {
      // best-effort lock
    }

    setVaultSessionId(null)
    setVaultStatus((previous) => (previous ? { ...previous, unlocked: false } : previous))
  }, [ensureTransport, manifest, vaultSessionId])

  const sendMessage = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (isSending) return

      const trimmed = input.trim()
      if (!trimmed || !manifest) return

      if (!secureChannelReady) {
        setRuntimeError("Attestation mode and owner passkey authentication must complete before sending messages.")
        return
      }

      const userMessage: Message = { role: "user", content: trimmed }
      const assistantPlaceholder: Message = { role: "assistant", content: "", streaming: true }
      const updatedMessages = [...messages, userMessage, assistantPlaceholder]

      setMessages(updatedMessages)
      setInput("")
      setIsSending(true)
      setRuntimeError(null)

      const patchAssistantMessage = (content: string, streaming: boolean) => {
        setMessages((previous) => {
          if (previous.length === 0) return previous
          const next = [...previous]
          const index = next.length - 1
          const message = next[index]
          if (!message || message.role !== "assistant") return previous
          next[index] = { role: "assistant", content, streaming }
          return next
        })
      }

      try {
        const transport = await ensureTransport(manifest)
        const accessTokenForChat = vaultSessionId ?? ""
        let content = ""
        for await (const chunk of streamOpenClawResponses({
          baseUrl: normalizeBaseUrl(manifest.baseUrl),
          accessToken: accessTokenForChat,
          model: selectedModel,
          responsesPath: manifest.openclaw.responsesPath,
          fetchImpl: transport.fetch,
          messages: updatedMessages
            .filter((message) => !message.streaming)
            .map((message) => ({ role: message.role, content: message.content })),
        })) {
          if (chunk.type === "delta") {
            content += chunk.content
            patchAssistantMessage(content, true)
          }

          if (chunk.type === "error") {
            const lowered = chunk.error.toLowerCase()
            if (lowered.includes("423") || lowered.includes("locked") || lowered.includes("expired")) {
              setVaultSessionId(null)
              setVaultStatus((previous) => (previous ? { ...previous, unlocked: false } : previous))
              throw new Error("Owner vault session expired. Re-authenticate with your passkey to continue.")
            }
            if (lowered.includes("401") || lowered.includes("unauthorized") || lowered.includes("forbidden")) {
              setVaultSessionId(null)
              setVaultStatus((previous) => (previous ? { ...previous, unlocked: false } : previous))
              throw new Error("Owner vault session is invalid. Re-authenticate with your passkey.")
            }
            throw new Error(formatLocalDevTransportError(chunk.error, normalizeBaseUrl(manifest.baseUrl)))
          }

          if (chunk.type === "done") {
            content = chunk.content || content
          }
        }

        patchAssistantMessage(content || "No response from OpenClaw.", false)
      } catch (error) {
        patchAssistantMessage(
          formatLocalDevTransportError(getErrorMessage(error), normalizeBaseUrl(manifest.baseUrl)),
          false,
        )
      } finally {
        setIsSending(false)
      }
    },
    [ensureTransport, input, isSending, manifest, messages, secureChannelReady, selectedModel, vaultSessionId],
  )

  const handleSignOut = useCallback(async () => {
    try {
      if (manifest && vaultSessionId) {
        const base = normalizeBaseUrl(manifest.baseUrl)
        const transport = await ensureTransport(manifest)
        await lockVault(base, vaultSessionId, { fetchImpl: transport.fetch }).catch(() => {})
        setVaultSessionId(null)
      }
      const supabase = createSupabaseBrowserClient()
      await supabase.auth.signOut()
    } finally {
      router.replace("/sign-in")
    }
  }, [ensureTransport, router, manifest, vaultSessionId])

  const value: WorkspaceContextValue = useMemo(
    () => ({
      authEmail,
      manifest,
      manifestError,
      manifestLoading,
      loadManifest,
      proofState,
      verifyProof,
      connectionMode: manifest?.connectionPolicy.mode ?? null,
      transportError,
      vaultStatus,
      ownerStatus,
      vaultFingerprint,
      vaultError,
      vaultSessionId,
      ownerAuthBusy,
      ownerAuthError,
      handleOwnerAuth,
      handleVaultLock,
      passkeyStatus,
      passkeyLoading,
      passkeyError,
      passkeyNotice,
      passkeyEnrollBusy,
      passkeyResetBusy,
      passkeysSatisfied,
      passkeyEnrollmentRequired,
      handleEnrollPasskey,
      handleResetPasskeys,
      loadPasskeyStatus,
      messages,
      input,
      setInput,
      isSending,
      runtimeError,
      secureChannelReady,
      selectedModel,
      setSelectedModel,
      sendMessage,
      securityStatus,
      handleSignOut,
    }),
    [
      authEmail,
      manifest,
      manifestError,
      manifestLoading,
      loadManifest,
      proofState,
      verifyProof,
      transportError,
      vaultStatus,
      ownerStatus,
      vaultFingerprint,
      vaultError,
      vaultSessionId,
      ownerAuthBusy,
      ownerAuthError,
      handleOwnerAuth,
      handleVaultLock,
      passkeyStatus,
      passkeyLoading,
      passkeyError,
      passkeyNotice,
      passkeyEnrollBusy,
      passkeyResetBusy,
      passkeysSatisfied,
      passkeyEnrollmentRequired,
      handleEnrollPasskey,
      handleResetPasskeys,
      loadPasskeyStatus,
      messages,
      input,
      isSending,
      runtimeError,
      secureChannelReady,
      selectedModel,
      sendMessage,
      securityStatus,
      handleSignOut,
    ],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}
