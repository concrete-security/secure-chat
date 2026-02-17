"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AVAILABLE_MODELS } from "@/lib/workspace-types"
import { useWorkspace } from "./workspace-provider"

export function ModelSelector() {
  const { selectedModel, setSelectedModel, isSending } = useWorkspace()

  return (
    <Select value={selectedModel} onValueChange={setSelectedModel} disabled={isSending}>
      <SelectTrigger className="h-8 w-[180px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {AVAILABLE_MODELS.map((model) => (
          <SelectItem key={model.id} value={model.id} className="text-xs">
            {model.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
