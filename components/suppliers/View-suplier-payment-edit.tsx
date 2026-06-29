"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormAlert } from "@/components/ui/form-alert"
import { useToast } from "@/components/ui/use-toast"
import { notifySuccess } from "@/lib/notifications"
import { Loader2, DollarSign, Calendar, CreditCard, FileText } from "lucide-react"

interface EditSupplierPaymentModalProps {
  isOpen: boolean
  onClose: () => void
  paymentId: number | null
  userId: number
  deviceId: number
  currency?: string
  onPaymentUpdated?: () => void
}

interface SupplierPayment {
  id: number
  supplier_id: number
  supplier_name: string
  amount: number
  payment_method: string
  payment_date: string
  notes?: string
  affected_purchases?: number
}

export default function EditSupplierPaymentModal({
  isOpen,
  onClose,
  paymentId,
  userId,
  deviceId,
  currency = "AED",
  onPaymentUpdated,
}: EditSupplierPaymentModalProps) {
  // Form state
  const [amount, setAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("Cash")
  const [paymentDate, setPaymentDate] = useState("")
  const [notes, setNotes] = useState("")
  const [supplierName, setSupplierName] = useState("")

  // UI state
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const { toast } = useToast()

  // Format date for input (YYYY-MM-DD)
  const formatDateForInput = (dateStr: string | Date) => {
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr
    if (isNaN(date.getTime())) return ""
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Fetch payment data using server action
  const fetchPaymentData = async (id: number) => {
    try {
      setIsLoading(true)
      setError(null)

      // Import and use your actual server action
      const { getSupplierPaymentById } = await import("@/app/actions/supplier-payment-actions")
      const result = await getSupplierPaymentById(id)
      
      if (!result.success || !result.data) {
        throw new Error(result.message || "Failed to load payment data")
      }

      const payment = result.data

      // Populate form with payment data
      setAmount(payment.amount.toString())
      setPaymentMethod(payment.payment_method)
      setPaymentDate(formatDateForInput(payment.payment_date))
      setNotes(payment.notes || "")
      setSupplierName(payment.supplier_name)

    } catch (err) {
      console.error("Error fetching payment:", err)
      setError(err instanceof Error ? err.message : "Failed to load payment data")
    } finally {
      setIsLoading(false)
    }
  }

  // Load payment data when modal opens
  useEffect(() => {
    if (isOpen && paymentId) {
      fetchPaymentData(paymentId)
    }
  }, [isOpen, paymentId])

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setAmount("")
      setPaymentMethod("Cash")
      setPaymentDate("")
      setNotes("")
      setSupplierName("")
      setError(null)
      setValidationErrors({})
    }
  }, [isOpen])

  // Validate form
  const validateForm = () => {
    const errors: Record<string, string> = {}

    if (!amount || Number(amount) <= 0) {
      errors.amount = "Amount must be greater than 0"
    }

    if (!paymentMethod) {
      errors.paymentMethod = "Please select a payment method"
    }

    if (!paymentDate) {
      errors.paymentDate = "Please select a payment date"
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  // Handle save
  const handleSave = async () => {
    if (!validateForm()) {
      return
    }

    try {
      setIsSaving(true)
      setError(null)

      // Prepare update data
      const updateData = {
        paymentId: paymentId!,
        amount: Number(amount),
        paymentMethod,
        paymentDate: new Date(paymentDate),
        notes: notes.trim() || undefined,
        deviceId,
        userId,
      }

      console.log("Updating supplier payment:", updateData)

      // Use the actual updateSupplierPayment server action
      const { updateSupplierPayment } = await import("@/app/actions/supplier-payment-actions")
      const result = await updateSupplierPayment(updateData)
      
      if (result.success) {
        notifySuccess(toast, "Supplier payment updated successfully")
        onPaymentUpdated?.()
        onClose()
      } else {
        throw new Error(result.message || "Failed to update payment")
      }
    } catch (err) {
      console.error("Error saving payment:", err)
      setError(err instanceof Error ? err.message : "An unexpected error occurred")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center">
            <CreditCard className="h-6 w-6 mr-2 text-orange-600" />
            Edit Supplier Payment
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-orange-600 mx-auto mb-4" />
              <p className="text-gray-600">Loading payment details...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Error Alert */}
            {error && <FormAlert type="error" message={error} />}

            {/* Supplier Info (Read-only) */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-blue-900">
                <FileText className="h-4 w-4" />
                <span className="font-medium">Supplier: {supplierName}</span>
              </div>
              <p className="text-sm text-blue-700 mt-1">
                Payment ID: #{paymentId}
              </p>
            </div>

            {/* Payment Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount" className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-gray-500" />
                Payment Amount ({currency}) *
              </Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value)
                  if (validationErrors.amount) {
                    setValidationErrors({ ...validationErrors, amount: "" })
                  }
                }}
                placeholder="0.00"
                className={validationErrors.amount ? "border-red-500" : ""}
              />
              {validationErrors.amount && (
                <p className="text-sm text-red-600">{validationErrors.amount}</p>
              )}
            </div>

            {/* Payment Method */}
            <div className="space-y-2">
              <Label htmlFor="payment-method" className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-gray-500" />
                Payment Method *
              </Label>
              <Select 
                value={paymentMethod} 
                onValueChange={(value) => {
                  setPaymentMethod(value)
                  if (validationErrors.paymentMethod) {
                    setValidationErrors({ ...validationErrors, paymentMethod: "" })
                  }
                }}
              >
                <SelectTrigger className={validationErrors.paymentMethod ? "border-red-500" : ""}>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Card">Card</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="Check">Check</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
              {validationErrors.paymentMethod && (
                <p className="text-sm text-red-600">{validationErrors.paymentMethod}</p>
              )}
            </div>

            {/* Payment Date */}
            <div className="space-y-2">
              <Label htmlFor="payment-date" className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                Payment Date *
              </Label>
              <Input
                id="payment-date"
                type="date"
                value={paymentDate}
                onChange={(e) => {
                  setPaymentDate(e.target.value)
                  if (validationErrors.paymentDate) {
                    setValidationErrors({ ...validationErrors, paymentDate: "" })
                  }
                }}
                className={validationErrors.paymentDate ? "border-red-500" : ""}
              />
              {validationErrors.paymentDate && (
                <p className="text-sm text-red-600">{validationErrors.paymentDate}</p>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes about this payment..."
                rows={3}
              />
            </div>

            {/* Warning Note */}
            <FormAlert
              type="warning"
              message="Changing the payment amount will affect supplier balances and purchase records. Make sure this change is accurate."
              title="Note"
            />
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading || isSaving}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
