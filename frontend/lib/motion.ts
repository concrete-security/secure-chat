/** Motion timing tokens for consistent animation across the app. */

export const DURATION = {
  fast: 0.15,
  normal: 0.25,
  slow: 0.35,
  entrance: 0.5,
  exit: 0.3,
} as const

export const EASE = {
  /** Decelerate curve — best for entrances */
  decelerate: [0.16, 1, 0.3, 1] as const,
  /** Standard ease — best for interactions */
  standard: [0.4, 0, 0.2, 1] as const,
  /** Accelerate curve — best for exits */
  accelerate: [0.4, 0, 1, 1] as const,
} as const

export const STAGGER = {
  fast: 0.05,
  normal: 0.08,
  slow: 0.12,
} as const
