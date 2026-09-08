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
  onSave: (trackingId: string, courierServiceName?: string) => Promise<void>
  initialTrackingId?: string | null
  initialCourierServiceName?: string | null
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
  initialCourierServiceName,
  currentDeliveryStatus,
  targetDeliveryStatus,
  saleId,
  deviceId,
}: TrackingDetailsModalProps) {
  const [trackingId, setTrackingId] = useState("")
  const [courierServiceName, setCourierServiceName] = useState("")
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const isShippingTransition = targetDeliveryStatus === "Shipping"

  // Reset/sync state when modal opens
  useEffect(() => {
    if (isOpen) {
      setTrackingId(initialTrackingId || "")
      setCourierServiceName(initialCourierServiceName || "")
    }
  }, [isOpen, initialTrackingId, initialCourierServiceName])

  const handleSave = async (overrideTrackingId?: string) => {
    const finalTrackingId = (overrideTrackingId !== undefined ? overrideTrackingId : trackingId).trim()

    if (!isShippingTransition && !finalTrackingId) {
      toast({ title: "Validation Error", description: "Tracking ID cannot be empty.", variant: "destructive" })
      return
    }

    setLoading(true)
    try {
      await onSave(finalTrackingId, courierServiceName.trim() || undefined)
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save tracking information.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const title = isShippingTransition 
    ? "Shipment Tracking (Optional)" 
    : "Update Tracking Information"

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !loading && onClose()}>
      <DialogContent onClick={(e) => e.stopPropagation()} className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="tracking-id">
              Tracking ID {isShippingTransition && <span className="text-xs text-slate-400 font-normal">(Optional)</span>}
            </Label>
            <Input
              id="tracking-id"
              placeholder="e.g. TRK123456789 (leave blank to add later)"
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
              {isShippingTransition 
                ? "The order can be set to Shipping now even if the Tracking ID is not available yet. You can add it later." 
                : "Enter the shipment tracking number provided by the courier."}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="courier-service">
              Courier Service <span className="text-xs text-slate-400 font-normal">(Optional)</span>
            </Label>
            <Input
              id="courier-service"
              placeholder="e.g. Trackon, DTDC, ST Courier, A1 Parcel"
              value={courierServiceName}
              onChange={(e) => setCourierServiceName(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          {isShippingTransition && !trackingId.trim() ? (
            <Button onClick={() => handleSave("")} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {loading ? "Updating..." : "Set to Shipping"}
            </Button>
          ) : (
            <Button onClick={() => handleSave()} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {loading ? "Saving..." : isShippingTransition ? "Save & Set to Shipping" : "Save"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
