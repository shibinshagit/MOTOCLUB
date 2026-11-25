"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { useToast } from "@/components/ui/use-toast"
import { Loader2, RotateCcw, AlertCircle, ArrowLeft } from "lucide-react"
import { processSaleReturnRefund } from "@/app/actions/sale-actions"

interface ReturnPaymentModalProps {
  isOpen: boolean
  onClose: () => void
  sale: {
    id: number
    customer_name?: string
    customer_phone?: string
    customer_name_override?: string
    total_amount?: number | string
    received_amount?: number | string
    payment_method?: string
    status?: string
    payment_status?: string
    device_id?: number
  } | null
  deviceId: number
  userId?: number
  currency?: string
  onSuccess?: () => void
}

export function ReturnPaymentModal({
  isOpen,
  onClose,
  sale,
  deviceId,
  userId,
  currency = "INR",
  onSuccess,
}: ReturnPaymentModalProps) {
  const { toast } = useToast()
  const [amount, setAmount] = useState<string>("")
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash")
  const [notes, setNotes] = useState<string>("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const customerName =
    sale?.customer_name || sale?.customer_name_override || "Customer"
  const totalAmount = Number(sale?.total_amount) || 0
  const receivedAmount = Number(sale?.received_amount) || 0

  const isAlreadyReturned =
    sale?.payment_status?.toLowerCase() === "returned" ||
    (sale?.status === "Returned" && sale?.payment_status?.toLowerCase() !== "pending")

  useEffect(() => {
    if (sale) {
      // Default refund amount to what was actually received / paid
      const defaultRefund = receivedAmount > 0 ? receivedAmount : totalAmount
      setAmount(defaultRefund > 0 ? String(defaultRefund) : "0")
      setPaymentMethod(sale.payment_method || "Cash")
      setNotes("")
    }
  }, [sale, receivedAmount, totalAmount])

  if (!sale) return null

  const handleReturnSubmit = async () => {
    if (isAlreadyReturned) {
      toast({
        title: "Already Returned",
        description: "This order has already been returned. Multiple return refunds are not permitted.",
        variant: "destructive",
      })
      return
    }

    const numAmount = Number(amount)
    if (isNaN(numAmount) || numAmount < 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid refund amount (0 or greater).",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)
    try {
      const res = await processSaleReturnRefund({
        saleId: sale.id,
        refundAmount: numAmount,
        paymentMethod: paymentMethod || "Cash",
        deviceId: Number(sale.device_id || deviceId || 0),
        userId: userId,
        notes: notes.trim() || undefined,
      })

      if (res.success) {
        toast({
          title: "Return Processed",
          description:
            res.message ||
            `Return of ${currency} ${numAmount.toFixed(2)} recorded and payment marked as Returned.`,
        })
        if (onSuccess) {
          onSuccess()
        }
        onClose()
      } else {
        toast({
          title: "Error",
          description: res.message || "Failed to process return refund.",
          variant: "destructive",
        })
      }
    } catch (err: any) {
      console.error("Error processing return refund:", err)
      toast({
        title: "Error",
        description: err.message || "An unexpected error occurred.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent className="max-w-md p-6 bg-white rounded-xl shadow-xl">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2 text-rose-700">
            <div className="p-2 rounded-full bg-rose-100">
              <RotateCcw className="h-5 w-5" />
            </div>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Return Order #{sale.id}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-500">
            Specify the refund amount to return to the customer. This will record a Money Out transaction in accounting and mark the payment status as Returned.
          </DialogDescription>
        </DialogHeader>

        {isAlreadyReturned && (
          <div className="my-2 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span>This order has already been returned. Additional return refunds are restricted.</span>
          </div>
        )}

        {/* Order Details Summary Card */}
        <div className="my-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1.5">
          <div className="flex justify-between text-slate-600">
            <span>Customer:</span>
            <span className="font-semibold text-slate-900">{customerName}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Order Total:</span>
            <span className="font-semibold text-slate-900">
              {currency} {totalAmount.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Customer Paid Amount:</span>
            <span className="font-bold text-emerald-700">
              {currency} {receivedAmount.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Inputs */}
        <div className="space-y-3.5 py-1">
          <div>
            <Label htmlFor="refund-amount" className="text-xs font-semibold text-slate-700">
              Return / Refund Amount ({currency}) <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="refund-amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 h-9 text-sm font-semibold text-slate-900 border-slate-300 focus:border-rose-500 focus:ring-rose-500"
              disabled={isSubmitting}
              autoFocus
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Enter the exact amount paid back to the customer. Enter 0 if no cash refund was given.
            </p>
          </div>

          <div>
            <Label htmlFor="refund-payment-method" className="text-xs font-semibold text-slate-700">
              Refund Payment Method
            </Label>
            <Select
              value={paymentMethod}
              onValueChange={setPaymentMethod}
              disabled={isSubmitting}
            >
              <SelectTrigger id="refund-payment-method" className="mt-1 h-9 text-xs">
                <SelectValue placeholder="Select payment method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="UPI">UPI / GPay / PhonePe</SelectItem>
                <SelectItem value="Bank Transfer">Bank Transfer / IMPS / NEFT</SelectItem>
                <SelectItem value="Card">Card</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="refund-notes" className="text-xs font-semibold text-slate-700">
              Notes (Optional)
            </Label>
            <Input
              id="refund-notes"
              type="text"
              placeholder="Reason or reference notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 h-9 text-xs"
              disabled={isSubmitting}
            />
          </div>
        </div>

        <DialogFooter className="mt-4 gap-2 sm:gap-0">
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
            onClick={handleReturnSubmit}
            disabled={isSubmitting || isAlreadyReturned}
            className="text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white gap-1.5"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Return</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

