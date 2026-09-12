"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { RefreshCw, Truck, Copy, ExternalLink, MessageCircle, Printer, XCircle, CheckCircle, Clock } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { buildTrackingUrl } from "@/lib/sale-shipping"
import { updateReplacementShipmentStatus, cancelReplacementShipment } from "@/app/actions/replacement-actions"
import { getAllGlobalCouriers } from "@/app/actions/master-data-actions"
import { ReplacementWhatsappModal } from "./replacement-whatsapp-modal"
import { format } from "date-fns"

interface ReplacementShipmentCardProps {
  replacement: any
  originalSaleId: number
  customerName?: string
  customerPhone?: string
  shippingAddress?: string
  trackingUrlTemplate?: string | null
  masterCouriers?: Array<{ id: number; name: string }>
  onRefresh?: () => void
  readOnly?: boolean
}

function ReplacementStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Pending: "bg-amber-100 text-amber-800 border-amber-300",
    Packed: "bg-blue-100 text-blue-800 border-blue-300",
    Sent: "bg-indigo-100 text-indigo-800 border-indigo-300",
    Shipping: "bg-purple-100 text-purple-800 border-purple-300",
    Shipped: "bg-violet-100 text-violet-800 border-violet-300",
    "In transit": "bg-sky-100 text-sky-800 border-sky-300",
    Delivered: "bg-emerald-100 text-emerald-800 border-emerald-300",
    Returned: "bg-rose-100 text-rose-800 border-rose-300",
    Failed: "bg-rose-100 text-rose-800 border-rose-300",
    Cancelled: "bg-slate-200 text-slate-700 border-slate-300",
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
        styles[status] || "bg-slate-100 text-slate-800 border-slate-300"
      }`}
    >
      <Clock className="h-3 w-3" />
      {status || "Pending"}
    </span>
  )
}

export function ReplacementShipmentCard({
  replacement,
  originalSaleId,
  customerName = "Customer",
  customerPhone = "",
  shippingAddress = "",
  trackingUrlTemplate = null,
  masterCouriers = [],
  onRefresh,
  readOnly = false,
}: ReplacementShipmentCardProps) {
  const { toast } = useToast()

  const [couriers, setCouriers] = useState<Array<{ id: number; name: string }>>(masterCouriers || [])
  const [isUpdatingTracking, setIsUpdatingTracking] = useState(false)
  const [newStatus, setNewStatus] = useState<string>(replacement.status || replacement.delivery_status || "Pending")
  const [newCourierPartnerId, setNewCourierPartnerId] = useState<string>(
    replacement.courier_partner_id ? String(replacement.courier_partner_id) : ""
  )
  const [newCourierServiceName, setNewCourierServiceName] = useState<string>(replacement.courier_service_name || "")
  const [newTrackingId, setNewTrackingId] = useState<string>(replacement.tracking_id || "")
  const [isSaving, setIsSaving] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [showWhatsappModal, setShowWhatsappModal] = useState(false)

  const trackingUrl = buildTrackingUrl(replacement.tracking_url_template || trackingUrlTemplate, replacement.tracking_id)

  const handleCopyTracking = () => {
    if (!replacement.tracking_id) return
    navigator.clipboard.writeText(replacement.tracking_id)
    toast({ title: "Tracking ID Copied", description: replacement.tracking_id })
  }

  const handleSaveTrackingUpdate = async () => {
    setIsSaving(true)
    try {
      const res = await updateReplacementShipmentStatus({
        replacementId: replacement.id,
        deliveryStatus: newStatus,
        trackingId: newTrackingId,
        courierPartnerId: newCourierPartnerId ? Number(newCourierPartnerId) : null,
        courierServiceName: newCourierServiceName.trim() || null,
      })

      if (res.success) {
        toast({ title: "Updated", description: "Replacement shipment status updated." })
        setIsUpdatingTracking(false)
        if (onRefresh) onRefresh()
      } else {
        toast({ title: "Error", description: res.message, variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to update details.", variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelShipment = async () => {
    if (!confirm(`Are you sure you want to cancel replacement shipment ${replacement.replacement_number}? Inventory will be restored.`)) {
      return
    }

    setIsCancelling(true)
    try {
      const res = await cancelReplacementShipment(replacement.id)
      if (res.success) {
        toast({ title: "Cancelled", description: res.message })
        if (onRefresh) onRefresh()
      } else {
        toast({ title: "Error", description: res.message, variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to cancel replacement.", variant: "destructive" })
    } finally {
      setIsCancelling(false)
    }
  }

  useEffect(() => {
    if (isUpdatingTracking) {
      async function loadCouriers() {
        try {
          const targetDeviceId = replacement.device_id || 1
          const { getDeviceStaff } = await import("@/app/actions/staff-actions")
          const { getMasterDataItems } = await import("@/app/actions/master-data-actions")

          const [staffRes, masterRes] = await Promise.all([
            getDeviceStaff(targetDeviceId),
            getMasterDataItems(targetDeviceId, "courier"),
          ])

          let partnerList: Array<{ id: number; name: string }> = []

          if (staffRes.success && Array.isArray(staffRes.data)) {
            partnerList = staffRes.data
              .filter((s: any) => s.role === "partner" && s.is_active !== false)
              .map((s: any) => ({ id: Number(s.id), name: String(s.name) }))
          }

          const staffNameSet = new Set(partnerList.map((p) => p.name.toLowerCase().trim()))

          if (masterRes.success && Array.isArray(masterRes.data)) {
            masterRes.data.forEach((c: any) => {
              if (c.is_active !== false && c.name && !staffNameSet.has(String(c.name).toLowerCase().trim())) {
                partnerList.push({ id: Number(c.id), name: String(c.name) })
              }
            })
          }

          if (masterCouriers && masterCouriers.length > 0) {
            masterCouriers.forEach((mc) => {
              if (mc.name && !partnerList.some((p) => p.id === mc.id || p.name.toLowerCase().trim() === mc.name.toLowerCase().trim())) {
                partnerList.push({ id: Number(mc.id), name: String(mc.name) })
              }
            })
          }

          setCouriers(partnerList)
        } catch (err) {
          console.error("Failed to load couriers in replacement shipment card:", err)
        }
      }

      loadCouriers()
    }
  }, [isUpdatingTracking, replacement.device_id, masterCouriers])

  return (
    <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50/50 via-white to-slate-50 p-4 shadow-sm space-y-3 relative overflow-hidden">
      {/* Header Badge */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-blue-600 p-1.5 text-white">
            <RefreshCw className="h-4 w-4 animate-spin-slow" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 text-sm">{replacement.replacement_number}</span>
              <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200 text-[10px] font-medium">
                Replacement Shipment
              </Badge>
            </div>
            <p className="text-[11px] text-slate-500">
              Linked to Original Order <span className="font-semibold text-slate-700">#{originalSaleId}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ReplacementStatusBadge status={replacement.status || replacement.delivery_status || "Pending"} />
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[11px] font-bold">
            ₹0 (No Payment)
          </Badge>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
        <div>
          <span className="text-[10px] font-semibold uppercase text-slate-400">Reason</span>
          <p className="font-semibold text-slate-800 mt-0.5">{replacement.reason || "Replacement"}</p>
        </div>

        <div>
          <span className="text-[10px] font-semibold uppercase text-slate-400">Courier / Service</span>
          <p className="font-medium text-slate-800 mt-0.5">
            {replacement.courier_partner_name || replacement.courier_service_name || "Standard Courier"}
          </p>
        </div>

        <div>
          <span className="text-[10px] font-semibold uppercase text-slate-400">Tracking ID</span>
          {replacement.tracking_id ? (
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-mono font-bold text-blue-900 bg-blue-100/70 px-1.5 py-0.5 rounded text-[11px]">
                {replacement.tracking_id}
              </span>
              <button
                type="button"
                onClick={handleCopyTracking}
                title="Copy Tracking ID"
                className="text-slate-400 hover:text-slate-600 p-0.5"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              {trackingUrl && (
                <a
                  href={trackingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:text-blue-800 p-0.5"
                  title="Track Shipment"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          ) : (
            <p className="text-slate-400 italic mt-0.5">Not assigned yet</p>
          )}
        </div>

        <div>
          <span className="text-[10px] font-semibold uppercase text-slate-400">Shipping Date</span>
          <p className="font-medium text-slate-800 mt-0.5">
            {replacement.shipping_date
              ? format(new Date(replacement.shipping_date), "MMM dd, yyyy")
              : "Pending Dispatch"}
          </p>
        </div>

        <div>
          <span className="text-[10px] font-semibold uppercase text-slate-400">Created Date</span>
          <p className="font-medium text-slate-800 mt-0.5">
            {replacement.created_at
              ? format(new Date(replacement.created_at), "MMM dd, yyyy HH:mm")
              : "N/A"}
          </p>
        </div>

        {replacement.created_by_name && (
          <div>
            <span className="text-[10px] font-semibold uppercase text-slate-400">Created By</span>
            <p className="font-medium text-slate-800 mt-0.5">{replacement.created_by_name}</p>
          </div>
        )}
      </div>

      {/* Item List */}
      <div className="bg-white rounded-lg border p-3 text-xs space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Items in Replacement</p>
        <div className="divide-y">
          {(replacement.items || []).map((item: any) => (
            <div key={item.id} className="py-1.5 flex items-center justify-between">
              <div>
                <span className="font-semibold text-slate-900">{item.product_name || `Product #${item.product_id}`}</span>
                {item.variant_name && <span className="text-slate-500 ml-1">({item.variant_name})</span>}
                {item.batch_number && <span className="text-slate-400 ml-1 font-mono text-[10px]">[Batch: {item.batch_number}]</span>}
              </div>
              <div className="font-mono font-bold text-blue-800">× {item.quantity}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Action Toolbar */}
      {!readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsUpdatingTracking(true)}
              className="h-8 text-xs bg-white border-slate-300"
            >
              <Truck className="mr-1.5 h-3.5 w-3.5 text-blue-600" />
              Update Logistics & Status
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                import("@/lib/receipt-utils").then(({ printReplacementNote }) => {
                  printReplacementNote(replacement, {
                    id: originalSaleId,
                    customer_name: customerName,
                    customer_phone: customerPhone,
                    shipping_address: shippingAddress,
                  })
                })
              }}
              className="h-8 text-xs bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              <Printer className="mr-1.5 h-3.5 w-3.5 text-slate-600" />
              Print Note
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowWhatsappModal(true)}
              className="h-8 text-xs bg-[#25D366]/10 text-[#128C7E] border-[#25D366]/30 hover:bg-[#25D366]/20"
            >
              <MessageCircle className="mr-1.5 h-3.5 w-3.5 text-[#25D366]" />
              WhatsApp
            </Button>
          </div>

          {replacement.status !== "Cancelled" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isCancelling}
              onClick={handleCancelShipment}
              className="h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
            >
              <XCircle className="mr-1 h-3.5 w-3.5" />
              Cancel Shipment
            </Button>
          )}
        </div>
      )}

      {/* Edit Logistics Dialog */}
      <Dialog open={isUpdatingTracking} onOpenChange={(open) => !open && setIsUpdatingTracking(false)}>
        <DialogContent className="max-w-md w-full p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Update Replacement Logistics</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 my-2 text-xs">
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700">Delivery Status</label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-xs"
              >
                {["Pending", "Packed", "Sent", "Direct", "Shipping", "Shipped", "In transit", "Delivered", "Returned", "Failed", "Cancelled"].map(
                  (st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  )
                )}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700">Courier Partner</label>
              <select
                value={newCourierPartnerId}
                onChange={(e) => {
                  setNewCourierPartnerId(e.target.value)
                  const selectedCp = couriers.find((c) => String(c.id) === e.target.value)
                  if (selectedCp && !newCourierServiceName) {
                    setNewCourierServiceName(selectedCp.name)
                  }
                }}
                className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 text-xs"
              >
                <option value="">-- Select Courier Partner --</option>
                {couriers.map((cp) => (
                  <option key={cp.id} value={String(cp.id)}>
                    {cp.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700">Courier Service Name</label>
              <Input
                type="text"
                placeholder="e.g. Express, Trackon, BlueDart"
                value={newCourierServiceName}
                onChange={(e) => setNewCourierServiceName(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-slate-700">Tracking ID / AWB</label>
              <Input
                type="text"
                placeholder="Enter tracking ID"
                value={newTrackingId}
                onChange={(e) => setNewTrackingId(e.target.value)}
                className="h-9 text-xs font-mono"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsUpdatingTracking(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveTrackingUpdate} disabled={isSaving} className="bg-blue-600 text-white">
              Save Details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Modal */}
      <ReplacementWhatsappModal
        isOpen={showWhatsappModal}
        onClose={() => setShowWhatsappModal(false)}
        originalSaleId={originalSaleId}
        replacementNumber={replacement.replacement_number}
        reason={replacement.reason || "Replacement"}
        customerName={customerName}
        customerPhone={customerPhone}
        shippingAddress={shippingAddress || replacement.shipping_address || ""}
        courierPartnerName={replacement.courier_partner_name || replacement.courier_service_name}
        trackingId={replacement.tracking_id}
        trackingUrlTemplate={replacement.tracking_url_template || trackingUrlTemplate}
        items={(replacement.items || []).map((i: any) => ({
          productName: i.product_name || `Product #${i.product_id}`,
          variantName: i.variant_name,
          quantity: Number(i.quantity) || 1,
        }))}
      />
    </div>
  )
}
