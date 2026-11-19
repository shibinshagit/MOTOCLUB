"use client"

import type React from "react"
import { useEffect, useState, useMemo } from "react"
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
  Receipt,
  Calendar,
} from "lucide-react"
import { collectCustomerCredit } from "@/app/actions/customer-payment-actions"
import type { CustomerPaymentAllocation } from "@/app/actions/customer-payment-actions"
import { getCustomerSales } from "@/app/actions/customer-actions"
import { useSelector } from "react-redux"
import type { RootState } from "@/store/store"
import { formatCurrency as formatMoney } from "@/lib/utils"
import { format } from "date-fns"

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
  companyId?: number
  initialSaleId?: number
  initialAmount?: number
}

export default function PayCustomerCreditModal({
  isOpen,
  onClose,
  onSuccess,
  customer,
  userId,
  deviceId,
  companyId,
  initialSaleId,
  initialAmount,
}: PayCustomerCreditModalProps) {
  const today = format(new Date(), "yyyy-MM-dd")
  const [paymentAmount, setPaymentAmount] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("Cash")
  const [notes, setNotes] = useState("")
  const [paymentDate, setPaymentDate] = useState(today)
  const [selectedSaleIds, setSelectedSaleIds] = useState<number[]>([])
  const [pendingSales, setPendingSales] = useState<any[]>([])
  const [loadingSales, setLoadingSales] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paymentResult, setPaymentResult] = useState<{
    totalPaid: number
    allocations: CustomerPaymentAllocation[]
    remainingCredit: number
    customerName: string
  } | null>(null)

  const currency = useSelector((state: RootState) => state.device.currency) || "AED"
  const formatCurrency = (amount: number) => formatMoney(amount, currency)

  const isCancelledOrReturned = (sale: any) => {
    const status = String(sale?.status || "").toLowerCase().trim()
    const paymentStatus = String(sale?.payment_status || "").toLowerCase().trim()
    const deliveryStatus = String(sale?.delivery_status || "").toLowerCase().trim()
    return (
      status === "cancelled" ||
      status === "returned" ||
      paymentStatus === "cancelled" ||
      paymentStatus === "returned" ||
      deliveryStatus === "returned" ||
      deliveryStatus === "cancelled" ||
      deliveryStatus === "failed"
    )
  }

  // Fetch pending sales when modal opens
  useEffect(() => {
    if (isOpen && customer?.customer_id) {
      setLoadingSales(true)
      getCustomerSales(customer.customer_id, companyId, deviceId, { pendingOnly: true })
        .then((res) => {
          if (res.success && Array.isArray(res.data)) {
            const openOrders = res.data.filter((s: any) => {
              const total = Number(s.total_amount || 0)
              const rec = Number(s.received_amount || 0)
              return total - rec > 0.01 && !isCancelledOrReturned(s)
            })
            setPendingSales(openOrders)
          }
        })
        .catch((err) => console.error("Error fetching open orders:", err))
        .finally(() => setLoadingSales(false))
    } else {
      setPendingSales([])
      setSelectedSaleIds([])
    }
  }, [isOpen, customer?.customer_id, companyId, deviceId])

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setPaymentMethod("Cash")
      setNotes("")
      setPaymentDate(format(new Date(), "yyyy-MM-dd"))
      setError(null)
      setPaymentResult(null)

      if (initialSaleId) {
        setSelectedSaleIds([initialSaleId])
        if (initialAmount !== undefined && initialAmount > 0) {
          setPaymentAmount(initialAmount.toFixed(2))
        } else {
          setPaymentAmount("")
        }
      } else {
        setSelectedSaleIds([])
        setPaymentAmount("")
      }
    }
  }, [isOpen, initialSaleId, initialAmount])

  // Calculate total balance of selected orders
  const selectedBalance = useMemo(() => {
    if (selectedSaleIds.length === 0) return 0
    return pendingSales
      .filter((s) => selectedSaleIds.includes(s.id))
      .reduce((sum, s) => sum + Math.max(0, Number(s.total_amount || 0) - Number(s.received_amount || 0)), 0)
  }, [selectedSaleIds, pendingSales])

  // Max allowed amount: if specific orders are selected, capped at their total balance; otherwise customer's still_to_collect
  const maxAmount = selectedSaleIds.length > 0 ? selectedBalance : customer.still_to_collect

  const handleToggleSale = (saleId: number) => {
    setSelectedSaleIds((prev) => {
      const next = prev.includes(saleId) ? prev.filter((id) => id !== saleId) : [...prev, saleId]
      const newTotal = pendingSales
        .filter((s) => next.includes(s.id))
        .reduce((sum, s) => sum + Math.max(0, Number(s.total_amount || 0) - Number(s.received_amount || 0)), 0)

      if (next.length > 0) {
        setPaymentAmount(newTotal.toFixed(2))
      } else {
        setPaymentAmount("")
      }
      return next
    })
  }

  const handleSelectAll = () => {
    if (selectedSaleIds.length === pendingSales.length && pendingSales.length > 0) {
      setSelectedSaleIds([])
      setPaymentAmount("")
    } else {
      const allIds = pendingSales.map((s) => s.id)
      setSelectedSaleIds(allIds)
      const allTotal = pendingSales.reduce(
        (sum, s) => sum + Math.max(0, Number(s.total_amount || 0) - Number(s.received_amount || 0)),
        0,
      )
      setPaymentAmount(allTotal.toFixed(2))
    }
  }

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

    const targetIds = selectedSaleIds.length > 0 ? selectedSaleIds : undefined

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
        targetIds,
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
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isLoading) handleClose() }}>
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
                  <p className="text-blue-100 text-sm">
                    {selectedSaleIds.length > 0
                      ? `Paying ${selectedSaleIds.length} selected order${selectedSaleIds.length > 1 ? "s" : ""}`
                      : "Select orders below or pay across oldest orders first"}
                  </p>
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
                    <div className="text-xs text-gray-500">
                      {selectedSaleIds.length > 0 ? "Selected orders balance" : "Still to collect"}
                    </div>
                    <div className="text-xl font-bold text-emerald-600">{formatCurrency(maxAmount)}</div>
                  </div>
                </CardContent>
              </Card>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Selectable Pending Orders List */}
                <div className="space-y-2 p-3 bg-slate-50/90 border border-slate-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                      <Receipt className="h-3.5 w-3.5 text-blue-600" />
                      <span>Select Orders to Pay ({pendingSales.length} open)</span>
                    </Label>
                    {pendingSales.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleSelectAll}
                        className="h-6 text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-100/60 px-2"
                      >
                        {selectedSaleIds.length === pendingSales.length ? "Deselect All" : "Select All"}
                      </Button>
                    )}
                  </div>

                  {loadingSales ? (
                    <div className="flex items-center justify-center py-6 text-xs text-gray-500 gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                      <span>Loading pending orders...</span>
                    </div>
                  ) : pendingSales.length === 0 ? (
                    <div className="text-xs text-gray-500 py-3 text-center bg-white rounded border border-dashed border-gray-200">
                      No pending orders found.
                    </div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                      {pendingSales.map((sale) => {
                        const total = Number(sale.total_amount || 0)
                        const rec = Number(sale.received_amount || 0)
                        const due = Math.max(0, total - rec)
                        const isSelected = selectedSaleIds.includes(sale.id)

                        return (
                          <div
                            key={sale.id}
                            onClick={() => handleToggleSale(sale.id)}
                            className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer select-none transition-all ${
                              isSelected
                                ? "border-blue-500 bg-blue-50/80 shadow-xs ring-1 ring-blue-400/40"
                                : "border-gray-200 bg-white hover:border-gray-300"
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}} // Click handled by parent div
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer pointer-events-none"
                              />
                              <div>
                                <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                                  <span>Sale #{sale.id}</span>
                                  <Badge variant="outline" className="text-[10px] py-0 px-1 font-normal text-gray-600">
                                    {sale.status || "Pending"}
                                  </Badge>
                                </div>
                                <div className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                                  <Calendar className="h-3 w-3 text-gray-400" />
                                  <span>{sale.sale_date ? format(new Date(sale.sale_date), "dd MMM yyyy") : "N/A"}</span>
                                  <span>·</span>
                                  <span>Total: {formatCurrency(total)}</span>
                                </div>
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="text-[10px] text-gray-500">Balance Due</div>
                              <div className="font-bold text-amber-700 text-xs sm:text-sm">
                                {formatCurrency(due)}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {selectedSaleIds.length > 0 ? (
                    <div className="flex items-center justify-between text-xs bg-emerald-50 text-emerald-800 px-2.5 py-1.5 rounded-md border border-emerald-200">
                      <span className="font-medium">
                        ✓ {selectedSaleIds.length} order{selectedSaleIds.length === 1 ? "" : "s"} selected
                      </span>
                      <span className="font-bold">
                        Total Selected: {formatCurrency(selectedBalance)}
                      </span>
                    </div>
                  ) : (
                    <p className="text-[11px] text-gray-500 italic">
                      Tap order(s) above to automatically fill the amount, or enter a custom amount to pay across oldest orders first.
                    </p>
                  )}
                </div>

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
                        <SelectItem value="UPI">UPI</SelectItem>
                        <SelectItem value="Card">Card</SelectItem>
                        <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                        <SelectItem value="Check">Check</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customer-pay-date">Payment Date</Label>
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
