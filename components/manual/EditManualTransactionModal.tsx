"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Save } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess, notifyWarning } from "@/lib/notifications"
import { SimpleDateInput } from "@/components/ui/date-picker"
import { getManualTransactionById, updateManualTransaction } from "@/app/actions/manual-transaction-actions"

interface EditManualTransactionModalProps {
  isOpen: boolean
  onClose: () => void
  transactionId: number | null
  currency?: string
  onTransactionUpdated?: () => void
}

interface ManualTransaction {
  id: number
  amount: number
  type: "debit" | "credit"
  description: string
  category: string
  payment_method: string
  transaction_date: string
  device_id: number
  user_id: number
}

export default function EditManualTransactionModal({
  isOpen,
  onClose,
  transactionId,
  currency = "AED",
  onTransactionUpdated,
}: EditManualTransactionModalProps) {
  const [transaction, setTransaction] = useState<ManualTransaction | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const { toast } = useToast()

  // Form fields
  const [amount, setAmount] = useState("")
  const [type, setType] = useState<"debit" | "credit">("debit")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("Cash")
  const [transactionDate, setTransactionDate] = useState<Date>(new Date())

  // Fetch transaction data when modal opens
  useEffect(() => {
    const fetchTransaction = async () => {
      if (!isOpen || !transactionId) return

      try {
        setIsLoading(true)
        console.log("Fetching manual transaction for edit:", transactionId)

        const response = await getManualTransactionById(transactionId)

        if (response.success && response.data) {
          const txn = response.data
          setTransaction(txn)
          
          // Populate form fields
          setAmount(txn.amount.toString())
          setType(txn.type)
          setDescription(txn.description || "")
          setCategory(txn.category || "")
          setPaymentMethod(txn.payment_method || "Cash")
          setTransactionDate(new Date(txn.transaction_date))
        } else {
          notifyError(toast, response.message || "Failed to load transaction")
          onClose()
        }
      } catch (error) {
        console.error("Error fetching transaction:", error)
        notifyError(toast, "An unexpected error occurred")
        onClose()
      } finally {
        setIsLoading(false)
      }
    }

    fetchTransaction()
  }, [isOpen, transactionId, toast, onClose])

  const handleSubmit = async () => {
    // Validation
    if (!amount || parseFloat(amount) <= 0) {
      notifyError(toast, "Please enter a valid amount", "Validation Error")
      return
    }

    if (!category) {
      notifyError(toast, "Please enter a category", "Validation Error")
      return
    }

    if (!transactionId) {
      notifyError(toast, "Transaction ID not found")
      return
    }

    try {
      setIsSaving(true)

      const response = await updateManualTransaction(transactionId, {
        amount: parseFloat(amount),
        type,
        description: description || "No Description",
        category,
        payment_method: paymentMethod,
        transaction_date: transactionDate,
      })

      if (response.success) {
        notifySuccess(toast, "Manual transaction updated successfully")
        
        if (onTransactionUpdated) {
          onTransactionUpdated()
        }
        
        onClose()
      } else {
        notifyError(toast, response.message || "Failed to update transaction")
      }
    } catch (error) {
      console.error("Error updating transaction:", error)
      notifyError(toast, "An unexpected error occurred")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            Edit Manual Transaction #{transactionId}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-purple-600 mx-auto mb-4" />
              <p className="text-gray-600">Loading transaction...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Transaction Type */}
            <div className="space-y-2">
              <Label htmlFor="type">Transaction Type *</Label>
              <Select value={type} onValueChange={(value: "debit" | "credit") => setType(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="debit">Debit (Money Out)</SelectItem>
                  <SelectItem value="credit">Credit (Money In)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="amount">Amount ({currency}) *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Input
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g., Office Supplies, Petty Cash"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter transaction description"
                rows={3}
              />
            </div>

            {/* Payment Method */}
            <div className="space-y-2">
              <Label htmlFor="payment-method">Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
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
            </div>

            {/* Transaction Date */}
            <div className="space-y-2">
              <Label htmlFor="transaction-date">Transaction Date *</Label>
              <SimpleDateInput
                id="transaction-date"
                value={transactionDate}
                onDateChange={setTransactionDate}
                placeholder="Select date"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSaving || isLoading}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
