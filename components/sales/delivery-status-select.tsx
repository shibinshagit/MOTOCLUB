"use client"

import { useState } from "react"
import { updateSaleDeliveryStatus } from "@/app/actions/sale-actions"
import { useToast } from "@/components/ui/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { TrackingDetailsModal } from "./tracking-details-modal"

const VALID_TRANSITIONS: Record<string, string[]> = {
  "Pending": [], // No manual exits allowed
  "Paid": ["Packed"],
  "Packed": ["Sent"],
  "Sent": ["Shipped"],
  "Shipped": ["Delivered"],
  "Delivered": [],
  "Returned": [],
  "Failed": []
}

export function DeliveryStatusSelect({
  saleId,
  deviceId,
  currentStatus,
  customerName,
  customerPhone,
  trackingId,
  orderNumber,
  paymentStatus,
  isJobCard,
  onStatusChange
}: {
  saleId: number
  deviceId: number
  currentStatus: string
  customerName?: string
  customerPhone?: string
  trackingId?: string
  orderNumber?: string | number
  paymentStatus?: string
  isJobCard?: boolean
  onStatusChange?: (newStatus: string) => void
}) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(currentStatus || "Pending")
  
  // WhatsApp Notification State
  const [whatsappStep, setWhatsappStep] = useState<"none" | "prepare" | "confirm">("none")
  
  // Tracking Modal State
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false)

  const handleUpdateStatus = async (newStatus: string) => {
    setLoading(true)
    try {
      const res = await updateSaleDeliveryStatus(saleId, deviceId, newStatus)
      if (res.success) {
        setStatus(newStatus)
        toast({ title: "Success", description: `Delivery status updated to ${newStatus}.` })
        if (onStatusChange) {
          onStatusChange(newStatus)
        }
      } else {
        toast({ title: "Error", description: res.message, variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Error", description: "An error occurred", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateStatusWithTracking = async (trackingId: string) => {
    setLoading(true)
    try {
      const res = await updateSaleDeliveryStatus(saleId, deviceId, "Shipped", trackingId)
      if (res.success) {
        setStatus("Shipped")
        toast({ title: "Success", description: "Delivery status and tracking updated." })
        if (onStatusChange) {
          onStatusChange("Shipped")
        }
      } else {
        throw new Error(res.message)
      }
    } finally {
      setLoading(false)
      setIsTrackingModalOpen(false)
    }
  }

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value
    if (newStatus === status) return

    if (newStatus === "Sent") {
      setWhatsappStep("prepare")
      return // Halt the update until confirmation
    }

    if (newStatus === "Shipped") {
      setIsTrackingModalOpen(true)
      return // Halt the update until tracking is provided/saved
    }

    await handleUpdateStatus(newStatus)
  }

  const handleOpenWhatsApp = () => {
    // Format phone number to remove non-numeric chars if needed, though simple link works mostly
    const phone = customerPhone ? customerPhone.replace(/\D/g, '') : ''
    if (phone) {
      window.open(`https://wa.me/${phone}`, '_blank')
    } else {
      toast({ title: "Error", description: "Customer does not have a valid phone number.", variant: "destructive" })
    }
    setWhatsappStep("confirm")
  }

  const handleCancelWhatsappFlow = () => {
    setWhatsappStep("none")
  }

  const handleConfirmSent = async () => {
    setWhatsappStep("none")
    await handleUpdateStatus("Sent")
  }

  // Get color based on status for the border
  const getBorderColor = () => {
    switch (status) {
      case "Pending": return "border-yellow-300"
      case "Paid": return "border-blue-300"
      case "Packed": return "border-indigo-300"
      case "Sent": return "border-purple-300"
      case "Shipped": return "border-cyan-300"
      case "Delivered": return "border-green-400"
      case "Returned": return "border-red-300"
      default: return "border-gray-300"
    }
  }

  // Only show the current status and valid next statuses
  const baseTransitions = VALID_TRANSITIONS[currentStatus] || []
  const transitions = (currentStatus === "Pending" && isJobCard) ? ["Shipped"] : baseTransitions
  const availableOptions = [currentStatus, ...transitions]
  // Deduplicate in case currentStatus is somehow in the valid transitions
  const uniqueOptions = Array.from(new Set(availableOptions))

  const isDropdownDisabled = loading || uniqueOptions.length <= 1

  return (
    <>
      <div 
        className="inline-block" 
      >
        <select
          disabled={isDropdownDisabled}
          value={status}
          onChange={handleChange}
          className={`text-xs px-2 py-1 rounded-md border bg-white focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors ${getBorderColor()} ${isDropdownDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          onClick={(e) => e.stopPropagation()}
        >
          {uniqueOptions.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      {/* Prepare Customer Notification Dialog */}
      {isTrackingModalOpen && (
        <TrackingDetailsModal
          isOpen={isTrackingModalOpen}
          onClose={() => {
            setIsTrackingModalOpen(false)
            // Revert select back to old status since user cancelled tracking input
            setStatus(currentStatus || "Pending")
          }}
          onSave={handleUpdateStatusWithTracking}
          initialTrackingId={trackingId}
          currentDeliveryStatus={status}
          targetDeliveryStatus="Shipped"
          saleId={saleId}
          deviceId={deviceId}
        />
      )}

      <Dialog open={whatsappStep === "prepare"} onOpenChange={(open) => !open && handleCancelWhatsappFlow()}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Prepare Customer Notification</DialogTitle>
            <DialogDescription>
              Before marking this order as "Sent", please send the product photos/videos to the customer.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2 text-sm text-slate-700">
            <div className="flex justify-between border-b pb-1">
              <span className="font-semibold">Customer Name:</span>
              <span>{customerName || "N/A"}</span>
            </div>
            <div className="flex justify-between border-b pb-1">
              <span className="font-semibold">Phone Number:</span>
              <span>{customerPhone || "N/A"}</span>
            </div>
            <div className="flex justify-between border-b pb-1">
              <span className="font-semibold">Tracking Number:</span>
              <span>{trackingId || "N/A"}</span>
            </div>
            <div className="flex justify-between border-b pb-1">
              <span className="font-semibold">Order Number:</span>
              <span>{orderNumber || saleId}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelWhatsappFlow}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleOpenWhatsApp}>Open WhatsApp</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Customer Notification Dialog */}
      <Dialog open={whatsappStep === "confirm"} onOpenChange={(open) => !open && handleCancelWhatsappFlow()}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Confirm Customer Notification</DialogTitle>
            <DialogDescription>
              Have you successfully sent the product photos/videos to the customer?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={handleCancelWhatsappFlow}>No, Not Yet</Button>
            <Button className="bg-violet-600 hover:bg-violet-700 text-white" onClick={handleConfirmSent}>Yes, Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
