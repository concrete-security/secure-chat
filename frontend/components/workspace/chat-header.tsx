"use client"

import { useState } from "react"
import { PanelLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ModelSelector } from "./model-selector"
import { TrustBadge } from "./trust-badge"
import { SecurityDrawer } from "./security-drawer"
import { UserMenu } from "./user-menu"

export function ChatHeader({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <>
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleSidebar}>
            <PanelLeft className="h-4 w-4" />
            <span className="sr-only">Toggle sidebar</span>
          </Button>
          <ModelSelector />
        </div>
        <div className="flex items-center gap-2">
          <TrustBadge onClick={() => setDrawerOpen(true)} />
          <UserMenu />
        </div>
      </header>
      <SecurityDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </>
  )
}
