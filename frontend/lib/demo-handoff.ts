import { EXAMPLE_THEMES, type ExampleThemeId } from "@/lib/example-themes"

export const DEMO_HANDOFF_STORAGE_KEY = "confidential-chat-demo-handoff-v1"

export type DemoHandoffPayload = {
  exampleId: ExampleThemeId
  autoSend: boolean
}

export type DemoAutoSendReadiness = {
  pendingDemoSend: boolean
  secureChannelReady: boolean
  providerConfigured: boolean
  guestRestricted: boolean
  isSending: boolean
}

export function parseDemoHandoffPayload(raw: string | null): DemoHandoffPayload | null {
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<DemoHandoffPayload>
    if (typeof parsed?.exampleId !== "string") return null
    if (!(parsed.exampleId in EXAMPLE_THEMES)) return null

    return {
      exampleId: parsed.exampleId as ExampleThemeId,
      autoSend: parsed.autoSend === true,
    }
  } catch {
    return null
  }
}

export function canAutoSendDemo(readiness: DemoAutoSendReadiness) {
  return (
    readiness.pendingDemoSend &&
    readiness.secureChannelReady &&
    readiness.providerConfigured &&
    !readiness.guestRestricted &&
    !readiness.isSending
  )
}
