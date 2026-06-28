"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Dashboard error:", error)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="max-w-lg space-y-4 text-center">
        <h2 className="text-xl font-semibold">Dashboard failed to load</h2>
        <p className="text-sm text-red-600 break-words">{error.message}</p>
        {error.stack ? (
          <pre className="max-h-64 overflow-auto rounded-md bg-gray-100 p-3 text-left text-xs whitespace-pre-wrap">
            {error.stack}
          </pre>
        ) : null}
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  )
}
