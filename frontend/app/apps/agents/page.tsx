"use client"

import { AdminPanel } from "@/components/apps/agents-panel"
import { WorkspaceProvider } from "@/components/workspace/workspace-provider"

export default function AgentsPage() {
  return (
    <WorkspaceProvider>
      <div className="flex h-screen flex-col">
        <header className="flex h-12 items-center border-b px-4">
          <h1 className="text-sm font-medium">Private Agents</h1>
        </header>
        <div className="flex-1 overflow-hidden">
          <AdminPanel />
        </div>
      </div>
    </WorkspaceProvider>
  )
}
