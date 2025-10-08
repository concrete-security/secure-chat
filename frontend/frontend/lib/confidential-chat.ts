export type ConfidentialChatMessage = {
  role: "user" | "assistant" | "system"
  content: string
}

export type ConfidentialChatPayload = {
  messages: ConfidentialChatMessage[]
  model?: string
  temperature?: number
  max_tokens?: number
  stream?: boolean
  reasoning_effort?: "low" | "medium" | "high"
}

export type ConfidentialChatOptions = {
  signal?: AbortSignal
}

export type ConfidentialChatStreamChunk =
  | { type: "delta"; content: string }
  | { type: "reasoning_delta"; reasoning_content: string }
  | { type: "done"; content: string; reasoning_content?: string; finish_reason?: string }
  | { type: "error"; error: string }

const INTERNAL_CHAT_ENDPOINT = "/api/confidential-chat"

const providerApiBase = optionalEnv(process.env.NEXT_PUBLIC_VLLM_BASE_URL)
const providerModel = optionalEnv(process.env.NEXT_PUBLIC_VLLM_MODEL)
const providerName = optionalEnv(process.env.NEXT_PUBLIC_VLLM_PROVIDER_NAME)

export async function* streamConfidentialChat(
  payload: ConfidentialChatPayload,
  options: ConfidentialChatOptions = {}
): AsyncGenerator<ConfidentialChatStreamChunk, void, unknown> {
  const response = await fetch(INTERNAL_CHAT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...payload,
      stream: true,
    }),
    cache: "no-store",
    signal: options.signal,
  })

  if (!response.ok) {
    const text = await safeReadText(response)
    throw new Error(`Confidential chat API error (${response.status}): ${text || response.statusText}`)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error("Streaming is not supported in this environment.")
  }

  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        buffer += decoder.decode()
        const remaining = buffer.trim()
        if (remaining) {
          yield parseStreamLine(remaining)
        }
        break
      }

      buffer += decoder.decode(value, { stream: true })
      let newlineIndex = buffer.indexOf("\n")
      while (newlineIndex >= 0) {
        const rawLine = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (rawLine) {
          yield parseStreamLine(rawLine)
        }
        newlineIndex = buffer.indexOf("\n")
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export async function sendConfidentialChat(
  payload: ConfidentialChatPayload,
  options: ConfidentialChatOptions = {}
): Promise<{ message: string; reasoning_content?: string; finish_reason?: string }> {
  let message = ""
  let reasoning = ""
  let finishReason: string | undefined

  for await (const chunk of streamConfidentialChat(payload, options)) {
    if (chunk.type === "delta" && chunk.content) {
      message += chunk.content
    }

    if (chunk.type === "reasoning_delta" && chunk.reasoning_content) {
      reasoning += chunk.reasoning_content
    }

    if (chunk.type === "done") {
      if (chunk.content) {
        message = chunk.content
      }
      if (chunk.reasoning_content) {
        reasoning = chunk.reasoning_content
      }
      if (chunk.finish_reason) {
        finishReason = chunk.finish_reason
      }
    }

    if (chunk.type === "error") {
      throw new Error(chunk.error)
    }
  }

  return { message, reasoning_content: reasoning || undefined, finish_reason: finishReason }
}

export const confidentialChatConfig = {
  endpoint: INTERNAL_CHAT_ENDPOINT,
  providerApiBase,
  providerModel,
  providerName,
}

function optionalEnv(value: string | undefined) {
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

async function safeReadText(response: Response) {
  try {
    return await response.text()
  } catch (error) {
    console.error("Failed to read error response", error)
    return ""
  }
}

function parseStreamLine(line: string): ConfidentialChatStreamChunk {
  if (line === "[DONE]") {
    return { type: "done", content: "" }
  }

  try {
    return JSON.parse(line) as ConfidentialChatStreamChunk
  } catch (error) {
    console.error("Failed to parse stream line", line, error)
    throw new Error("Unable to parse chat stream chunk")
  }
}
