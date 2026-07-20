"use client"

import { Button } from "@/components/ui/button"
import { CheckCircle } from "lucide-react"

interface JobCardSuccessProps {
  trackingId: string
  saleId: number
  onCreateNew: () => void
}

export function JobCardSuccess({ trackingId, saleId, onCreateNew }: JobCardSuccessProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 space-y-6 text-center animate-in fade-in zoom-in duration-300">
      <div className="rounded-full bg-green-100 p-6">
        <CheckCircle className="h-16 w-16 text-green-600" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">Job Card Created</h2>
        <p className="text-muted-foreground text-lg">
          Job Card #{saleId} has been successfully created.
        </p>
      </div>
      <div className="bg-muted px-6 py-3 rounded-lg border font-mono text-lg">
        {trackingId}
      </div>
      <div className="pt-6 flex gap-4">
        <Button onClick={onCreateNew} size="lg">
          Create Another
        </Button>
      </div>
    </div>
  )
}
