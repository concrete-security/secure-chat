import { describe, expect, it, vi } from "vitest"

import { scheduleAtlsAutoConnect } from "@/lib/atls-connect-scheduler"

describe("scheduleAtlsAutoConnect", () => {
  it("runs only one scheduled callback in strict-mode style mount/unmount", () => {
    vi.useFakeTimers()

    let calls = 0

    const firstCleanup = scheduleAtlsAutoConnect(() => {
      calls += 1
    })
    firstCleanup()

    const secondCleanup = scheduleAtlsAutoConnect(() => {
      calls += 1
    })

    vi.runAllTimers()
    expect(calls).toBe(1)

    secondCleanup()
    vi.useRealTimers()
  })
})
