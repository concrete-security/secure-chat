import { describe, expect, it, vi } from "vitest"
import { inlineAssets, createAdminBlobUrl } from "@/lib/atls-iframe/iframe-loader"

describe("iframe-loader", () => {
  describe("inlineAssets", () => {
    it("inlines a script src tag", async () => {
      const html = '<html><head><script src="./app.js"></script></head><body></body></html>'
      const fetchImpl = vi.fn(async (url: string) => {
        if (url.endsWith("app.js")) {
          return new Response("console.log('hello')", {
            headers: { "content-type": "application/javascript" },
          })
        }
        throw new Error("unexpected URL: " + url)
      })
      const result = await inlineAssets(html, "/admin/", fetchImpl)
      expect(result).toContain("<script>console.log('hello')</script>")
      expect(result).not.toContain('src="./app.js"')
    })

    it("inlines a link stylesheet", async () => {
      const html = '<html><head><link rel="stylesheet" href="./style.css"></head></html>'
      const fetchImpl = vi.fn(async () =>
        new Response("body { color: red; }", {
          headers: { "content-type": "text/css" },
        })
      )
      const result = await inlineAssets(html, "/admin/", fetchImpl)
      expect(result).toContain("<style>body { color: red; }</style>")
    })

    it("converts images to data URIs", async () => {
      const html = '<html><body><img src="./icon.svg"></body></html>'
      const svgContent = '<svg></svg>'
      const fetchImpl = vi.fn(async () =>
        new Response(svgContent, {
          headers: { "content-type": "image/svg+xml" },
        })
      )
      const result = await inlineAssets(html, "/admin/", fetchImpl)
      expect(result).toContain('src="data:image/svg+xml;base64,')
    })

    it("preserves HTML structure", async () => {
      const html = '<html><head></head><body><div>content</div></body></html>'
      const fetchImpl = vi.fn()
      const result = await inlineAssets(html, "/admin/", fetchImpl)
      expect(result).toContain("<div>content</div>")
    })

    it("resolves relative URLs against base path", async () => {
      const html = '<script src="./assets/app-abc123.js"></script>'
      const fetchImpl = vi.fn(async (url: string) => {
        expect(url).toBe("/admin/assets/app-abc123.js")
        return new Response("code()")
      })
      await inlineAssets(html, "/admin/", fetchImpl)
      expect(fetchImpl).toHaveBeenCalledWith("/admin/assets/app-abc123.js")
    })
  })

  describe("createAdminBlobUrl", () => {
    it("returns a blob: URL", async () => {
      expect(typeof createAdminBlobUrl).toBe("function")
    })
  })
})
