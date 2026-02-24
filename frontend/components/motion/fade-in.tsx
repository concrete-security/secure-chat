"use client"

import { type ReactNode } from "react"
import { motion } from "framer-motion"
import { DURATION, EASE } from "@/lib/motion"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

type Direction = "up" | "down" | "left" | "right"

type FadeInProps = {
  children: ReactNode
  direction?: Direction
  distance?: number
  delay?: number
  duration?: number
  once?: boolean
  /** Animate on mount instead of on scroll into view. Use for above-the-fold content. */
  onMount?: boolean
  className?: string
}

const directionOffset: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: 1 },
  down: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

export function FadeIn({
  children,
  direction = "up",
  distance = 24,
  delay = 0,
  duration = DURATION.entrance,
  once = true,
  onMount = false,
  className,
}: FadeInProps) {
  const reducedMotion = useReducedMotion()

  if (reducedMotion) {
    return <div className={className}>{children}</div>
  }

  const offset = directionOffset[direction]
  const initial = { opacity: 0, x: offset.x * distance, y: offset.y * distance }
  const target = { opacity: 1, x: 0, y: 0 }

  return (
    <motion.div
      initial={initial}
      {...(onMount ? { animate: target } : { whileInView: target, viewport: { once, margin: "-64px" } })}
      transition={{ duration, delay, ease: EASE.decelerate }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
