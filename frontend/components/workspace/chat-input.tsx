"use client"

import { Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useWorkspace } from "./workspace-provider"

export function ChatInput() {
  const { input, setInput, isSending, runtimeError, secureChannelReady, manifest, sendMessage } =
    useWorkspace()

  return (
    <div className="border-t bg-background px-4 py-3">
      <form onSubmit={sendMessage} className="mx-auto flex max-w-3xl flex-col gap-2">
        {runtimeError ? (
          <p className="text-sm text-destructive">{runtimeError}</p>
        ) : null}
        <div className="flex items-end gap-2 rounded-xl border bg-card p-2">
          <textarea
            className="min-h-[44px] max-h-[200px] flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Message OpenClaw..."
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                const form = e.currentTarget.closest("form")
                if (form) form.requestSubmit()
              }
            }}
            disabled={!manifest || !secureChannelReady || isSending}
          />
          <Button
            type="submit"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-lg"
            disabled={!manifest || !secureChannelReady || isSending || input.trim().length === 0}
          >
            <Send className="h-4 w-4" />
            <span className="sr-only">Send message</span>
          </Button>
        </div>
      </form>
    </div>
  )
}
