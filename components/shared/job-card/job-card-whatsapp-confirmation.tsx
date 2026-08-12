"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { CheckCircle, MessageCircle } from "lucide-react"
import { markJobCardPaid } from "@/app/actions/job-card-actions"
import { useToast } from "@/components/ui/use-toast"
import { useSelector } from "react-redux"
import { selectDeviceName } from "@/store/slices/deviceSlice"

interface JobCardWhatsappConfirmationProps {
  isShipping?: boolean
  saleId: number
  trackingId: string
  deviceId: number
  customerName: string
  customerPhone: string
  shippingAddress: string
  products: { productName: string }[]
  totalAmount: number
  onComplete: () => void
}

export function JobCardWhatsappConfirmation({
  isShipping = false,
  saleId,
  trackingId,
  deviceId,
  customerName,
  customerPhone,
  shippingAddress,
  products,
  totalAmount,
  onComplete
}: JobCardWhatsappConfirmationProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const deviceName = useSelector(selectDeviceName) || "Moto Cart Online"

  const productsList = products.map((p, i) => `${i + 1}. ${p.productName}`).join(",\n")

  const whatsappText = isShipping
    ? `Dear ${customerName},

Great news! Your order with ${deviceName} has been shipped! 🚚📦

📦 Shipping Details:
• Order ID: #${saleId}
• Tracking ID: ${trackingId}
• Product(s): 
${productsList}
• Total Amount: ₹${totalAmount}

📍 Shipping Address:
${shippingAddress || "As provided"}

⏱️ You can track your shipment using the tracking ID provided above.
Thank you for shopping with us!

— ${deviceName}🚗✨`
    : `Dear ${customerName},

Thank you for your order with ${deviceName}🙏
We’re happy to confirm that your order has been successfully placed.

📦 Order Details:
• Order ID: #${saleId}
• Product(s): 
${productsList}
• Total Amount: ₹${totalAmount}
• Payment Status: Paid

📍 Shipping Address:
${shippingAddress || "As provided"}

⏱️ Your order is being processed and will be dispatched soon.
We’ll share the tracking details once it’s shipped.

For any queries, feel free to contact us here anytime 😊
Thank you for choosing us!

— ${deviceName}🚗✨`

  const handleSendWhatsapp = () => {
    // Strip non-numeric from phone for the wa.me link
    const phoneNum = customerPhone.replace(/\D/g, "")
    if (!phoneNum) {
      toast({ title: "Warning", description: "Customer does not have a valid phone number.", variant: "destructive" })
      return
    }
    const encodedText = encodeURIComponent(whatsappText)
    window.open(`https://wa.me/${phoneNum}?text=${encodedText}`, "_blank")
  }

  const handleMarkPaid = async () => {
    setLoading(true)
    try {
      const res = await markJobCardPaid(saleId, deviceId)
      if (res.success) {
        toast({ title: "Success", description: "Status updated to Paid." })
        onComplete()
      } else {
        toast({ title: "Error", description: res.message, variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-6 animate-in fade-in zoom-in duration-300">
      <div className="rounded-full bg-green-100 p-4">
        <CheckCircle className="h-12 w-12 text-green-600" />
      </div>
      
      <div className="space-y-2 text-center">
        <h2 className="text-xl font-bold tracking-tight">
          {isShipping ? "Order Shipped Successfully" : "Sale Updated Successfully"}
        </h2>
        <p className="text-muted-foreground text-sm">
          {isShipping
            ? "Send the shipping receipt and tracking details to the customer via WhatsApp."
            : "Send the receipt to the customer via WhatsApp and mark the order as Paid."}
        </p>
      </div>

      <div className="w-full max-w-md bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm font-mono whitespace-pre-wrap text-slate-700 h-64 overflow-y-auto">
        {whatsappText}
      </div>

      <div className="w-full max-w-md flex flex-col gap-3 pt-4">
        <Button 
          onClick={handleSendWhatsapp} 
          className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-medium" 
          size="lg"
        >
          <MessageCircle className="mr-2 h-5 w-5" />
          {isShipping ? "Send WhatsApp Tracking Update" : "Send WhatsApp Receipt"}
        </Button>
        <Button 
          onClick={onComplete} 
          variant="outline" 
          className="w-full"
        >
          Skip
        </Button>
      </div>
    </div>
  )
}
