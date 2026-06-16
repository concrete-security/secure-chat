"use client"

import { cn } from "@/lib/utils"
import { Markdown } from "@/components/markdown"
import { StreamingIndicator } from "./streaming-indicator"
import type { Message } from "@/lib/workspace-types"

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user"

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-card border border-border"
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
        ) : message.streaming && !message.content ? (
          <StreamingIndicator />
        ) : (
          <Markdown content={message.content || ""} className="text-sm" />
        )}
      </div>
    </div>
  )
}
