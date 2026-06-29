"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type PurchaseViewMode = "info" | "entry"

interface PurchaseViewFlipProps {
  activeView: PurchaseViewMode
  listView: ReactNode
  entryView: ReactNode
}

export function PurchaseViewFlip({ activeView, listView, entryView }: PurchaseViewFlipProps) {
  const showEntry = activeView === "entry"

  return (
    <div className="relative w-full [perspective:1200px]">
      <div
        className={cn(
          "relative w-full transition-transform duration-700 ease-in-out [transform-style:preserve-3d]",
          showEntry && "[transform:rotateY(180deg)]",
        )}
      >
        <div
          className={cn(
            "w-full [backface-visibility:hidden]",
            showEntry ? "pointer-events-none invisible absolute inset-0" : "relative",
          )}
          aria-hidden={showEntry}
        >
          {listView}
        </div>
        <div
          className={cn(
            "w-full [backface-visibility:hidden] [transform:rotateY(180deg)]",
            !showEntry ? "pointer-events-none invisible absolute inset-0" : "relative",
          )}
          aria-hidden={!showEntry}
        >
          {entryView}
        </div>
      </div>
    </div>
  )
}
