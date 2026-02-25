"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { MessageSquare, Settings2 } from "lucide-react"

export function Sidebar({ open }: { open: boolean }) {
  const pathname = usePathname()

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
        <div className="border-t pt-3">
          <Link
            href="/apps/agents"
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
              pathname === "/apps/agents"
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <Settings2 className="h-4 w-4" />
            Private Agents
          </Link>
        </div>
      </div>
    </aside>
  )
}
