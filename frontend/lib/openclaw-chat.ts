export type OpenClawMessage = {
  role: "user" | "assistant" | "system"
  content: string
}

export type OpenClawResponseChunk =
  | { type: "delta"; content: string }
  | { type: "done"; content: string }
  | { type: "error"; error: string }

export type OpenClawStreamParams = {
  baseUrl: string
  accessToken?: string
  model?: string | null
  responsesPath?: string
  messages: OpenClawMessage[]
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "")
}

function normalizeUrl(baseUrl: string, path: string) {
  return `${trimTrailingSlash(baseUrl)}${path.startsWith("/") ? path : `/${path}`}`
}

function buildInput(messages: OpenClawMessage[]) {
  return messages.map((message) => ({
    type: "message",
    role: message.role,
    content: [{ type: "input_text", text: message.content }],
  }))
}

function describeError(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim()
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim()
  }
  return "Unknown OpenClaw transport error"
}

type OpenClawStreamEvent = {
  type?: string
  delta?: string
  text?: string
  error?: {
    message?: string
  }
  response?: {
    output_text?: string
  }
}

function extractDelta(event: OpenClawStreamEvent): string {
  if (typeof event.delta === "string" && event.delta.length > 0) {
    return event.delta
  }
  if (typeof event.text === "string" && event.text.length > 0) {
    return event.text
  }
  if (event.response && typeof event.response.output_text === "string") {
    return event.response.output_text
  }
  return ""
}

function parseEvent(data: string): OpenClawStreamEvent | null {
  try {
    return JSON.parse(data) as OpenClawStreamEvent
  } catch {
    return null
  }
}

async function readErrorResponse(response: Response) {
  const raw = await response.text().catch(() => "")
  if (!raw) {
    return `OpenClaw endpoint failed with status ${response.status}`
  }

  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string }; message?: string }
    if (typeof parsed?.error?.message === "string" && parsed.error.message.trim().length > 0) {
      return parsed.error.message.trim()
    }
    if (typeof parsed?.message === "string" && parsed.message.trim().length > 0) {
      return parsed.message.trim()
    }
  } catch {
    // fall through
  }
  return raw.slice(0, 512)
}

export async function* streamOpenClawResponses(
  params: OpenClawStreamParams,
): AsyncGenerator<OpenClawResponseChunk, void, unknown> {
  const accessToken = params.accessToken ?? ""

  if (!params.baseUrl) {
    yield { type: "error", error: "Missing OpenClaw base URL." }
    return
  }
  const endpoint = normalizeUrl(params.baseUrl, params.responsesPath ?? "/v1/responses")
  const fetchFn = params.fetchImpl ?? fetch
  const body: Record<string, unknown> = {
    stream: true,
    input: buildInput(params.messages),
  }

  if (params.model && params.model.trim().length > 0) {
    body.model = params.model.trim()
  }

  let response: Response
  try {
    response = await fetchFn(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: params.signal,
    })
  } catch (error) {
    yield { type: "error", error: describeError(error) }
    return
  }

  if (!response.ok) {
    yield { type: "error", error: await readErrorResponse(response) }
    return
  }

  const reader = response.body?.getReader()
  if (!reader) {
    yield { type: "error", error: "OpenClaw stream reader unavailable." }
    return
  }

  const decoder = new TextDecoder()
  let buffer = ""
  let accumulated = ""

  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })

      let nextNewline = buffer.indexOf("\n")
      while (nextNewline >= 0) {
        const rawLine = buffer.slice(0, nextNewline).trim()
        buffer = buffer.slice(nextNewline + 1)

        if (rawLine && rawLine.startsWith("data:")) {
          const data = rawLine.slice(5).trim()
          if (data === "[DONE]") {
            yield { type: "done", content: accumulated }
            return
          }

          const event = parseEvent(data)
          if (!event) {
            nextNewline = buffer.indexOf("\n")
            continue
          }

          const eventType = event.type ?? ""
          if (eventType.includes("error")) {
            const message =
              (typeof event.error?.message === "string" && event.error.message.trim()) ||
              "OpenClaw stream error"
            yield { type: "error", error: message }
            return
          }

          if (
            eventType === "response.output_text.delta" ||
            eventType === "response.delta" ||
            eventType.endsWith(".delta")
          ) {
            const piece = extractDelta(event)
            if (piece) {
              accumulated += piece
              yield { type: "delta", content: piece }
            }
          }

          if (eventType === "response.completed") {
            const finalText = extractDelta(event)
            if (finalText && !accumulated.endsWith(finalText)) {
              accumulated = finalText
            }
            yield { type: "done", content: accumulated }
            return
          }
        }

        nextNewline = buffer.indexOf("\n")
      }

      if (done) {
        break
      }
    }
  } catch (error) {
    yield { type: "error", error: describeError(error) }
    return
  }

  yield { type: "done", content: accumulated }
}
