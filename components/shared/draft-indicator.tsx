"use client"

import { Check, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DraftStatus } from "@/hooks/use-form-draft"

interface DraftIndicatorProps {
  status: DraftStatus
  hasDraft?: boolean
  lastSaved?: Date | null
  className?: string
}

export function DraftIndicator({
  status,
  hasDraft = false,
  lastSaved,
  className,
}: DraftIndicatorProps) {
  if (status === "saving") {
    return (
      <div className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground select-none", className)}>
        <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
        <span>Saving draft...</span>
      </div>
    )
  }

  if (status === "unsaved") {
    return (
      <div className={cn("inline-flex items-center gap-1.5 text-xs text-amber-600 select-none", className)}>
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
        <span>Unsaved draft</span>
      </div>
    )
  }

  if (status === "saved" || (status === "idle" && hasDraft)) {
    const formattedTime = lastSaved
      ? lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : null

    return (
      <div className={cn("inline-flex items-center gap-1.5 text-xs text-emerald-600 select-none", className)}>
        <Check className="h-3.5 w-3.5 text-emerald-600" />
        <span>Draft saved{formattedTime ? ` (${formattedTime})` : ""}</span>
      </div>
    )
  }

  return null
}
