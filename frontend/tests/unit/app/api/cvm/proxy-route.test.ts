import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const originalEnv = process.env

describe("/api/cvm/proxy route", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
    process.env = { ...originalEnv, NODE_ENV: "test" }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it("returns 404 in production", async () => {
    process.env.NODE_ENV = "production"

    const { GET } = await import("@/app/api/cvm/proxy/route")
    const request = new Request("http://localhost:3000/api/cvm/proxy?path=%2Fadmin%2Fapi%2Fmodels", {
      method: "GET",
    })

    const response = await GET(request)

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: "Not found" })
  })

  it("returns 400 for invalid path", async () => {
    const { GET } = await import("@/app/api/cvm/proxy/route")
    const request = new Request("http://localhost:3000/api/cvm/proxy?path=admin/api/models", {
      method: "GET",
    })

    const response = await GET(request)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: "Missing or invalid ?path= parameter",
    })
  })

  it("proxies GET calls to configured CVM base URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"data":["mock-model"]}', {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      })
    )
    vi.stubGlobal("fetch", fetchMock)
    process.env.PRIVATE_AGENT_DEFAULT_BASE_URL = "http://localhost:7777/"

    const { GET } = await import("@/app/api/cvm/proxy/route")
    const request = new Request("http://localhost:3000/api/cvm/proxy?path=%2Fadmin%2Fapi%2Fmodels", {
      method: "GET",
      headers: {
        authorization: "Bearer session-token",
      },
    })

    const response = await GET(request)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("http://localhost:7777/admin/api/models")
    expect(init.method).toBe("GET")
    expect(init.cache).toBe("no-store")
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer session-token")

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    await expect(response.json()).resolves.toEqual({ data: ["mock-model"] })
  })

  it("proxies POST request body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      })
    )
    vi.stubGlobal("fetch", fetchMock)
    process.env.PRIVATE_AGENT_DEFAULT_BASE_URL = "http://localhost:8888"

    const { POST } = await import("@/app/api/cvm/proxy/route")
    const request = new Request("http://localhost:3000/api/cvm/proxy?path=%2Fowner%2Fstatus", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ ping: true }),
    })

    const response = await POST(request)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("http://localhost:8888/owner/status")
    expect(init.method).toBe("POST")
    expect(init.body).toBe('{"ping":true}')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it("returns 502 when upstream fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("proxy timeout"))
    vi.stubGlobal("fetch", fetchMock)
    process.env.PRIVATE_AGENT_DEFAULT_BASE_URL = "http://localhost:8888"

    const { GET } = await import("@/app/api/cvm/proxy/route")
    const request = new Request("http://localhost:3000/api/cvm/proxy?path=%2Fowner%2Fstatus", {
      method: "GET",
    })

    const response = await GET(request)

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({ error: "proxy timeout" })
  })
})
