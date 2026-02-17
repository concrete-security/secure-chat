"use client"

import { type ReactNode } from "react"
import { motion } from "framer-motion"
import { STAGGER } from "@/lib/motion"
import { staggerContainer } from "@/lib/motion-variants"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

type StaggerChildrenProps = {
  children: ReactNode
  stagger?: number
  once?: boolean
  className?: string
}

export function StaggerChildren({
  children,
  stagger = STAGGER.normal,
  once = true,
  className,
}: StaggerChildrenProps) {
  const reducedMotion = useReducedMotion()

  if (reducedMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      variants={{
        ...staggerContainer,
        visible: {
          transition: {
            staggerChildren: stagger,
            delayChildren: 0.1,
          },
        },
      }}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin: "-64px" }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
