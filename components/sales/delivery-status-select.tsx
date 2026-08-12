"use client"

import { useState, useEffect } from "react"
import { updateSaleDeliveryStatus, getSaleDetails } from "@/app/actions/sale-actions"
import { useToast } from "@/components/ui/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { TrackingDetailsModal } from "./tracking-details-modal"
import { AlertTriangle, RotateCcw, Package } from "lucide-react"
import { JobCardWhatsappConfirmation } from "@/components/shared/job-card/job-card-whatsapp-confirmation"

const VALID_TRANSITIONS: Record<string, string[]> = {
  "Pending": [], // No manual exits allowed
  "Paid": ["Packed", "Returned"],
  "Packed": ["Sent", "Returned"],
  "Sent": ["Shipping", "Returned"],
  "Shipping": ["Delivered", "Returned"],
  "Delivered": ["Returned"],
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
  userRole,
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
  userRole?: "admin" | "staff"
  onStatusChange?: (newStatus: string) => void
}) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(currentStatus || "Pending")

  // Keep internal status state in sync when parent prop updates
  useEffect(() => {
    setStatus(currentStatus || "Pending")
  }, [currentStatus])
  
  // WhatsApp Notification State
  const [whatsappStep, setWhatsappStep] = useState<"none" | "prepare" | "confirm">("none")
  
  // Shipping WhatsApp Notification State
  const [shippingWhatsappData, setShippingWhatsappData] = useState<{
    newTrackingId: string
    customerName: string
    customerPhone: string
    shippingAddress: string
    totalAmount: number
    products: { productName: string }[]
  } | null>(null)

  // Tracking Modal State
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false)

  // Return Confirmation State
  const [returnConfirmOpen, setReturnConfirmOpen] = useState(false)

  const handleUpdateStatus = async (newStatus: string) => {
    const previousStatus = status
    setStatus(newStatus) // Optimistic instant update
    setLoading(true)
    try {
      const res = await updateSaleDeliveryStatus(saleId, deviceId, newStatus)
      if (res.success) {
        toast({ title: "Success", description: res.message || `Delivery status updated to ${newStatus}.` })
        if (onStatusChange) {
          onStatusChange(newStatus)
        }
      } else {
        setStatus(previousStatus) // Revert on error
        toast({ title: "Error", description: res.message, variant: "destructive" })
      }
    } catch (err: any) {
      setStatus(previousStatus) // Revert on error
      toast({ title: "Error", description: "An error occurred", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateStatusWithTracking = async (newTrackingId: string) => {
    const previousStatus = status
    setIsTrackingModalOpen(false) // Close input modal immediately
    setStatus("Shipping") // Optimistic instant update

    // INSTANTLY open the WhatsApp notification modal with new tracking ID (0ms delay!)
    setShippingWhatsappData({
      newTrackingId,
      customerName: customerName || "Customer",
      customerPhone: customerPhone || "",
      shippingAddress: "",
      totalAmount: 0,
      products: [{ productName: "Order Item" }],
    })

    setLoading(true)
    try {
      const res = await updateSaleDeliveryStatus(saleId, deviceId || 0, "Shipping", newTrackingId)
      if (res.success) {
        toast({ title: "Success", description: "Delivery status updated to Shipping." })

        // Fetch full sale items asynchronously to enrich the modal payload
        getSaleDetails(saleId)
          .then((saleRes) => {
            if (saleRes.success && saleRes.data) {
              const saleData = saleRes.data.sale
              const itemsData = saleRes.data.items || []
              const prodList = itemsData.map((item: any) => ({
                productName: item.product_name || item.name || "Product",
              }))

              setShippingWhatsappData((prev) =>
                prev
                  ? {
                      ...prev,
                      customerName: saleData.customer_name || prev.customerName,
                      customerPhone: saleData.customer_phone || prev.customerPhone,
                      shippingAddress: saleData.customer_address || prev.shippingAddress,
                      totalAmount: Number(saleData.total_amount || prev.totalAmount),
                      products: prodList.length > 0 ? prodList : prev.products,
                    }
                  : null
              )
            }
          })
          .catch(() => {})
      } else {
        setStatus(previousStatus)
        setShippingWhatsappData(null)
        toast({ title: "Error", description: res.message || "Failed to update tracking ID.", variant: "destructive" })
      }
    } catch (err: any) {
      setStatus(previousStatus)
      setShippingWhatsappData(null)
      toast({ title: "Error", description: err.message || "An error occurred", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value
    if (newStatus === status) return

    if (newStatus === "Returned") {
      setReturnConfirmOpen(true)
      return // Show confirmation dialog first
    }

    if (newStatus === "Shipping") {
      setIsTrackingModalOpen(true)
      return // Halt update until tracking ID is entered
    }

    await handleUpdateStatus(newStatus)
  }

  const handleConfirmReturn = async () => {
    setReturnConfirmOpen(false)
    await handleUpdateStatus("Returned")
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
      case "Shipping": return "border-cyan-300"
      case "Delivered": return "border-green-400"
      case "Returned": return "border-red-300"
      default: return "border-gray-300"
    }
  }

  // Enable all standard delivery status options for full flexibility
  const ALL_STATUS_OPTIONS = ["Pending", "Paid", "Packed", "Sent", "Shipping", "Delivered", "Returned", "Failed"]
  const uniqueOptions = Array.from(new Set([status, currentStatus, ...ALL_STATUS_OPTIONS])).filter(Boolean)

  const isDropdownDisabled = loading

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

      {/* Return Confirmation Dialog */}
      <Dialog open={returnConfirmOpen} onOpenChange={(open) => !open && setReturnConfirmOpen(false)}>
        <DialogContent onClick={(e) => e.stopPropagation()} className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Confirm Order Return
            </DialogTitle>
            <DialogDescription className="text-slate-600 mt-2">
              This action <strong>cannot be undone</strong>. Please confirm you want to mark this order as Returned.
            </DialogDescription>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <div className="rounded-lg border border-red-100 bg-red-50 p-3 space-y-2">
              <p className="text-sm font-semibold text-red-800 flex items-center gap-1.5">
                <RotateCcw className="h-4 w-4" /> What will happen:
              </p>
              <ul className="text-sm text-red-700 space-y-1 list-disc list-inside">
                <li>Order status will be set to <strong>Cancelled</strong></li>
                <li>All product stock will be <strong>fully restored</strong> to inventory</li>
                <li>Stock history will be updated with a return entry</li>
                <li>This order will be removed from the active order list</li>
              </ul>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Order #</span>
                <span className="font-mono font-semibold">{orderNumber || saleId}</span>
              </div>
              {customerName && (
                <div className="flex justify-between text-slate-600">
                  <span>Customer</span>
                  <span className="font-medium">{customerName}</span>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReturnConfirmOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmReturn}
              disabled={loading}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {loading ? "Processing..." : "Yes, Mark as Returned"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          targetDeliveryStatus="Shipping"
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

      {/* Shipping WhatsApp Notification Dialog with New Tracking ID */}
      {shippingWhatsappData && (
        <Dialog open={true} onOpenChange={(open) => !open && setShippingWhatsappData(null)}>
          <DialogContent className="sm:max-w-lg p-0" onClick={(e) => e.stopPropagation()}>
            <JobCardWhatsappConfirmation
              isShipping={true}
              saleId={saleId}
              trackingId={shippingWhatsappData.newTrackingId}
              deviceId={deviceId || 0}
              customerName={shippingWhatsappData.customerName}
              customerPhone={shippingWhatsappData.customerPhone}
              shippingAddress={shippingWhatsappData.shippingAddress}
              products={shippingWhatsappData.products}
              totalAmount={shippingWhatsappData.totalAmount}
              onComplete={() => {
                setShippingWhatsappData(null)
                if (onStatusChange) {
                  onStatusChange("Shipping")
                }
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
