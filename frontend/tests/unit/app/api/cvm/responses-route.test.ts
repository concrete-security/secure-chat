import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const originalEnv = process.env

type ProxyPayload = {
  baseUrl?: string
  accessToken?: string
  model?: string | null
  responsesPath?: string | null
  messages?: Array<{ role: "user" | "assistant" | "system"; content: string }>
}

function buildRequest(payload: ProxyPayload): Request {
  return new Request("http://localhost:3000/api/cvm/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  })
}

describe("POST /api/cvm/responses", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    process.env = { ...originalEnv, NODE_ENV: "test" }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it("returns 404 when dev responses proxy is disabled", async () => {
    process.env.NODE_ENV = "production"

    const { POST } = await import("@/app/api/cvm/responses/route")
    const response = await POST(
      buildRequest({
        baseUrl: "http://localhost:11434",
        messages: [{ role: "user", content: "ping" }],
      })
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: "Not found" })
  })

  it("returns 415 for non JSON requests", async () => {
    const { POST } = await import("@/app/api/cvm/responses/route")
    const request = new Request("http://localhost:3000/api/cvm/responses", {
      method: "POST",
      headers: {
        "content-type": "text/plain",
      },
      body: "not-json",
    })

    const response = await POST(request)

    expect(response.status).toBe(415)
    await expect(response.json()).resolves.toEqual({ error: "Unsupported content type" })
  })

  it("returns 400 for unsupported baseUrl", async () => {
    const { POST } = await import("@/app/api/cvm/responses/route")
    const response = await POST(
      buildRequest({
        baseUrl: "https://cvm.example.com",
        messages: [{ role: "user", content: "ping" }],
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "Unsupported baseUrl for dev responses proxy",
    })
  })

  it("streams upstream response and forwards auth context", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("data: {\"ok\":true}\n\ndata: [DONE]\n\n", {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
        },
      })
    )
    vi.stubGlobal("fetch", fetchMock)
    process.env.NEXT_PUBLIC_APP_URL = "https://frontend.example/"

    const { POST } = await import("@/app/api/cvm/responses/route")
    const response = await POST(
      buildRequest({
        baseUrl: "http://localhost:8800",
        accessToken: "secret-token",
        model: "mock-openclaw",
        responsesPath: "v1/responses",
        messages: [{ role: "user", content: "hello" }],
      })
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("http://localhost:8800/v1/responses")
    expect(init.method).toBe("POST")
    expect(init.cache).toBe("no-store")

    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe("Bearer secret-token")
    expect(headers.Origin).toBe("https://frontend.example")

    const body = JSON.parse(String(init.body)) as {
      stream: boolean
      model: string
      input: Array<{ role: string; content: Array<{ type: string; text: string }> }>
    }
    expect(body.stream).toBe(true)
    expect(body.model).toBe("mock-openclaw")
    expect(body.input[0]).toEqual({
      role: "user",
      type: "message",
      content: [{ type: "input_text", text: "hello" }],
    })

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/event-stream")
    await expect(response.text()).resolves.toContain("[DONE]")
  })

  it("passes through upstream error details", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("upstream denied", {
        status: 401,
        headers: {
          "content-type": "text/plain",
        },
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    const { POST } = await import("@/app/api/cvm/responses/route")
    const response = await POST(
      buildRequest({
        baseUrl: "http://localhost:8800",
        messages: [{ role: "user", content: "hello" }],
      })
    )

    expect(response.status).toBe(401)
    expect(response.headers.get("cache-control")).toBe("no-store")
    await expect(response.text()).resolves.toBe("upstream denied")
  })

  it("returns 502 when upstream is unreachable", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"))
    vi.stubGlobal("fetch", fetchMock)

    const { POST } = await import("@/app/api/cvm/responses/route")
    const response = await POST(
      buildRequest({
        baseUrl: "http://localhost:8800",
        messages: [{ role: "user", content: "hello" }],
      })
    )

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({ error: "connect ECONNREFUSED" })
  })
})
