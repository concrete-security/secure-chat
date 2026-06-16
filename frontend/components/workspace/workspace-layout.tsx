"use client"

import { useState } from "react"
import { ChatHeader } from "./chat-header"
import { ChatMessages } from "./chat-messages"
import { ChatInput } from "./chat-input"
import { Sidebar } from "./sidebar"
import { AdminPanel } from "@/components/apps/agents-panel"

export type WorkspaceView = "chat" | "configure"

export function WorkspaceLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeView, setActiveView] = useState<WorkspaceView>("chat")

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar open={sidebarOpen} activeView={activeView} onChangeView={setActiveView} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <ChatHeader onToggleSidebar={() => setSidebarOpen((prev) => !prev)} />
        <main className="flex flex-1 flex-col overflow-hidden">
          {activeView === "chat" ? (
            <>
              <ChatMessages />
              <ChatInput />
            </>
          ) : (
            <AdminPanel />
          )}
        </main>
      </div>
    </div>
  )
}
