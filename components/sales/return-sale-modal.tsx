"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FormAlert } from "@/components/ui/form-alert"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"
import { Loader2, RotateCcw, AlertTriangle, ArrowLeft, CheckCircle2, Package, Wrench } from "lucide-react"
import { processSaleReturn } from "@/app/actions/sale-return-actions"
import { useSelector } from "react-redux"
import { selectDeviceCurrency, selectDeviceId } from "@/store/slices/deviceSlice"

interface ReturnSaleModalProps {
  isOpen: boolean
  onClose: () => void
  saleId: number | null
  saleData: any
  saleItems: any[]
  currency?: string
  onSuccess: () => void
}

export default function ReturnSaleModal({
  isOpen,
  onClose,
  saleId,
  saleData,
  saleItems,
  currency = "AED",
  onSuccess,
}: ReturnSaleModalProps) {
  const { toast } = useToast()
  const reduxDeviceId = useSelector(selectDeviceId)
  const reduxCurrency = useSelector(selectDeviceCurrency) || currency

  const [step, setStep] = useState<"edit" | "confirm">("edit")
  const [returnQuantities, setReturnQuantities] = useState<Record<number, number>>({})
  const [refundAmount, setRefundAmount] = useState<string>("")
  const [isRefundManuallyEdited, setIsRefundManuallyEdited] = useState<boolean>(false)
  const [refundPaymentMethod, setRefundPaymentMethod] = useState<string>("Cash")
  const [reason, setReason] = useState<string>("")
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Initialize form state when modal opens
  useEffect(() => {
    if (isOpen && saleItems && saleItems.length > 0) {
      const initialQtyMap: Record<number, number> = {}
      saleItems.forEach((item) => {
        initialQtyMap[item.id] = 0
      })
      setReturnQuantities(initialQtyMap)
      setRefundAmount("0")
      setIsRefundManuallyEdited(false)
      setRefundPaymentMethod(saleData?.payment_method || "Cash")
      setReason("")
      setStep("edit")
      setErrorMessage(null)
    }
  }, [isOpen, saleItems, saleData])

  const formatCurrency = (amount: number | string) => {
    const num = typeof amount === "string" ? Number.parseFloat(amount) : amount
    if (isNaN(num)) return `${reduxCurrency} 0.00`
    return `${reduxCurrency} ${num.toFixed(2)}`
  }

  // Calculate remaining returnable qty for an item
  const getRemainingReturnableQty = (item: any) => {
    const soldQty = Number(item.quantity) || 0
    const returnedQty = Number(item.returned_quantity) || 0
    return Math.max(0, soldQty - returnedQty)
  }

  // Handle return quantity change per item line
  const handleQuantityChange = (itemId: number, value: string, maxQty: number) => {
    const parsed = Number.parseInt(value, 10)
    let validValue = isNaN(parsed) ? 0 : parsed
    if (validValue < 0) validValue = 0
    if (validValue > maxQty) validValue = maxQty

    const newQtyMap = { ...returnQuantities, [itemId]: validValue }
    setReturnQuantities(newQtyMap)

    // Recalculate suggested refund if user has not manually overridden refund amount
    if (!isRefundManuallyEdited) {
      let suggestedTotal = 0
      saleItems.forEach((item) => {
        const qty = newQtyMap[item.id] || 0
        const price = Number(item.price) || 0
        suggestedTotal += qty * price
      })
      setRefundAmount(suggestedTotal.toString())
    }
  }

  // Calculate current total returned product value
  const calculateTotalReturnValue = () => {
    let total = 0
    saleItems.forEach((item) => {
      const qty = returnQuantities[item.id] || 0
      const price = Number(item.price) || 0
      total += qty * price
    })
    return total
  }

  const calculatedReturnValue = calculateTotalReturnValue()
  const parsedRefundAmount = Number.parseFloat(refundAmount) || 0

  // Count of total items selected for return
  const totalReturnedUnitsCount = Object.values(returnQuantities).reduce((a, b) => a + b, 0)

  // Validate form
  const validateForm = (): boolean => {
    setErrorMessage(null)

    if (totalReturnedUnitsCount <= 0) {
      setErrorMessage("Please select at least 1 item unit to return.")
      return false
    }

    // Check item level quantity boundaries
    for (const item of saleItems) {
      const returnQty = returnQuantities[item.id] || 0
      const remainingQty = getRemainingReturnableQty(item)
      if (returnQty < 0 || returnQty > remainingQty) {
        setErrorMessage(
          `Invalid return quantity (${returnQty}) for ${item.product_name || item.service_name || "item"}. Max returnable is ${remainingQty}.`
        )
        return false
      }
    }

    if (isNaN(parsedRefundAmount) || parsedRefundAmount < 0) {
      setErrorMessage("Refund amount cannot be negative.")
      return false
    }

    if (parsedRefundAmount > calculatedReturnValue) {
      setErrorMessage(
        `Refund amount (${formatCurrency(parsedRefundAmount)}) cannot exceed total returned product value (${formatCurrency(calculatedReturnValue)}).`
      )
      return false
    }

    return true
  }

  const handleGoToConfirm = () => {
    if (validateForm()) {
      setStep("confirm")
    }
  }

  const handleConfirmSubmit = async () => {
    if (!validateForm() || !saleId) return

    try {
      setIsSubmitting(true)
      setErrorMessage(null)

      const itemsToSubmit = saleItems
        .filter((item) => (returnQuantities[item.id] || 0) > 0)
        .map((item) => ({
          saleItemId: item.id,
          returnQuantity: returnQuantities[item.id],
        }))

      const result = await processSaleReturn({
        saleId,
        items: itemsToSubmit,
        refundAmount: parsedRefundAmount,
        refundPaymentMethod,
        reason: reason.trim() || undefined,
        deviceId: reduxDeviceId || undefined,
      })

      if (result.success) {
        notifySuccess(toast, result.message || "Sale return completed successfully", "Return Processed")
        onSuccess()
        onClose()
      } else {
        setErrorMessage(result.message || "Failed to process sale return")
        setStep("edit")
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "An unexpected error occurred")
      setStep("edit")
    } finally {
      setIsSubmitting(false)
    }
  }

  const returnedItemsList = saleItems.filter((item) => (returnQuantities[item.id] || 0) > 0)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent className="w-[95vw] max-w-3xl overflow-hidden border-slate-200 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-slate-200 bg-[#F1F4F9] px-6 py-4 text-left">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <RotateCcw className="h-5 w-5 text-amber-600" />
                Return Sale #{saleId}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-slate-600">
                {step === "edit"
                  ? "Select items and quantities to return, and specify the refund amount."
                  : "Review the return summary before confirming."}
              </DialogDescription>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                Customer: {saleData?.customer_name || "Walk-in"}
              </span>
              <span className="text-xs font-semibold text-slate-700">
                Customer Paid Amount: <strong className="text-emerald-700 font-bold">{formatCurrency(saleData?.received_amount ?? saleData?.total_amount ?? 0)}</strong>
              </span>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[calc(85vh-10rem)] overflow-y-auto p-6 space-y-6">
          {errorMessage ? <FormAlert type="error" message={errorMessage} /> : null}

          {step === "edit" ? (
            <>
              {/* Return Items Selection Table */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Select Return Quantities
                </h3>
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#F1F4F9] text-xs font-semibold uppercase tracking-wider text-slate-600">
                      <tr>
                        <th className="px-4 py-2.5">Item</th>
                        <th className="px-3 py-2.5">Variant / Batch</th>
                        <th className="px-3 py-2.5 text-center">Sold</th>
                        <th className="px-3 py-2.5 text-center">Returned</th>
                        <th className="px-3 py-2.5 text-center">Returnable</th>
                        <th className="px-4 py-2.5 text-center w-32">Return Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {saleItems.map((item) => {
                        const isService = item.item_type === "service" || !!item.service_name
                        const itemName = isService ? item.service_name : item.product_name
                        const remainingQty = getRemainingReturnableQty(item)
                        const currentReturnQty = returnQuantities[item.id] || 0
                        const isFullyReturned = remainingQty <= 0

                        return (
                          <tr key={item.id} className={isFullyReturned ? "bg-slate-50/70 opacity-60" : ""}>
                            <td className="px-4 py-3">
                              <div className="flex items-start gap-2">
                                {isService ? (
                                  <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                                ) : (
                                  <Package className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                                )}
                                <div>
                                  <p className="font-medium text-slate-800">{itemName || "Product"}</p>
                                  <p className="text-xs text-slate-500">
                                    Price: {formatCurrency(item.price)} / unit
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-xs text-slate-600">
                              {item.variant_name ? <div>{item.variant_name}</div> : null}
                              {item.batch_number ? (
                                <div className="text-[11px] text-slate-500 font-mono">
                                  Batch: {item.batch_number}
                                </div>
                              ) : null}
                              {!item.variant_name && !item.batch_number ? "—" : null}
                            </td>
                            <td className="px-3 py-3 text-center font-medium text-slate-800">
                              {item.quantity}
                            </td>
                            <td className="px-3 py-3 text-center text-slate-600">
                              {item.returned_quantity || 0}
                            </td>
                            <td className="px-3 py-3 text-center">
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  remainingQty > 0
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-slate-100 text-slate-500"
                                }`}
                              >
                                {remainingQty}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isFullyReturned ? (
                                <span className="text-xs text-slate-400 font-medium">Fully Returned</span>
                              ) : (
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7 border-slate-300"
                                    onClick={() =>
                                      handleQuantityChange(item.id, (currentReturnQty - 1).toString(), remainingQty)
                                    }
                                    disabled={currentReturnQty <= 0}
                                  >
                                    -
                                  </Button>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={remainingQty}
                                    value={currentReturnQty}
                                    onChange={(e) => handleQuantityChange(item.id, e.target.value, remainingQty)}
                                    className="h-8 w-14 text-center text-xs font-semibold focus:ring-1"
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7 border-slate-300"
                                    onClick={() =>
                                      handleQuantityChange(item.id, (currentReturnQty + 1).toString(), remainingQty)
                                    }
                                    disabled={currentReturnQty >= remainingQty}
                                  >
                                    +
                                  </Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financial & Refund Settings */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs font-medium text-slate-700">Refund Payment Method</Label>
                    <Select value={refundPaymentMethod} onValueChange={setRefundPaymentMethod}>
                      <SelectTrigger className="mt-1 h-9 bg-white text-xs">
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="UPI">UPI / GPay / PhonePe</SelectItem>
                        <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                        <SelectItem value="Card">Credit / Debit Card</SelectItem>
                        <SelectItem value="Customer Credit">Customer Account Balance</SelectItem>
                        <SelectItem value="Cheque">Cheque</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs font-medium text-slate-700">Reason / Return Notes (Optional)</Label>
                    <Input
                      placeholder="e.g. Defective product / Customer changed mind"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="mt-1 h-9 bg-white text-xs"
                    />
                  </div>
                </div>

                <div className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                  <div className="space-y-1.5 border-b border-slate-100 pb-3">
                    <div className="flex justify-between text-xs text-slate-600">
                      <span>Original Sale Total:</span>
                      <span className="font-semibold text-slate-800">
                        {formatCurrency(saleData?.total_amount || 0)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-600">
                      <span>Customer Paid Amount:</span>
                      <span className="font-bold text-emerald-700">
                        {formatCurrency(saleData?.received_amount ?? saleData?.total_amount ?? 0)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-600 border-t border-slate-100 pt-1.5">
                      <span>Calculated Return Value:</span>
                      <span className="font-semibold text-slate-800">
                        {formatCurrency(calculatedReturnValue)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-600">
                      <span>Units Selected for Return:</span>
                      <span className="font-semibold text-slate-800">{totalReturnedUnitsCount} units</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <Label className="text-xs font-bold text-slate-800">Actual Refund Amount</Label>
                      {isRefundManuallyEdited ? (
                        <button
                          type="button"
                          onClick={() => {
                            setRefundAmount(calculatedReturnValue.toString())
                            setIsRefundManuallyEdited(false)
                          }}
                          className="text-[11px] font-medium text-amber-700 underline hover:text-amber-800"
                        >
                          Reset to Calculated
                        </button>
                      ) : null}
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-slate-500">
                        {reduxCurrency}
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        max={calculatedReturnValue}
                        value={refundAmount}
                        onChange={(e) => {
                          setRefundAmount(e.target.value)
                          setIsRefundManuallyEdited(true)
                        }}
                        className="h-9 pl-12 font-bold text-sm text-slate-900 border-amber-300 focus:border-amber-500 focus:ring-amber-500"
                      />
                    </div>

                    {parsedRefundAmount < calculatedReturnValue && totalReturnedUnitsCount > 0 ? (
                      <p className="mt-1.5 text-[11px] text-amber-700 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        Refunding {formatCurrency(calculatedReturnValue - parsedRefundAmount)} less than calculated product value.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Confirmation Step (Requirement 23) */
            <div className="space-y-6">
              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                <h4 className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-amber-600" />
                  Return Summary Review
                </h4>
                <p className="mt-1 text-xs text-slate-600">
                  Please review the details below before completing the return.
                </p>
              </div>

              <div className="space-y-2">
                <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Items to be Returned
                </h5>
                <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 font-semibold text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2">Item</th>
                        <th className="px-3 py-2 text-center">Return Qty</th>
                        <th className="px-3 py-2 text-right">Unit Price</th>
                        <th className="px-4 py-2 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {returnedItemsList.map((item) => {
                        const qty = returnQuantities[item.id] || 0
                        const price = Number(item.price) || 0
                        return (
                          <tr key={item.id}>
                            <td className="px-4 py-2.5 font-medium text-slate-800">
                              {item.product_name || item.service_name}
                              {item.variant_name ? ` (${item.variant_name})` : ""}
                            </td>
                            <td className="px-3 py-2.5 text-center font-bold text-slate-900">
                              {qty}
                            </td>
                            <td className="px-3 py-2.5 text-right text-slate-600">
                              {formatCurrency(price)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold text-slate-900">
                              {formatCurrency(qty * price)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Customer Paid</p>
                  <p className="mt-1 text-sm font-bold text-emerald-700">{formatCurrency(saleData?.received_amount ?? saleData?.total_amount ?? 0)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Restored Stock</p>
                  <p className="mt-1 text-base font-bold text-slate-900">{totalReturnedUnitsCount} units</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Return Value</p>
                  <p className="mt-1 text-base font-bold text-slate-900">{formatCurrency(calculatedReturnValue)}</p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">Actual Refund</p>
                  <p className="mt-1 text-base font-bold text-amber-900">{formatCurrency(parsedRefundAmount)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3 text-center col-span-2 sm:col-span-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Payment Method</p>
                  <p className="mt-1 text-sm font-bold text-slate-800">{refundPaymentMethod}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-slate-200 bg-[#F1F4F9] px-6 py-3 flex items-center justify-between sm:justify-between">
          {step === "confirm" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStep("edit")}
              disabled={isSubmitting}
              className="border-slate-300 bg-white text-xs"
            >
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Back
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
              className="border-slate-300 bg-white text-xs"
            >
              Cancel
            </Button>
          )}

          {step === "edit" ? (
            <Button
              type="button"
              size="sm"
              onClick={handleGoToConfirm}
              disabled={totalReturnedUnitsCount <= 0}
              className="bg-amber-600 text-white text-xs hover:bg-amber-700"
            >
              Review Return
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmSubmit}
              disabled={isSubmitting}
              className="bg-amber-600 text-white text-xs hover:bg-amber-700"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Processing Return...
                </>
              ) : (
                "Confirm Return"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
