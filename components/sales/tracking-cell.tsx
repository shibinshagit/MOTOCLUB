"use client"

import { useState } from "react"
import { TrackingDetailsModal } from "./tracking-details-modal"
import { updateSaleTracking } from "@/app/actions/sale-actions"
import { useToast } from "@/components/ui/use-toast"
import { Edit2, Copy, Check } from "lucide-react"

interface TrackingCellProps {
  saleId: number
  deviceId: number
  trackingId: string | null | undefined
  deliveryStatus?: string | null
  onUpdate?: () => void
}

export function TrackingCell({ saleId, deviceId, trackingId, deliveryStatus, onUpdate }: TrackingCellProps) {
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

  const handleSave = async (newTrackingId: string) => {
    const res = await updateSaleTracking(saleId, deviceId, newTrackingId)
    if (!res.success) {
      throw new Error(res.message)
    }
    toast({ title: "Success", description: "Tracking information updated." })
    setIsModalOpen(false)
    if (onUpdate) onUpdate()
  }

  // We can always allow update if there is a tracking ID or if the delivery status is Shipped/Delivered
  const canUpdate = !!trackingId || ["Shipped", "Delivered"].includes(deliveryStatus || "")

  return (
    <div className="flex items-center gap-2 group min-h-[1.5rem]" onClick={(e) => e.stopPropagation()}>
      {trackingId ? (
        <>
          <span className="font-mono text-xs text-slate-700">{trackingId}</span>
          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleCopy}
              className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100"
              title="Copy tracking ID"
            >
              {isCopied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-slate-100"
              title="Update tracking ID"
            >
              <Edit2 className="h-3 w-3" />
            </button>
          </div>
        </>
      ) : (
        <span className="text-xs text-slate-400 italic">
          —
          {canUpdate && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="ml-2 px-2 py-0.5 text-[10px] uppercase font-semibold tracking-wider text-blue-600 hover:bg-blue-50 rounded border border-transparent hover:border-blue-200 transition-colors opacity-0 group-hover:opacity-100"
            >
              Add Tracking
            </button>
          )}
        </span>
      )}

      {isModalOpen && (
        <TrackingDetailsModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSave}
          initialTrackingId={trackingId}
          currentDeliveryStatus={deliveryStatus || "Pending"}
          saleId={saleId}
          deviceId={deviceId}
        />
      )}
    </div>
  )
}
