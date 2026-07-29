"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { updateSaleTracking } from "@/app/actions/sale-actions"

interface TrackingDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (trackingId: string) => Promise<void>
  initialTrackingId?: string | null
  currentDeliveryStatus?: string
  targetDeliveryStatus?: string
  saleId: number
  deviceId: number
}

export function TrackingDetailsModal({
  isOpen,
  onClose,
  onSave,
  initialTrackingId,
  currentDeliveryStatus,
  targetDeliveryStatus,
  saleId,
  deviceId,
}: TrackingDetailsModalProps) {
  const [trackingId, setTrackingId] = useState("")
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  // Reset/sync state when modal opens
  useEffect(() => {
    if (isOpen) {
      setTrackingId(initialTrackingId || "")
    }
  }, [isOpen, initialTrackingId])

  const handleSave = async () => {
    if (!trackingId.trim()) {
      toast({ title: "Validation Error", description: "Tracking ID cannot be empty.", variant: "destructive" })
      return
    }

    setLoading(true)
    try {
      await onSave(trackingId.trim())
      // The parent handles closing and showing success toast.
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save tracking information.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const title = targetDeliveryStatus 
    ? `Shipment Tracking - ${targetDeliveryStatus}` 
    : "Update Tracking Information"

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !loading && onClose()}>
      <DialogContent onClick={(e) => e.stopPropagation()} className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="tracking-id">Tracking ID</Label>
            <Input
              id="tracking-id"
              placeholder="e.g. TRK123456789"
              value={trackingId}
              onChange={(e) => setTrackingId(e.target.value)}
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !loading) {
                  e.preventDefault()
                  handleSave()
                }
              }}
            />
            <p className="text-xs text-slate-500">
              Enter the shipment tracking number or code provided by the courier.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
