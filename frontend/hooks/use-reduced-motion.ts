import { useEffect, useState } from "react"

/** Returns true when the user has `prefers-reduced-motion: reduce` active. */
export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReducedMotion(mq.matches)
    const handler = (event: MediaQueryListEvent) => setReducedMotion(event.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])

  return reducedMotion
}
