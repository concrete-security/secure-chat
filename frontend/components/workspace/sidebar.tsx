"use client"

import { cn } from "@/lib/utils"
import { MessageSquare } from "lucide-react"

export function Sidebar({ open }: { open: boolean }) {
  return (
    <aside
      className={cn(
        "shrink-0 border-r bg-card transition-all duration-300 overflow-hidden",
        open ? "w-64" : "w-0",
      )}
    >
      <div className="flex h-full w-64 flex-col p-4">
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground">Conversations</h2>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">
            Conversation history coming soon.
          </p>
        </div>
      </div>
    </aside>
  )
}
