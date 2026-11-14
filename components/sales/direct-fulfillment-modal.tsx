"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Forward, Lock, AlertCircle, Truck } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"
import { updateSaleTracking } from "@/app/actions/sale-actions"
import { getMasterDataItems } from "@/app/actions/master-data-actions"

interface DirectFulfillmentModalProps {
  isOpen: boolean
  onClose: () => void
  sale: any
  deviceId: number
  onSuccess: () => void
}

export function DirectFulfillmentModal({
  isOpen,
  onClose,
  sale,
  deviceId,
  onSuccess,
}: DirectFulfillmentModalProps) {
  const { toast } = useToast()
  const [courierServices, setCourierServices] = useState<{ id: number; name: string }[]>([])
  const [selectedCourierName, setSelectedCourierName] = useState<string>("")
  const [trackingId, setTrackingId] = useState<string>("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingServices, setIsLoadingServices] = useState(false)

  // Initialize and fetch courier services on open
  useEffect(() => {
    if (!isOpen || !sale) return

    setSelectedCourierName(sale.courier_service_name || "")
    setTrackingId(sale.tracking_id || "")

    if (deviceId) {
      setIsLoadingServices(true)
      getMasterDataItems(deviceId, "courier")
        .then((res) => {
          if (res.success && Array.isArray(res.data)) {
            const list = res.data
              .filter((it: any) => it.is_active !== false && it.name)
              .map((it: any) => ({ id: it.id, name: it.name }))
            setCourierServices(list)
          }
        })
        .catch((err) => {
          console.error("Failed to load courier services:", err)
        })
        .finally(() => {
          setIsLoadingServices(false)
        })
    }
  }, [isOpen, sale, deviceId])

  if (!sale) return null

  const supplierName = sale.dropship_supplier || sale.supplier || ""
  const isDodTracking = Boolean(trackingId && trackingId.trim().toUpperCase().startsWith("DOD"))

  const handleSave = async () => {
    if (!sale.id) return
    setIsSubmitting(true)
    try {
      const res = await updateSaleTracking(
        sale.id,
        deviceId || sale.device_id || 0,
        trackingId.trim(),
        selectedCourierName.trim() || undefined
      )

      if (res.success) {
        notifySuccess(toast, `Direct order #${sale.id} fulfillment details updated`)
        onSuccess()
        onClose()
      } else {
        notifyError(toast, res.message || "Failed to update tracking details")
      }
    } catch (err: any) {
      console.error("handleSave direct fulfillment error:", err)
      notifyError(toast, err?.message || "Failed to update details")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-4 sm:p-5 border-b border-slate-200 bg-[#F1F4F9]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-100 text-purple-700 shadow-2xs">
              <Forward className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900">
                Direct Order Fulfillment
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                Job Card #{sale.id} • {sale.customer_name_override || sale.customer_name || "Customer"}
                {sale.customer_phone ? ` (${sale.customer_phone})` : ""}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-4 sm:p-5 space-y-4">
          {/* Supplier (Read-Only) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-slate-700">Supplier</Label>
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Lock className="h-3 w-3" /> Read Only
              </span>
            </div>
            <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800 flex items-center justify-between">
              <span>{supplierName || "No Supplier Assigned"}</span>
              <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                Dropship
              </span>
            </div>
          </div>

          {/* Courier Service (Dropdown) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">Courier Service</Label>
            <Select
              value={selectedCourierName}
              onValueChange={(val) => setSelectedCourierName(val)}
              disabled={isLoadingServices || isSubmitting}
            >
              <SelectTrigger className="h-9 text-xs border-slate-200 bg-white">
                <SelectValue placeholder={isLoadingServices ? "Loading services..." : "Select courier service"} />
              </SelectTrigger>
              <SelectContent>
                {selectedCourierName && !courierServices.some((c) => c.name === selectedCourierName) && (
                  <SelectItem value={selectedCourierName} className="text-xs">
                    {selectedCourierName}
                  </SelectItem>
                )}
                {courierServices.map((c) => (
                  <SelectItem key={c.id} value={c.name} className="text-xs">
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tracking ID (Input) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">Tracking ID / AWB</Label>
            <Input
              type="text"
              value={trackingId}
              onChange={(e) => setTrackingId(e.target.value)}
              placeholder="e.g. AWB123456789"
              className="h-9 text-xs border-slate-200 bg-white"
              disabled={isSubmitting}
            />
            {isDodTracking && (
              <p className="text-[11px] text-amber-600 flex items-center gap-1 pt-0.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Default Job Card number detected. Please replace with genuine courier tracking ID.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex flex-row items-center justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isSubmitting}
            className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold gap-1.5 shadow-2xs"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Truck className="h-3.5 w-3.5" /> Save Fulfillment
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

