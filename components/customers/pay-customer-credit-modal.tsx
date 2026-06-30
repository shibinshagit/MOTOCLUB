"use client"

import type React from "react"
import { useEffect, useState } from "react"
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
  User,
  Banknote,
  ArrowRight,
  X,
} from "lucide-react"
import { collectCustomerCredit } from "@/app/actions/customer-payment-actions"
import type { CustomerPaymentAllocation } from "@/app/actions/customer-payment-actions"
import { useSelector } from "react-redux"
import type { RootState } from "@/store/store"

interface PayCustomerCreditModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  customer: {
    customer_id: number
    customer_name: string
    still_to_collect: number
  }
  userId: number
  deviceId: number
}

export default function PayCustomerCreditModal({
  isOpen,
  onClose,
  onSuccess,
  customer,
  userId,
  deviceId,
}: PayCustomerCreditModalProps) {
  const [paymentAmount, setPaymentAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("Cash")
  const [notes, setNotes] = useState("")
  const [paymentDate, setPaymentDate] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paymentResult, setPaymentResult] = useState<{
    totalPaid: number
    allocations: CustomerPaymentAllocation[]
    remainingCredit: number
    customerName: string
  } | null>(null)

  const currency = useSelector((state: RootState) => state.device.currency) || "AED"
  const formatCurrency = (amount: number) => `${currency} ${amount.toFixed(2)}`
  const maxAmount = customer.still_to_collect
  const today = new Date().toISOString().split("T")[0]

  useEffect(() => {
    if (isOpen) {
      setPaymentAmount("")
      setPaymentMethod("Cash")
      setNotes("")
      setPaymentDate("")
      setError(null)
      setPaymentResult(null)
    }
  }, [isOpen])

  const handleClose = () => {
    if (paymentResult) onSuccess()
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const amount = Number.parseFloat(paymentAmount)
    if (!amount || amount <= 0) {
      setError("Please enter a valid payment amount")
      return
    }
    if (amount > maxAmount + 0.01) {
      setError(`Payment cannot exceed outstanding balance of ${formatCurrency(maxAmount)}`)
      return
    }

    let finalPaymentDate: Date | undefined
    if (paymentDate) {
      const selectedDate = new Date(paymentDate)
      if (Number.isNaN(selectedDate.getTime())) {
        setError("Please enter a valid payment date")
        return
      }
      finalPaymentDate = selectedDate
    }

    setIsLoading(true)
    try {
      const result = await collectCustomerCredit(
        customer.customer_id,
        amount,
        userId,
        deviceId,
        paymentMethod,
        notes.trim() || undefined,
        finalPaymentDate,
      )

      if (result.success && result.data) {
        setPaymentResult(result.data)
      } else {
        setError(result.message || "Failed to process payment")
      }
    } catch (err) {
      console.error("Customer payment error:", err)
      setError("An unexpected error occurred while processing payment")
    } finally {
      setIsLoading(false)
    }
  }

  const quickAmounts = [
    Math.min(100, maxAmount),
    Math.min(500, maxAmount),
    Math.min(1000, maxAmount),
    maxAmount,
  ].filter((amount, index, arr) => arr.indexOf(amount) === index && amount > 0)

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="max-w-2xl max-h-[95vh] overflow-hidden p-0 [&>button]:hidden">
        {paymentResult ? (
          <div className="flex flex-col max-h-[90vh]">
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white p-4">
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle className="h-8 w-8" />
                <div>
                  <h2 className="text-xl font-bold">Payment collected</h2>
                  <p className="text-green-100 text-sm">From {paymentResult.customerName}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-white/10 p-3 text-center">
                  <div className="text-xl font-bold">{formatCurrency(paymentResult.totalPaid)}</div>
                  <div className="text-xs text-green-100">Collected</div>
                </div>
                <div className="rounded-lg bg-white/10 p-3 text-center">
                  <div className="text-xl font-bold">{paymentResult.allocations.length}</div>
                  <div className="text-xs text-green-100">Sales Updated</div>
                </div>
                <div className="rounded-lg bg-white/10 p-3 text-center">
                  <div className="text-xl font-bold">{formatCurrency(paymentResult.remainingCredit)}</div>
                  <div className="text-xs text-green-100">Still to collect</div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {paymentResult.allocations.map((allocation) => (
                <div
                  key={allocation.saleId}
                  className="flex items-center justify-between rounded-lg border p-3 bg-gray-50"
                >
                  <div>
                    <div className="font-medium">Sale #{allocation.saleId}</div>
                    <div className="text-xs text-gray-500">
                      Left: {formatCurrency(allocation.remainingBalance)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{formatCurrency(allocation.allocatedAmount)}</span>
                    <ArrowRight className="h-4 w-4 text-gray-400" />
                    <Badge variant={allocation.newStatus === "Completed" ? "default" : "secondary"}>
                      {allocation.newStatus}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t p-4 flex justify-end">
              <Button onClick={handleClose}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col max-h-[90vh]">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5" />
                <div>
                  <h2 className="text-lg font-bold">Collect payment</h2>
                  <p className="text-blue-100 text-sm">Oldest unpaid sales are paid first</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={handleClose} className="text-white hover:bg-white/20">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {error && (
                <Card className="border-red-200 bg-red-50">
                  <CardContent className="p-3 flex items-center text-red-800 text-sm">
                    <AlertCircle className="h-4 w-4 mr-2" />
                    {error}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <User className="h-5 w-5 text-blue-600" />
                    <div>
                      <div className="font-semibold">{customer.customer_name}</div>
                      <div className="text-xs text-gray-500">Customer #{customer.customer_id}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500">Still to collect</div>
                    <div className="text-xl font-bold text-emerald-600">{formatCurrency(maxAmount)}</div>
                  </div>
                </CardContent>
              </Card>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="customer-pay-amount">Amount *</Label>
                    <Input
                      id="customer-pay-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={maxAmount}
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="0.00"
                      required
                    />
                    <p className="text-xs text-gray-500">Maximum: {formatCurrency(maxAmount)}</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Payment Method *</Label>
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
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customer-pay-date">Payment Date (optional)</Label>
                  <Input
                    id="customer-pay-date"
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    max={today}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Quick Amounts</Label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {quickAmounts.map((amount) => (
                      <Button
                        key={amount}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPaymentAmount(amount.toString())}
                      >
                        {amount === maxAmount ? "Full" : formatCurrency(amount)}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customer-pay-notes">Notes (optional)</Label>
                  <Textarea
                    id="customer-pay-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Payment reference or notes..."
                  />
                </div>
              </form>
            </div>

            <div className="border-t p-4 flex justify-between items-center gap-3">
              <p className="text-xs text-gray-500 hidden sm:block">Collects from oldest sales first</p>
              <div className="flex gap-2 ml-auto">
                <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={isLoading || !paymentAmount}>
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Banknote className="h-4 w-4 mr-2" />
                      Collect {paymentAmount ? formatCurrency(Number.parseFloat(paymentAmount)) : "Amount"}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
