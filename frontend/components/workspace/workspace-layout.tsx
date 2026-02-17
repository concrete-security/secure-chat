"use client"

import { useState } from "react"
import { ChatHeader } from "./chat-header"
import { ChatMessages } from "./chat-messages"
import { ChatInput } from "./chat-input"
import { Sidebar } from "./sidebar"

export function WorkspaceLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar open={sidebarOpen} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <ChatHeader onToggleSidebar={() => setSidebarOpen((prev) => !prev)} />
        <main className="flex flex-1 flex-col overflow-hidden">
          <ChatMessages />
          <ChatInput />
        </main>
      </div>
    </div>
  )
}
