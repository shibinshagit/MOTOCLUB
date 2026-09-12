"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import {
  Loader2,
  RotateCcw,
  AlertCircle,
  CheckCircle,
  Banknote,
  Building2,
  Calendar,
  FileText,
  HelpCircle,
} from "lucide-react"
import { refundSupplierCredit } from "@/app/actions/supplier-payment-actions"
import { useSelector } from "react-redux"
import type { RootState } from "@/store/store"

interface RefundCreditModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  supplier: {
    id: number
    name: string
    balance_amount?: number
    original_credit?: number
    refunded_credit?: number
    credit_used?: number
    available_credit?: number
    supplier_credit?: number
  }
  userId: number
  deviceId: number
}

export default function RefundCreditModal({
  isOpen,
  onClose,
  onSuccess,
  supplier,
  userId,
  deviceId,
}: RefundCreditModalProps) {
  const currency = useSelector((state: RootState) => state.device.currency) || "AED"

  const originalCredit = supplier.original_credit || supplier.supplier_credit || 0
  const refundedCredit = supplier.refunded_credit || 0
  const creditUsed = supplier.credit_used || 0
  const availableCredit = supplier.available_credit ?? Math.max(originalCredit - refundedCredit - creditUsed, 0)

  const [refundAmount, setRefundAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("Cash")
  const [refundDate, setRefundDate] = useState("")
  const [notes, setNotes] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successResult, setSuccessResult] = useState<{
    refundAmount: number
    remainingCredit: number
  } | null>(null)

  const formatCurrency = (amount: number): string => {
    return `${currency} ${amount.toFixed(2)}`
  }

  useEffect(() => {
    if (isOpen) {
      setRefundAmount(availableCredit > 0 ? availableCredit.toString() : "")
      setPaymentMethod("Cash")
      setRefundDate(new Date().toISOString().split("T")[0])
      setNotes("")
      setError(null)
      setSuccessResult(null)
    }
  }, [isOpen, availableCredit])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const amount = Number.parseFloat(refundAmount)

    if (!amount || isNaN(amount) || amount <= 0) {
      setError("Please enter a valid refund amount greater than zero.")
      return
    }

    if (amount > availableCredit + 0.001) {
      setError(`Refund amount cannot exceed available refundable credit of ${formatCurrency(availableCredit)}`)
      return
    }

    let finalRefundDate: Date | undefined
    if (refundDate) {
      const selectedDate = new Date(refundDate)
      if (isNaN(selectedDate.getTime())) {
        setError("Please enter a valid refund date.")
        return
      }
      finalRefundDate = selectedDate
    }

    setIsLoading(true)

    try {
      const result = await refundSupplierCredit(
        supplier.id,
        amount,
        userId,
        deviceId,
        paymentMethod,
        notes.trim() || undefined,
        finalRefundDate
      )

      if (result.success && result.data) {
        setSuccessResult({
          refundAmount: amount,
          remainingCredit: result.data.remainingAvailableCredit,
        })
      } else {
        setError(result.message || "Failed to process supplier credit refund.")
      }
    } catch (err) {
      console.error("Refund error:", err)
      setError("An unexpected error occurred while processing refund.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    if (successResult) {
      onSuccess()
    }
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto p-0 bg-white shadow-2xl rounded-xl">
        {successResult ? (
          /* Success View */
          <div className="p-6 text-center space-y-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
              <CheckCircle className="h-10 w-10" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Refund Successful!</h2>
              <p className="text-sm text-gray-500 mt-1">
                Supplier credit returned by <span className="font-semibold text-gray-800">{supplier.name}</span> has been recorded.
              </p>
            </div>

            <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200">
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">Refund Amount Returned:</span>
                  <span className="font-bold text-green-700 text-base">{formatCurrency(successResult.refundAmount)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">Remaining Available Credit:</span>
                  <span className="font-semibold text-gray-900">{formatCurrency(successResult.remainingCredit)}</span>
                </div>
                <div className="text-xs text-green-800 bg-green-100/80 p-2 rounded text-left flex items-start mt-2">
                  <Banknote className="h-4 w-4 mr-2 text-green-700 flex-shrink-0 mt-0.5" />
                  <span>Money movement recorded: Cash/Bank balance increased by {formatCurrency(successResult.refundAmount)}.</span>
                </div>
              </CardContent>
            </Card>

            <Button onClick={handleClose} className="w-full bg-green-600 hover:bg-green-700 text-white font-medium h-11">
              Done
            </Button>
          </div>
        ) : (
          /* Form View */
          <div>
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-600 to-orange-600 p-5 text-white">
              <div className="flex items-center space-x-3">
                <div className="bg-white/20 p-2.5 rounded-lg">
                  <RotateCcw className="h-6 w-6 text-white" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold text-white">Refund Supplier Credit</DialogTitle>
                  <p className="text-xs text-amber-100 mt-0.5">
                    Record money returned by supplier <span className="font-semibold">{supplier.name}</span>
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* Financial Summary Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-center">
                  <div className="text-xs text-gray-500">Original Credit</div>
                  <div className="text-sm font-semibold text-gray-900 mt-0.5">{formatCurrency(originalCredit)}</div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-center">
                  <div className="text-xs text-amber-700 font-medium">Already Refunded</div>
                  <div className="text-sm font-semibold text-amber-800 mt-0.5">{formatCurrency(refundedCredit)}</div>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-2.5 text-center">
                  <div className="text-xs text-purple-700 font-medium">Already Used</div>
                  <div className="text-sm font-semibold text-purple-800 mt-0.5">{formatCurrency(creditUsed)}</div>
                </div>
                <div className="bg-green-50 border border-green-300 rounded-lg p-2.5 text-center">
                  <div className="text-xs text-green-700 font-bold">Available to Refund</div>
                  <div className="text-sm font-bold text-green-700 mt-0.5">{formatCurrency(availableCredit)}</div>
                </div>
              </div>

              {/* Informational Banner */}
              <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-start space-x-2">
                <HelpCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  This action records cash or bank money received back from the supplier for unused supplier credit. It reduces available supplier credit without altering purchase histories.
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-lg flex items-center space-x-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-600" />
                  <span>{error}</span>
                </div>
              )}

              {/* Input: Refund Amount */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <Label htmlFor="refundAmount" className="text-xs font-semibold text-gray-700">
                    Refund Amount <span className="text-red-500">*</span>
                  </Label>
                  {availableCredit > 0 && (
                    <button
                      type="button"
                      onClick={() => setRefundAmount(availableCredit.toString())}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Use Full ({formatCurrency(availableCredit)})
                    </button>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-500">
                    {currency}
                  </span>
                  <Input
                    id="refundAmount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={availableCredit}
                    placeholder="0.00"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    className="pl-14 h-10 font-bold text-base border-gray-300 focus:border-amber-500"
                    required
                  />
                </div>
              </div>

              {/* Row: Payment Method & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="paymentMethod" className="text-xs font-semibold text-gray-700">
                    Payment / Refund Method <span className="text-red-500">*</span>
                  </Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger id="paymentMethod" className="h-10 text-sm">
                      <SelectValue placeholder="Select Method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                      <SelectItem value="UPI">UPI</SelectItem>
                      <SelectItem value="Cheque">Cheque</SelectItem>
                      <SelectItem value="Card">Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="refundDate" className="text-xs font-semibold text-gray-700">
                    Refund Date <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="refundDate"
                    type="date"
                    value={refundDate}
                    onChange={(e) => setRefundDate(e.target.value)}
                    className="h-10 text-sm"
                    required
                  />
                </div>
              </div>

              {/* Input: Notes */}
              <div className="space-y-1.5">
                <Label htmlFor="notes" className="text-xs font-semibold text-gray-700">
                  Optional Notes / Reference Number
                </Label>
                <Textarea
                  id="notes"
                  rows={2}
                  placeholder="e.g. Bank Ref #123456 - Refund for excess payment"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="text-xs resize-none"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-gray-100">
                <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading} className="h-10 text-xs px-4">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading || availableCredit <= 0}
                  className="h-10 text-xs px-5 bg-amber-600 hover:bg-amber-700 text-white font-semibold flex items-center space-x-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-4 w-4" />
                      <span>Refund Amount</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
