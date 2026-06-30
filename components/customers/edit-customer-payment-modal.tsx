"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2 } from "lucide-react"
import {
  getCustomerPaymentById,
  updateCustomerPayment,
} from "@/app/actions/customer-payment-actions"
import { useSelector } from "react-redux"
import type { RootState } from "@/store/store"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"

interface EditCustomerPaymentModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  paymentId: number | null
  userId: number
  deviceId: number
}

export default function EditCustomerPaymentModal({
  isOpen,
  onClose,
  onSuccess,
  paymentId,
  userId,
  deviceId,
}: EditCustomerPaymentModalProps) {
  const { toast } = useToast()
  const currency = useSelector((state: RootState) => state.device.currency) || "AED"
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [customerName, setCustomerName] = useState("")
  const [amount, setAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("Cash")
  const [paymentDate, setPaymentDate] = useState("")
  const [notes, setNotes] = useState("")
  const today = new Date().toISOString().split("T")[0]

  useEffect(() => {
    if (!isOpen || !paymentId) return

    const load = async () => {
      setIsLoading(true)
      try {
        const result = await getCustomerPaymentById(paymentId)
        if (!result.success || !result.data) {
          notifyError(toast, result.message || "Failed to load payment")
          onClose()
          return
        }

        const payment = result.data
        setCustomerName(payment.customer_name)
        setAmount(String(payment.amount))
        setPaymentMethod(payment.payment_method || "Cash")
        setNotes(payment.user_notes || "")

        const date = new Date(payment.payment_date)
        if (!Number.isNaN(date.getTime())) {
          setPaymentDate(date.toISOString().slice(0, 10))
        } else {
          setPaymentDate(today)
        }
      } catch (error) {
        console.error(error)
        notifyError(toast, "Failed to load payment")
        onClose()
      } finally {
        setIsLoading(false)
      }
    }

    load()
  }, [isOpen, paymentId, onClose, toast, today])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!paymentId) return

    const parsedAmount = Number.parseFloat(amount)
    if (!parsedAmount || parsedAmount <= 0) {
      notifyError(toast, "Enter a valid amount")
      return
    }

    setIsSaving(true)
    try {
      const result = await updateCustomerPayment({
        paymentId,
        amount: parsedAmount,
        paymentMethod,
        paymentDate: new Date(paymentDate || today),
        notes: notes.trim() || undefined,
        deviceId,
        userId,
      })

      if (result.success) {
        notifySuccess(toast, result.message || "Payment updated")
        onSuccess()
        onClose()
      } else {
        notifyError(toast, result.message || "Failed to update payment")
      }
    } catch (error) {
      console.error(error)
      notifyError(toast, "Failed to update payment")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit payment{customerName ? ` — ${customerName}` : ""}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-cust-amount">Amount ({currency})</Label>
              <Input
                id="edit-cust-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Payment method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="Check">Check</SelectItem>
                  <SelectItem value="Card">Card</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-cust-date">Payment date</Label>
              <Input
                id="edit-cust-date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                max={today}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-cust-notes">Notes</Label>
              <Textarea
                id="edit-cust-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save changes"
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
