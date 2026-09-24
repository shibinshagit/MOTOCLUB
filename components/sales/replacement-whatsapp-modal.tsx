"use client"
import { openWhatsApp } from "@/lib/whatsapp-utils"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { CheckCircle2, MessageCircle, Copy, ExternalLink } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useSelector } from "react-redux"
import { selectDeviceName } from "@/store/slices/deviceSlice"
import { buildTrackingUrl } from "@/lib/sale-shipping"

interface ReplacementWhatsappModalProps {
  isOpen: boolean
  onClose: () => void
  originalSaleId: number
  replacementNumber: string
  reason: string
  customerName: string
  customerPhone: string
  shippingAddress: string
  courierPartnerName?: string | null
  trackingId?: string | null
  trackingUrlTemplate?: string | null
  items: Array<{ productName: string; variantName?: string; quantity: number }>
}

export function ReplacementWhatsappModal({
  isOpen,
  onClose,
  originalSaleId,
  replacementNumber,
  reason,
  customerName,
  customerPhone,
  shippingAddress,
  courierPartnerName,
  trackingId,
  trackingUrlTemplate,
  items,
}: ReplacementWhatsappModalProps) {
  const { toast } = useToast()
  const deviceName = useSelector(selectDeviceName) || "Moto Cart Online"

  const itemsFormatted = items
    .map((item, i) => `${i + 1}. ${item.productName}${item.variantName ? ` (${item.variantName})` : ""} × ${item.quantity}`)
    .join("\n")

  const trackingUrl = buildTrackingUrl(trackingUrlTemplate, trackingId)

  const trackingSection = trackingId?.trim()
    ? `\n\n🚚 Courier: ${courierPartnerName || "Courier Partner"}\n📦 Tracking ID: ${trackingId}${trackingUrl ? `\n⏱️ Track here: ${trackingUrl}` : ""}`
    : "\n\n⏱️ Tracking details will be shared as soon as dispatched."

  const whatsappText = `Dear ${customerName || "Customer"},

Great news! Your replacement shipment for order #${originalSaleId} has been created and processed by ${deviceName}. 🔄📦

📋 Replacement Details:
• Original Order ID: #${originalSaleId}
• Replacement ID: ${replacementNumber}
• Reason: ${reason}
• Item(s):
${itemsFormatted}

💰 Amount: ₹0 (No Payment Required)${trackingSection}

📍 Shipping Address:
${shippingAddress || "As provided"}

If you have any questions, feel free to reply to this message.
Thank you for shopping with us!

— ${deviceName}🚗✨`

  const handleSendWhatsapp = () => {
    const phoneNum = (customerPhone || "").replace(/\D/g, "")
    if (!phoneNum) {
      toast({
        title: "No Phone Number",
        description: "Customer does not have a valid phone number recorded.",
        variant: "destructive",
      })
      return
    }
    openWhatsApp(phoneNum, whatsappText)
  }

  const handleCopyText = () => {
    navigator.clipboard.writeText(whatsappText)
    toast({ title: "Copied", description: "WhatsApp message text copied to clipboard." })
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md w-full p-6">
        <DialogHeader className="text-center sm:text-left">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-emerald-100 p-2.5">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">Replacement Created</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Share shipment details with customer via WhatsApp
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 my-2">
          <div className="bg-slate-950 text-emerald-400 p-3.5 rounded-lg text-xs font-mono whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed border border-slate-800">
            {whatsappText}
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button
              onClick={handleSendWhatsapp}
              className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-semibold py-5"
            >
              <MessageCircle className="mr-2 h-5 w-5" />
              Send WhatsApp Notification
            </Button>

            <div className="flex gap-2">
              <Button onClick={handleCopyText} variant="outline" className="flex-1 text-xs">
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Copy Text
              </Button>
              <Button onClick={onClose} variant="secondary" className="flex-1 text-xs">
                Done
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
