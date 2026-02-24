"use client"

import { WorkspaceProvider } from "@/components/workspace/workspace-provider"
import { OnboardingGate } from "@/components/workspace/onboarding-gate"
import { WorkspaceLayout } from "@/components/workspace/workspace-layout"

export default function PersonalAgentsWorkspacePage() {
  return (
    <WorkspaceProvider>
      <OnboardingGate>
        <WorkspaceLayout />
      </OnboardingGate>
    </WorkspaceProvider>
  )
}
