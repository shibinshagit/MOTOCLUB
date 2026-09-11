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
  Banknote,
  X,
  ArrowRight,
  Receipt,
  Building2,
  TrendingDown,
  FileText,
  CalendarIcon,
} from "lucide-react"
import { paySupplierCredit, applySupplierCredit, getSupplierCreditSummary } from "@/app/actions/supplier-payment-actions"
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
    available_credit?: number
    supplier_credit?: number
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

interface PaymentResultData {
  totalPaid: number
  creditUsed?: number
  amountApplied: number
  extraCredit: number
  remainingCredit: number
  allocations: PaymentAllocation[]
}

export default function PayCreditModal({
  isOpen,
  onClose,
  onSuccess,
  supplier,
  userId,
  deviceId,
}: PayCreditModalProps) {
  const [useSupplierCredit, setUseSupplierCredit] = useState(false)
  const [creditToApplyInput, setCreditToApplyInput] = useState("")
  const [paymentAmount, setPaymentAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("Cash")
  const [notes, setNotes] = useState("")
  const [paymentDate, setPaymentDate] = useState<string>("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paymentResult, setPaymentResult] = useState<PaymentResultData | null>(null)

  const [liveCreditSummary, setLiveCreditSummary] = useState<{
    availableCredit: number
    outstandingBalance: number
  } | null>(null)

  const currency = useSelector((state: RootState) => state.device.currency) || "AED"
  const company = useSelector((state: RootState) => state.device.company)

  const availableCredit = liveCreditSummary
    ? liveCreditSummary.availableCredit
    : (supplier.available_credit ?? supplier.supplier_credit ?? 0)
  const outstandingBalance = liveCreditSummary
    ? liveCreditSummary.outstandingBalance
    : (supplier.balance_amount || 0)
  const maxCreditApplicable = Math.min(availableCredit, outstandingBalance)

  const formatCurrency = (amount: number): string => {
    return `${currency} ${amount.toFixed(2)}`
  }

  // Fetch live credit summary and reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setError(null)
      setPaymentResult(null)
      setNotes("")
      setPaymentDate("")
      setPaymentMethod("Cash")
      setUseSupplierCredit(false)
      setCreditToApplyInput("0")
      setPaymentAmount(outstandingBalance.toString())

      if (supplier?.id && userId) {
        getSupplierCreditSummary(supplier.id, userId)
          .then((res) => {
            if (res.success && res.data) {
              setLiveCreditSummary({
                availableCredit: res.data.availableCredit,
                outstandingBalance: res.data.outstandingBalance,
              })
              setPaymentAmount(res.data.outstandingBalance.toString())
            }
          })
          .catch((err) => {
            console.error("Error fetching live credit summary in modal:", err)
          })
      }
    }
  }, [isOpen, supplier?.id, userId])

  const handleToggleSupplierCredit = (checked: boolean) => {
    setUseSupplierCredit(checked)
    if (checked) {
      const initCredit = Math.min(availableCredit, outstandingBalance)
      setCreditToApplyInput(initCredit.toString())
      setPaymentAmount(Math.max(outstandingBalance - initCredit, 0).toString())
    } else {
      setCreditToApplyInput("0")
      setPaymentAmount(outstandingBalance.toString())
    }
  }

  const handleCreditInputChange = (val: string) => {
    setCreditToApplyInput(val)
    const rawVal = Number.parseFloat(val) || 0
    const clampedCredit = Math.min(Math.max(rawVal, 0), maxCreditApplicable)
    setPaymentAmount(Math.max(outstandingBalance - clampedCredit, 0).toString())
  }

  const creditToApplyNum = useSupplierCredit
    ? Math.min(Math.max(Number.parseFloat(creditToApplyInput) || 0, 0), maxCreditApplicable)
    : 0
  const cashPaymentNum = Math.max(Number.parseFloat(paymentAmount) || 0, 0)

  const totalSettled = creditToApplyNum + Math.min(cashPaymentNum, Math.max(outstandingBalance - creditToApplyNum, 0))
  const remainingOutstanding = Math.max(outstandingBalance - totalSettled, 0)
  const extraCreditCreated = Math.max(cashPaymentNum - Math.max(outstandingBalance - creditToApplyNum, 0), 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const rawCreditToApply = useSupplierCredit ? (Number.parseFloat(creditToApplyInput) || 0) : 0

    if (cashPaymentNum <= 0 && rawCreditToApply <= 0) {
      setError("Please enter a valid credit amount or cash payment amount")
      return
    }

    if (useSupplierCredit && rawCreditToApply > availableCredit + 0.001) {
      setError(`Credit to apply cannot exceed available credit of ${formatCurrency(availableCredit)}`)
      return
    }

    if (useSupplierCredit && rawCreditToApply > outstandingBalance + 0.001) {
      setError(`Credit to apply cannot exceed outstanding balance of ${formatCurrency(outstandingBalance)}`)
      return
    }

    let finalPaymentDate: Date | undefined
    if (paymentDate) {
      const selectedDate = new Date(paymentDate)
      if (isNaN(selectedDate.getTime())) {
        setError("Please enter a valid payment date")
        return
      }
      finalPaymentDate = selectedDate
    }

    setIsLoading(true)

    try {
      const result = await paySupplierCredit(
        supplier.id,
        cashPaymentNum,
        userId,
        deviceId,
        paymentMethod,
        notes.trim() || undefined,
        finalPaymentDate,
        creditToApplyNum,
      )

      if (result.success && result.data) {
        setPaymentResult(result.data as PaymentResultData)
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
      onSuccess()
    }
    onClose()
  }

  const quickAmounts = [100, 500, 1000, Math.max(outstandingBalance - creditToApplyNum, 0)].filter(
    (amount, index, arr) => arr.indexOf(amount) === index && amount > 0
  )

  const today = new Date().toISOString().split('T')[0]

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="max-w-3xl max-h-[95vh] overflow-hidden p-0 bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col [&>button]:hidden">
        {paymentResult ? (
          // Success View
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

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold">{formatCurrency(paymentResult.totalPaid)}</div>
                    <div className="text-xs text-green-100">Cash / Bank Paid</div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold">{formatCurrency(paymentResult.creditUsed ?? 0)}</div>
                    <div className="text-xs text-green-100">Credit Used</div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold">{formatCurrency(paymentResult.amountApplied)}</div>
                    <div className="text-xs text-green-100">Amount Applied</div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center">
                    <div className="text-2xl font-bold">{formatCurrency(paymentResult.remainingCredit)}</div>
                    <div className="text-xs text-green-100">Remaining Balance</div>
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
                        <Banknote className="h-4 w-4 text-gray-400" />
                        <div>
                          <div className="text-sm text-gray-500">Cash Paid</div>
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
                        key={`${allocation.purchaseId}-${index}`}
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
                      <p className="text-blue-100 text-sm">Process payment or apply available supplier credit</p>
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
                        <div className="text-2xl font-bold text-red-600">{formatCurrency(outstandingBalance)}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Available Credit Usage Card */}
                <Card className="border-blue-200 bg-blue-50/50 shadow-md">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="useSupplierCreditToggle"
                          checked={useSupplierCredit}
                          disabled={availableCredit <= 0}
                          onChange={(e) => handleToggleSupplierCredit(e.target.checked)}
                          className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500 border-gray-300 cursor-pointer disabled:opacity-50"
                        />
                        <Label htmlFor="useSupplierCreditToggle" className={`font-semibold text-sm cursor-pointer ${availableCredit <= 0 ? 'text-gray-400' : 'text-blue-900'}`}>
                          Use Available Credit
                        </Label>
                      </div>
                      <Badge variant="outline" className={`text-xs font-semibold ${availableCredit > 0 ? 'bg-blue-100 text-blue-800 border-blue-300' : 'bg-gray-100 text-gray-600 border-gray-300'}`}>
                        Available Credit: {formatCurrency(availableCredit)}
                      </Badge>
                    </div>

                    {useSupplierCredit && availableCredit > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-blue-200">
                        <div>
                          <Label className="text-xs font-medium text-gray-700">Credit to Apply</Label>
                          <Input
                            type="number"
                            min="0"
                            max={maxCreditApplicable}
                            step="0.01"
                            value={creditToApplyInput}
                            onChange={(e) => handleCreditInputChange(e.target.value)}
                            className="h-9 bg-white text-sm font-medium mt-1 border-blue-300"
                          />
                          <span className="text-[11px] text-gray-500 mt-0.5 block">
                            Max applicable: {formatCurrency(maxCreditApplicable)}
                          </span>
                        </div>
                        <div>
                          <Label className="text-xs font-medium text-gray-700">Remaining to Pay (Cash / Bank)</Label>
                          <div className="h-9 flex items-center px-3 bg-white border border-gray-200 rounded-md text-sm font-semibold text-gray-800 mt-1">
                            {formatCurrency(Math.max(outstandingBalance - creditToApplyNum, 0))}
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Payment Form Card */}
                <Card className="border-0 shadow-lg bg-white">
                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center space-x-2 mb-3">
                      <div className="bg-green-100 p-1.5 rounded-lg">
                        <Banknote className="h-4 w-4 text-green-600" />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">Cash / Bank Payment Details</h3>
                        <p className="text-xs text-gray-500">Enter cash or bank transfer payment amount</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Payment Amount */}
                      <div className="space-y-2">
                        <Label
                          htmlFor="amount"
                          className="text-sm font-medium text-gray-700 flex items-center space-x-1"
                        >
                          <Banknote className="h-3 w-3" />
                          <span>Amount to Pay (Cash / Bank)</span>
                        </Label>
                        <Input
                          id="amount"
                          type="number"
                          step="0.01"
                          min="0"
                          value={paymentAmount}
                          onChange={(e) => setPaymentAmount(e.target.value)}
                          placeholder="0.00"
                          className="text-base font-medium h-10 border-2 focus:border-blue-500 rounded-lg"
                        />
                        <div className="space-y-1">
                          <div className="text-xs text-gray-500">
                            Remaining Outstanding: {formatCurrency(Math.max(outstandingBalance - creditToApplyNum, 0))}
                          </div>
                          <div className="text-xs text-blue-600 font-medium">
                            Amount above remaining balance will create extra supplier credit.
                          </div>
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

                    {/* Dynamic Calculation Breakdown Card */}
                    <div className="p-3.5 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 space-y-2 text-xs sm:text-sm">
                      <div className="flex justify-between items-center text-gray-700">
                        <span>Outstanding Balance:</span>
                        <span className="font-semibold text-gray-900">{formatCurrency(outstandingBalance)}</span>
                      </div>

                      {availableCredit > 0 && (
                        <div className="flex justify-between items-center text-blue-800">
                          <span>Available Supplier Credit:</span>
                          <span className="font-semibold">{formatCurrency(availableCredit)}</span>
                        </div>
                      )}

                      {useSupplierCredit && creditToApplyNum > 0 && (
                        <div className="flex justify-between items-center text-blue-700 font-medium border-t border-blue-100 pt-1.5">
                          <span>Credit to Apply:</span>
                          <span className="font-bold">- {formatCurrency(creditToApplyNum)}</span>
                        </div>
                      )}

                      <div className="flex justify-between items-center text-gray-800 font-medium">
                        <span>Cash / Bank Payment:</span>
                        <span className="font-bold text-green-700">{formatCurrency(cashPaymentNum)}</span>
                      </div>

                      <div className="flex justify-between items-center text-gray-900 font-bold border-t border-blue-200 pt-2 text-sm">
                        <span>Total Balance Settled:</span>
                        <span className="text-blue-700">{formatCurrency(totalSettled)}</span>
                      </div>

                      <div className="flex justify-between items-center text-gray-600 text-xs">
                        <span>Remaining Outstanding Balance:</span>
                        <span className={remainingOutstanding > 0 ? "text-orange-600 font-bold" : "text-green-600 font-bold"}>
                          {formatCurrency(remainingOutstanding)}
                        </span>
                      </div>

                      {availableCredit > 0 && (
                        <div className="flex justify-between items-center text-blue-900 font-semibold text-xs border-t border-blue-200 pt-1.5">
                          <span>Remaining Supplier Credit:</span>
                          <span>{formatCurrency(Math.max(availableCredit - creditToApplyNum + extraCreditCreated, 0))}</span>
                        </div>
                      )}

                      {extraCreditCreated > 0 && (
                        <div className="flex justify-between items-center text-emerald-800 font-semibold text-xs pt-1">
                          <span>Extra Supplier Credit Created:</span>
                          <span>+ {formatCurrency(extraCreditCreated)}</span>
                        </div>
                      )}
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
                      <Label className="text-sm font-medium text-gray-700">Quick Amounts for Cash Payment</Label>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {quickAmounts.map((amount) => (
                          <Button
                            key={amount}
                            type="button"
                            variant="outline"
                            onClick={() => setPaymentAmount(amount.toString())}
                            className="h-9 text-xs rounded-lg border-2 hover:border-blue-500 hover:bg-blue-50 transition-all duration-200"
                          >
                            {amount === Math.max(outstandingBalance - creditToApplyNum, 0) ? "Full Remaining" : formatCurrency(amount)}
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
                        placeholder="Add any notes about this transaction..."
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
                  Payment and credit will be allocated to oldest purchases first
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
                    disabled={isLoading || (cashPaymentNum <= 0 && creditToApplyNum <= 0)}
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
                        {cashPaymentNum > 0 ? `Pay ${formatCurrency(cashPaymentNum)}` : "Apply Credit"}
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
