// app/api/confidential-chat/route.ts
// vLLM chat endpoint using OpenAI SDK.

import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"

import { systemPrompt } from "@/lib/system-prompt"

type ReasoningPayload = unknown

type Message = {
  role: "system" | "user" | "assistant"
  content: string
  reasoning_content?: ReasoningPayload
}

type ProviderResponseChoice = {
  message?: Message & { content: string; reasoning_content?: ReasoningPayload }
  delta?: Partial<Message> & { content?: string; reasoning_content?: ReasoningPayload }
  text?: string
}

type ProviderResponse = {
  id?: string
  choices?: ProviderResponseChoice[]
  message?: string
  reply?: string
  content?: string
}

const DEFAULT_PROVIDER_API_BASE =
  optionalEnv(process.env.VLLM_BASE_URL) ?? optionalEnv(process.env.NEXT_PUBLIC_VLLM_BASE_URL)
const DEFAULT_MODEL = optionalEnv(process.env.VLLM_MODEL) ?? optionalEnv(process.env.NEXT_PUBLIC_MODEL)
const DEFAULT_SYSTEM_PROMPT = optionalEnv(process.env.DEFAULT_SYSTEM_PROMPT) ?? systemPrompt
const DEFAULT_MAX_TOKENS = parseNumber(process.env.DEFAULT_MAX_TOKENS, 512)
const DEFAULT_TEMPERATURE = parseNumber(process.env.DEFAULT_TEMPERATURE, 0.2)

function createOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.VLLM_API_KEY,
    baseURL: DEFAULT_PROVIDER_API_BASE,
  })
}

function optionalEnv(value: string | undefined): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function parseNumber(value: string | undefined, fallback: number) {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function ensureSystemMessage(messages: Message[]) {
  if (messages.some((msg) => msg.role === "system")) return messages
  return [{ role: "system", content: DEFAULT_SYSTEM_PROMPT }, ...messages]
}

function sanitizeMessages(messages: unknown): Message[] {
  if (!Array.isArray(messages)) {
    throw new Error("messages must be an array")
  }

  return messages.map((msg) => {
    if (!msg || typeof msg !== "object") {
      throw new Error("each message must be an object")
    }

    const role = (msg as Message).role
    const content = (msg as Message).content

    if (role !== "system" && role !== "user" && role !== "assistant") {
      throw new Error("invalid message role")
    }

    if (typeof content !== "string" || content.trim().length === 0) {
      throw new Error("message content must be a non-empty string")
    }

    return {
      role,
      content,
    }
  })
}

function getProviderResponseText(payload: ProviderResponse): string | null {
  if (!payload) {
    return null
  }

  if (typeof payload.message === "string" && payload.message.trim().length > 0) {
    return payload.message.trim()
  }

  if (typeof payload.reply === "string" && payload.reply.trim().length > 0) {
    return payload.reply.trim()
  }

  if (typeof payload.content === "string" && payload.content.trim().length > 0) {
    return payload.content.trim()
  }

  const firstChoice = payload.choices?.[0]
  if (firstChoice?.message?.content) {
    return firstChoice.message.content.trim()
  }

  if (firstChoice?.text) {
    return firstChoice.text.trim()
  }

  if (firstChoice?.delta?.content) {
    return firstChoice.delta.content.trim()
  }

  return null
}

function extractContentDelta(content: unknown): string {
  if (!content) return ""
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part) return ""
        if (typeof part === "string") return part
        if (typeof part === "object" && typeof (part as { text?: string }).text === "string") {
          return (part as { text: string }).text
        }
        return ""
      })
      .join("")
  }
  if (typeof content === "object" && typeof (content as { text?: string }).text === "string") {
    return (content as { text: string }).text
  }
  return ""
}

function normalizeReasoning(value: unknown): string {
  if (!value) return ""
  if (typeof value === "string") return value
  if (Array.isArray(value)) {
    return value.map((item) => normalizeReasoning(item)).join("")
  }
  if (typeof value === "object") {
    const typed = value as Record<string, unknown>
    if (typeof typed.text === "string") return typed.text
    if (typeof typed.reasoning === "string") return typed.reasoning
    if (Array.isArray(typed.content)) return typed.content.map((item) => normalizeReasoning(item)).join("")
    if (typeof typed.content === "string") return typed.content
    if (typeof typed.output_text === "string") return typed.output_text
  }
  return ""
}

function extractReasoningDelta(delta: unknown): string {
  if (!delta || typeof delta !== "object") return ""
  const typed = delta as Record<string, unknown>
  const reasoningSource = typed.reasoning_content ?? typed.reasoning
  return normalizeReasoning(reasoningSource)
}

function computeRemainder(full: string, seen: string): string {
  if (!full) return ""
  if (!seen) return full
  if (full.startsWith(seen)) {
    return full.slice(seen.length)
  }
  return full
}

function extractReasoningFromChoice(choice?: ProviderResponseChoice): string | null {
  if (!choice) return null
  const fromMessage = normalizeReasoning(choice.message?.reasoning_content)
  if (fromMessage) return fromMessage
  const fromChoice = normalizeReasoning((choice as unknown as Record<string, unknown>)?.reasoning_content)
  if (fromChoice) return fromChoice
  return null
}

export async function POST(req: NextRequest) {
  try {
    // Parse body
    const body = await req.json();

    // Sanitize + ensure system message
    const sanitizedMessages = ensureSystemMessage(sanitizeMessages(body?.messages));

    const model =
      typeof body?.model === "string" && body.model.trim().length > 0 ? body.model.trim() : DEFAULT_MODEL;
    const temperature = typeof body?.temperature === "number" ? body.temperature : DEFAULT_TEMPERATURE;
    const max_tokens = typeof body?.max_tokens === "number" ? body.max_tokens : DEFAULT_MAX_TOKENS;
    const stream = body?.stream !== false;
    const reasoningEffortValue = typeof body?.reasoning_effort === "string" ? body.reasoning_effort.toLowerCase() : undefined;
    const reasoningEffort = reasoningEffortValue && ["low", "medium", "high"].includes(reasoningEffortValue)
      ? (reasoningEffortValue as "low" | "medium" | "high")
      : undefined;

    if (!DEFAULT_PROVIDER_API_BASE) {
      return NextResponse.json({ error: "VLLM_BASE_URL is not configured" }, { status: 500 });
    }

    if (!process.env.VLLM_API_KEY) {
      return NextResponse.json({ error: "VLLM_API_KEY is not configured" }, { status: 500 });
    }

    if (!model) {
      return NextResponse.json({ error: "No model specified. Set VLLM_MODEL or provide model in request." }, { status: 400 });
    }

    const client = createOpenAIClient()
    if (!stream) {
      const request: Record<string, unknown> = {
        model,
        messages: sanitizedMessages,
        temperature,
        max_tokens,
        stream: false,
      };
      if (reasoningEffort) {
        request.extra_body = { reasoning_effort: reasoningEffort };
      }

      const resp = await client.chat.completions.create(request);

      const first = resp.choices?.[0];
      const message =
        first?.message?.content ??
        getProviderResponseText(resp as unknown as ProviderResponse) ??
        JSON.stringify(resp);

      const reasoning_content = extractReasoningFromChoice(first);
      const finish_reason = first?.finish_reason ?? undefined;

      return NextResponse.json({ message, raw: resp, reasoning_content, finish_reason, reasoning_effort: reasoningEffort }, { status: 200 });
    }

    const streamRequest: Record<string, unknown> = {
      model,
      messages: sanitizedMessages,
      temperature,
      max_tokens,
      stream: true,
    };
    if (reasoningEffort) {
      streamRequest.extra_body = { reasoning_effort: reasoningEffort };
    }

    const completion = await client.chat.completions.create(streamRequest);

    const encoder = new TextEncoder()
    let accumulatedContent = ""
    let accumulatedReasoning = ""
    let finishReason: string | null = null

    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of completion) {
            const choice = chunk.choices?.[0]
            if (!choice) {
              continue
            }

            const deltaContent = extractContentDelta(choice.delta?.content)
            const messageContent = extractContentDelta(choice.message?.content)
            const reasoningDelta = extractReasoningDelta(choice.delta)
            const reasoningMessageFull = normalizeReasoning(choice.message?.reasoning_content)

            if (choice.finish_reason && !finishReason) {
              finishReason = choice.finish_reason
            }

            const contentPiece = deltaContent || computeRemainder(messageContent, accumulatedContent)
            const reasoningPiece = reasoningDelta || computeRemainder(reasoningMessageFull, accumulatedReasoning)

            if (contentPiece) {
              accumulatedContent += contentPiece
              controller.enqueue(encoder.encode(`${JSON.stringify({ type: "delta", content: contentPiece })}\n`))
            }

            if (reasoningPiece) {
              accumulatedReasoning += reasoningPiece
              controller.enqueue(encoder.encode(`${JSON.stringify({ type: "reasoning_delta", reasoning_content: reasoningPiece })}\n`))
            }
          }

          controller.enqueue(
            encoder.encode(
              `${JSON.stringify({
                type: "done",
                content: accumulatedContent,
                reasoning_content: accumulatedReasoning || undefined,
                finish_reason: finishReason || undefined,
              })}\n`
            )
          )
          controller.close()
        } catch (err) {
          console.error("Confidential chat stream failed", err)
          const message = err instanceof Error ? err.message : "Unknown error"
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error", error: message })}\n`))
          controller.close()
        }
      },
    })

    return new Response(readable, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache, no-transform",
      },
    })
  } catch (error: any) {
    console.error("Confidential chat failed", error);
    return NextResponse.json(
      { error: error?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
