"use client"

import { User, LogOut, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useWorkspace } from "./workspace-provider"

export function UserMenu() {
  const { authEmail, handleSignOut, handleVaultLock, vaultSessionId } = useWorkspace()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
          <User className="h-4 w-4" />
          <span className="sr-only">User menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium">{authEmail ?? "Authenticated"}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {vaultSessionId ? (
          <DropdownMenuItem onClick={() => void handleVaultLock()}>
            <Lock className="mr-2 h-4 w-4" />
            End session
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => void handleSignOut()}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
