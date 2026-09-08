"use client"

import { useState } from "react"
import { TrackingDetailsModal } from "./tracking-details-modal"
import { updateSaleTracking } from "@/app/actions/sale-actions"
import { useToast } from "@/components/ui/use-toast"
import { Edit2, Copy, Check, ExternalLink, Plus } from "lucide-react"
import { generateCourierTrackingUrl, getPublicTrackingUrl } from "@/lib/shipping/tracking-url"

interface TrackingCellProps {
  saleId: number
  deviceId: number
  trackingId: string | null | undefined
  deliveryStatus?: string | null
  courierServiceName?: string | null
  trackingUrlTemplate?: string | null
  onUpdate?: () => void
}

export function TrackingCell({ 
  saleId, 
  deviceId, 
  trackingId, 
  deliveryStatus, 
  courierServiceName,
  trackingUrlTemplate,
  onUpdate 
}: TrackingCellProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const { toast } = useToast()

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (trackingId) {
      navigator.clipboard.writeText(trackingId)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    }
  }

  const handleSave = async (newTrackingId: string, newCourierService?: string) => {
    const res = await updateSaleTracking(saleId, deviceId, newTrackingId, newCourierService)
    if (!res.success) {
      throw new Error(res.message)
    }
    toast({ title: "Success", description: "Tracking information updated." })
    setIsModalOpen(false)
    if (onUpdate) onUpdate()
  }

  const trackUrl = trackingId?.trim()
    ? (generateCourierTrackingUrl(courierServiceName, trackingId, trackingUrlTemplate) || getPublicTrackingUrl(trackingId))
    : null

  const handleTrackShipment = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (trackUrl) {
      window.open(trackUrl, "_blank")
    }
  }

  return (
    <div className="flex flex-col gap-1 min-h-[1.5rem]" onClick={(e) => e.stopPropagation()}>
      {trackingId ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
            {trackingId}
          </span>
          <button
            onClick={handleCopy}
            className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 transition-colors"
            title="Copy tracking ID"
          >
            {isCopied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50 transition-colors"
            title="Update tracking ID"
          >
            <Edit2 className="h-3 w-3" />
          </button>
          {trackUrl && (
            <button
              onClick={handleTrackShipment}
              className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-1.5 py-0.5 rounded transition-colors"
              title="Track shipment with carrier"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              Track
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400 italic">—</span>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors"
            title="Add tracking ID"
          >
            <Plus className="h-2.5 w-2.5" />
            Add Tracking
          </button>
        </div>
      )}

      {isModalOpen && (
        <TrackingDetailsModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSave}
          initialTrackingId={trackingId}
          initialCourierServiceName={courierServiceName}
          currentDeliveryStatus={deliveryStatus || "Pending"}
          saleId={saleId}
          deviceId={deviceId}
        />
      )}
    </div>
  )
}
