"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Loader2,
  CreditCard,
  AlertCircle,
  CheckCircle,
  DollarSign,
  X,
  ArrowRight,
  Receipt,
  Building2,
  Banknote,
  TrendingDown,
  FileText,
  CalendarIcon,
} from "lucide-react"
import { paySupplierCredit } from "@/app/actions/supplier-payment-actions"
import { useSelector } from "react-redux"
import type { RootState } from "@/store/store"

interface PayCreditModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  supplier: {
    id: number
    name: string
    balance_amount: number
  }
  userId: number
  deviceId: number
}

interface PaymentAllocation {
  purchaseId: number
  allocatedAmount: number
  newStatus: string
  remainingBalance: number
}

export default function PayCreditModal({
  isOpen,
  onClose,
  onSuccess,
  supplier,
  userId,
  deviceId,
}: PayCreditModalProps) {
  const [paymentAmount, setPaymentAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("Cash")
  const [notes, setNotes] = useState("")
  const [paymentDate, setPaymentDate] = useState<string>("") // New state for payment date
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paymentResult, setPaymentResult] = useState<{
    totalPaid: number
    allocations: PaymentAllocation[]
    remainingCredit: number
  } | null>(null)

  const currency = useSelector((state: RootState) => state.device.currency) || "AED"
  const company = useSelector((state: RootState) => state.device.company)

  const formatCurrency = (amount: number): string => {
    return `${currency} ${amount.toFixed(2)}`
  }

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setPaymentAmount("")
      setPaymentMethod("Cash")
      setNotes("")
      setPaymentDate("") // Reset to empty, will use current date as default
      setError(null)
      setPaymentResult(null)
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const amount = Number.parseFloat(paymentAmount)

    // Validation
    if (!amount || amount <= 0) {
      setError("Please enter a valid payment amount")
      return
    }

    if (amount > supplier.balance_amount) {
      setError(`Payment amount cannot exceed credit balance of ${formatCurrency(supplier.balance_amount)}`)
      return
    }

    // Date validation - if provided, check if it's a valid date
    let finalPaymentDate: Date | undefined
    if (paymentDate) {
      const selectedDate = new Date(paymentDate)
      if (isNaN(selectedDate.getTime())) {
        setError("Please enter a valid payment date")
        return
      }
      finalPaymentDate = selectedDate
    }
    // If no date provided, use current date (will be handled in backend)

    setIsLoading(true)

    try {
      const result = await paySupplierCredit(
        supplier.id,
        amount,
        userId,
        deviceId,
        paymentMethod,
        notes.trim() || undefined,
        finalPaymentDate // Pass the date to backend
      )

      if (result.success && result.data) {
        setPaymentResult(result.data)
      } else {
        setError(result.message || "Failed to process payment")
      }
    } catch (err) {
      console.error("Payment error:", err)
      setError("An unexpected error occurred while processing payment")
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    if (paymentResult) {
      onSuccess() // Refresh data if payment was successful
    }
    onClose()
  }

  const maxAmount = supplier.balance_amount
  const quickAmounts = [
    Math.min(100, maxAmount),
    Math.min(500, maxAmount),
    Math.min(1000, maxAmount),
    maxAmount,
  ].filter((amount, index, arr) => arr.indexOf(amount) === index && amount > 0)

  // Get today's date in YYYY-MM-DD format for the input max attribute
  const today = new Date().toISOString().split('T')[0]

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="max-w-3xl max-h-[95vh] overflow-hidden p-0 bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col [&>button]:hidden">
        {paymentResult ? (
          // Success View (unchanged)
          <div className="flex flex-col h-full max-h-[90vh]">
            {/* Success Header */}
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white p-4 relative overflow-hidden">
              <div className="absolute inset-0 bg-white/10 backdrop-blur-sm"></div>
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="bg-white/20 p-3 rounded-full">
                      <CheckCircle className="h-8 w-8" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold">Payment Successful!</h2>
                      <p className="text-green-100">Transaction completed successfully</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center">
                    <div className="text-3xl font-bold">{formatCurrency(paymentResult.totalPaid)}</div>
                    <div className="text-sm text-green-100">Amount Paid</div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center">
                    <div className="text-3xl font-bold">{paymentResult.allocations.length}</div>
                    <div className="text-sm text-green-100">Purchases Updated</div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center">
                    <div className="text-3xl font-bold">{formatCurrency(paymentResult.remainingCredit)}</div>
                    <div className="text-sm text-green-100">Remaining Credit</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Success Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[50vh]">
              {/* Payment Summary Card */}
              <Card className="border-0 shadow-lg bg-white">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-3">
                      <div className="bg-blue-100 p-2 rounded-lg">
                        <Receipt className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">Payment Summary</h3>
                        <p className="text-sm text-gray-500">Transaction details and allocation</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-500">Transaction Date</div>
                      <div className="font-medium">{new Date().toLocaleDateString()}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div className="flex items-center space-x-3">
                        <Building2 className="h-4 w-4 text-gray-400" />
                        <div>
                          <div className="text-sm text-gray-500">Supplier</div>
                          <div className="font-medium">{supplier.name}</div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <Banknote className="h-4 w-4 text-gray-400" />
                        <div>
                          <div className="text-sm text-gray-500">Payment Method</div>
                          <div className="font-medium">{paymentMethod}</div>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center space-x-3">
                        <DollarSign className="h-4 w-4 text-gray-400" />
                        <div>
                          <div className="text-sm text-gray-500">Amount Paid</div>
                          <div className="font-medium text-green-600">{formatCurrency(paymentResult.totalPaid)}</div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <TrendingDown className="h-4 w-4 text-gray-400" />
                        <div>
                          <div className="text-sm text-gray-500">Remaining Balance</div>
                          <div className="font-medium text-orange-600">
                            {formatCurrency(paymentResult.remainingCredit)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Allocation Details */}
              <Card className="border-0 shadow-lg bg-white">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-3 mb-6">
                    <div className="bg-purple-100 p-2 rounded-lg">
                      <FileText className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Payment Allocation</h3>
                      <p className="text-sm text-gray-500">
                        How the payment was distributed across purchases
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {paymentResult.allocations.map((allocation, index) => (
                      <div
                        key={allocation.purchaseId}
                        className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl border border-gray-200 hover:shadow-md transition-all duration-200"
                      >
                        <div className="flex items-center space-x-4">
                          <div className="bg-white p-2 rounded-lg shadow-sm">
                            <Receipt className="h-4 w-4 text-gray-600" />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">
                              Purchase #{allocation.purchaseId}
                            </div>
                            <div className="text-sm text-gray-500">
                              {allocation.remainingBalance > 0
                                ? `Balance: ${formatCurrency(allocation.remainingBalance)}`
                                : "Fully Paid"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <div className="text-right">
                            <div className="text-lg font-bold text-gray-900">
                              {formatCurrency(allocation.allocatedAmount)}
                            </div>
                            <div className="text-xs text-gray-500">Allocated</div>
                          </div>
                          <ArrowRight className="h-4 w-4 text-gray-400" />
                          <Badge
                            variant={allocation.newStatus === "Paid" ? "default" : "secondary"}
                            className={
                              allocation.newStatus === "Paid"
                                ? "bg-green-100 text-green-800 border-green-200 px-3 py-1"
                                : "bg-orange-100 text-orange-800 border-orange-200 px-3 py-1"
                            }
                          >
                            {allocation.newStatus}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Success Footer */}
            <div className="border-t bg-white p-4">
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-500">
                  Payment processed by {company?.name || "System"}
                </div>
                <Button
                  onClick={handleClose}
                  className="bg-green-600 hover:bg-green-700 text-white px-8 py-2 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  Complete
                </Button>
              </div>
            </div>
          </div>
        ) : (
          // Payment Form
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 relative overflow-hidden">
              <div className="absolute inset-0 bg-white/10 backdrop-blur-sm"></div>
              <div className="relative z-10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="bg-white/20 p-2 rounded-full">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">Pay Supplier Credit</h2>
                      <p className="text-blue-100 text-sm">Process payment for outstanding balance</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClose}
                    disabled={isLoading}
                    className="text-white hover:bg-white/20 rounded-full p-2"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Form Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[70vh]">
              {/* Error Display */}
              {error && (
                <Card className="border-red-200 bg-red-50">
                  <CardContent className="p-3">
                    <div className="flex items-center text-red-800">
                      <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
                      <span className="font-medium text-sm">{error}</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Supplier Info Card */}
                <Card className="border-0 shadow-lg bg-white">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="bg-blue-100 p-2 rounded-lg">
                          <Building2 className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">{supplier.name}</h3>
                          <p className="text-gray-500 text-sm">Supplier ID: #{supplier.id}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500 mb-1">Outstanding Balance</div>
                        <div className="text-2xl font-bold text-red-600">{formatCurrency(supplier.balance_amount)}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Payment Form Card */}
                <Card className="border-0 shadow-lg bg-white">
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center space-x-2 mb-3">
                      <div className="bg-green-100 p-1.5 rounded-lg">
                        <DollarSign className="h-4 w-4 text-green-600" />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">Payment Details</h3>
                        <p className="text-xs text-gray-500">Enter payment information</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Payment Amount */}
                      <div className="space-y-2">
                        <Label
                          htmlFor="amount"
                          className="text-sm font-medium text-gray-700 flex items-center space-x-1"
                        >
                          <DollarSign className="h-3 w-3" />
                          <span>Payment Amount *</span>
                        </Label>
                        <Input
                          id="amount"
                          type="number"
                          step="0.01"
                          min="0.01"
                          max={maxAmount}
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          placeholder="0.00"
                          className="text-base font-medium h-10 border-2 focus:border-blue-500 rounded-lg"
                          required
                        />
                        <div className="text-xs text-gray-500">
                          Maximum: {formatCurrency(maxAmount)}
                        </div>
                      </div>

                      {/* Payment Method */}
                      <div className="space-y-2">
                        <Label
                          htmlFor="method"
                          className="text-sm font-medium text-gray-700 flex items-center space-x-1"
                        >
                          <Banknote className="h-3 w-3" />
                          <span>Payment Method *</span>
                        </Label>
                        <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                          <SelectTrigger className="h-10 border-2 focus:border-blue-500 rounded-lg">
                            <SelectValue placeholder="Select payment method" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Cash">💵 Cash</SelectItem>
                            <SelectItem value="Bank Transfer">🏦 Bank Transfer</SelectItem>
                            <SelectItem value="Check">📝 Check</SelectItem>
                            <SelectItem value="Card">💳 Card</SelectItem>
                            <SelectItem value="Other">🔄 Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Payment Date */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label
                          htmlFor="paymentDate"
                          className="text-sm font-medium text-gray-700 flex items-center space-x-1"
                        >
                          <CalendarIcon className="h-3 w-3" />
                          <span>Payment Date (Optional)</span>
                        </Label>
                        <Input
                          id="paymentDate"
                          type="date"
                          value={paymentDate}
                          onChange={(e) => setPaymentDate(e.target.value)}
                          max={today}
                          className="h-10 border-2 focus:border-blue-500 rounded-lg"
                        />
                        <div className="text-xs text-gray-500">
                          {paymentDate ? `Selected: ${new Date(paymentDate).toLocaleDateString()}` : 'Leave empty to use current date'}
                        </div>
                      </div>
                    </div>

                    {/* Quick Amount Buttons */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-gray-700">Quick Amounts</Label>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {quickAmounts.map((amount) => (
                          <Button
                            key={amount}
                            type="button"
                            variant="outline"
                            onClick={() => setPaymentAmount(amount.toString())}
                            className="h-9 text-xs rounded-lg border-2 hover:border-blue-500 hover:bg-blue-50 transition-all duration-200"
                          >
                            {amount === maxAmount ? "Full" : formatCurrency(amount)}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                      <Label
                        htmlFor="notes"
                        className="text-sm font-medium text-gray-700 flex items-center space-x-1"
                      >
                        <FileText className="h-3 w-3" />
                        <span>Notes (Optional)</span>
                      </Label>
                      <Textarea
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Add any notes about this payment..."
                        rows={2}
                        className="border-2 focus:border-blue-500 rounded-lg resize-none text-sm"
                      />
                    </div>
                  </CardContent>
                </Card>
              </form>
            </div>

            {/* Footer */}
            <div className="border-t bg-white p-4">
              <div className="flex flex-col sm:flex-row justify-between items-center space-y-2 sm:space-y-0 sm:space-x-3">
                <div className="text-xs text-gray-500">
                  Payment will be allocated to oldest purchases first
                </div>
                <div className="flex space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    disabled={isLoading}
                    className="px-4 py-2 rounded-lg border-2 text-sm"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    onClick={handleSubmit}
                    disabled={isLoading || !paymentAmount || Number.parseFloat(paymentAmount) <= 0}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 text-sm"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-3 w-3 mr-1" />
                        Pay {paymentAmount ? formatCurrency(Number.parseFloat(paymentAmount)) : "Amount"}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
