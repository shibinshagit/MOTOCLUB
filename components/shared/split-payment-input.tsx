"use client"

import React, { useEffect } from "react"
import { Plus, Trash2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PaymentRecordInput } from "@/types/payment"

export const PAYMENT_METHOD_OPTIONS = [
  { value: "Cash", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "Card", label: "Card" },
  { value: "Bank Transfer", label: "Bank Transfer" },
  { value: "Cheque", label: "Cheque" },
  { value: "COD", label: "Cash on Delivery (COD)" },
]

export interface SplitPaymentRow extends PaymentRecordInput {
  rowId: string
}

interface SplitPaymentInputProps {
  totalAmount: number
  payments: PaymentRecordInput[]
  onChange: (updatedPayments: PaymentRecordInput[], isValid: boolean) => void
  paymentStatus?: string
  onPaymentStatusChange?: (status: string) => void
  currencySymbol?: string
  disabled?: boolean
  className?: string
}

export function SplitPaymentInput({
  totalAmount,
  payments,
  onChange,
  paymentStatus,
  onPaymentStatusChange,
  currencySymbol = "INR",
  disabled = false,
  className = "",
}: SplitPaymentInputProps) {
  // Convert incoming payments array to rows with unique rowId for UI state management
  const [rows, setRows] = React.useState<SplitPaymentRow[]>(() => {
    if (payments && payments.length > 0) {
      return payments.map((p, idx) => ({
        ...p,
        rowId: p.id ? String(p.id) : `row-${idx}-${Date.now()}`,
        amount: Number(p.amount) || 0,
        paymentMethod: p.paymentMethod || "Cash",
        referenceNumber: p.referenceNumber || "",
      }))
    }
    return [
      {
        rowId: `row-0-${Date.now()}`,
        paymentMethod: "Cash",
        amount: totalAmount > 0 ? totalAmount : 0,
        referenceNumber: "",
      },
    ]
  })

  // Synchronize internal rows when payments prop changes externally (e.g. loading edit data)
  useEffect(() => {
    if (payments && payments.length > 0) {
      // Check if deep equal to avoid infinite loop
      const currentSerialized = JSON.stringify(
        rows.map((r) => ({
          method: r.paymentMethod,
          amount: Number(r.amount) || 0,
          ref: r.referenceNumber || "",
        }))
      )
      const propSerialized = JSON.stringify(
        payments.map((p) => ({
          method: p.paymentMethod,
          amount: Number(p.amount) || 0,
          ref: p.referenceNumber || "",
        }))
      )

      if (currentSerialized !== propSerialized) {
        setRows(
          payments.map((p, idx) => ({
            ...p,
            rowId: p.id ? String(p.id) : `row-${idx}-${Date.now()}`,
            amount: Number(p.amount) || 0,
            paymentMethod: p.paymentMethod || "Cash",
            referenceNumber: p.referenceNumber || "",
          }))
        )
      }
    }
  }, [payments])

  const totalPaid = React.useMemo(() => {
    return rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
  }, [rows])

  const balanceAmount = React.useMemo(() => {
    return Math.max(0, totalAmount - totalPaid)
  }, [totalAmount, totalPaid])

  const excessAmount = React.useMemo(() => {
    return totalPaid > totalAmount && totalAmount > 0 ? totalPaid - totalAmount : 0
  }, [totalAmount, totalPaid])

  const hasNegativeAmount = React.useMemo(() => {
    return rows.some((r) => Number(r.amount) < 0 || isNaN(Number(r.amount)))
  }, [rows])

  const isValid = excessAmount === 0 && !hasNegativeAmount

  const handleRowChange = (
    rowId: string,
    field: keyof PaymentRecordInput,
    value: any
  ) => {
    const updated = rows.map((row) => {
      if (row.rowId === rowId) {
        return { ...row, [field]: value }
      }
      return row
    })
    setRows(updated)
    notifyParent(updated)
  }

  const handleAddRow = () => {
    const remaining = Math.max(0, totalAmount - totalPaid)
    // Suggest payment method that hasn't been used yet if possible
    const usedMethods = new Set(rows.map((r) => r.paymentMethod))
    const availableMethod =
      PAYMENT_METHOD_OPTIONS.find((m) => !usedMethods.has(m.value))?.value ||
      "UPI"

    const newRow: SplitPaymentRow = {
      rowId: `row-${Date.now()}-${Math.random()}`,
      paymentMethod: availableMethod,
      amount: remaining > 0 ? remaining : 0,
      referenceNumber: "",
    }

    const updated = [...rows, newRow]
    setRows(updated)
    notifyParent(updated)
  }

  const handleRemoveRow = (rowId: string) => {
    if (rows.length <= 1) return
    const updated = rows.filter((r) => r.rowId !== rowId)
    setRows(updated)
    notifyParent(updated)
  }

  const notifyParent = (updatedRows: SplitPaymentRow[]) => {
    const sumPaid = updatedRows.reduce(
      (sum, r) => sum + (Number(r.amount) || 0),
      0
    )
    const excess = sumPaid > totalAmount && totalAmount > 0 ? sumPaid - totalAmount : 0
    const hasNeg = updatedRows.some(
      (r) => Number(r.amount) < 0 || isNaN(Number(r.amount))
    )
    const valid = excess === 0 && !hasNeg

    const cleaned: PaymentRecordInput[] = updatedRows.map((r) => ({
      id: r.id,
      paymentMethod: r.paymentMethod,
      amount: Number(r.amount) || 0,
      referenceNumber: r.referenceNumber?.trim() || undefined,
      notes: r.notes?.trim() || undefined,
    }))

    onChange(cleaned, valid)
  }

  const formatCurrency = (num: number) => {
    return `${currencySymbol} ${num.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold uppercase tracking-wider text-gray-700">
          Payment Details
        </Label>
        <span className="text-xs text-gray-500">
          {rows.length} payment method{rows.length > 1 ? "s" : ""}
        </span>
      </div>

      <div className="space-y-2">
        {rows.map((row, index) => (
          <div
            key={row.rowId}
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2 rounded-lg border border-gray-200 bg-gray-50/50"
          >
            <div className="flex-1 sm:w-1/3">
              <Label className="text-[11px] text-gray-500 mb-1 block sm:hidden">
                Method #{index + 1}
              </Label>
              <select
                disabled={disabled}
                className="flex h-8 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:opacity-50"
                value={row.paymentMethod}
                onChange={(e) =>
                  handleRowChange(row.rowId, "paymentMethod", e.target.value)
                }
              >
                {PAYMENT_METHOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 sm:w-1/3">
              <Label className="text-[11px] text-gray-500 mb-1 block sm:hidden">
                Amount
              </Label>
              <div className="relative">
                <Input
                  disabled={disabled}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={row.amount === 0 && row.amount.toString() === "0" ? "" : row.amount}
                  onChange={(e) => {
                    const val = e.target.value === "" ? 0 : Number.parseFloat(e.target.value)
                    handleRowChange(row.rowId, "amount", isNaN(val) ? 0 : val)
                  }}
                  className="h-8 text-xs bg-white border-gray-300 text-gray-900 pr-2 focus-visible:ring-1"
                />
              </div>
            </div>

            <div className="flex-1 sm:w-1/3">
              <Label className="text-[11px] text-gray-500 mb-1 block sm:hidden">
                Reference No. (Optional)
              </Label>
              <Input
                disabled={disabled}
                type="text"
                placeholder="Ref / Transaction ID"
                value={row.referenceNumber || ""}
                onChange={(e) =>
                  handleRowChange(row.rowId, "referenceNumber", e.target.value)
                }
                className="h-8 text-xs bg-white border-gray-300 text-gray-900"
              />
            </div>

            {rows.length > 1 && !disabled && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveRow(row.rowId)}
                className="h-8 w-8 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50 self-end sm:self-center"
                title="Remove Payment Method"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {!disabled && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddRow}
          className="h-7 text-xs font-medium border-dashed border-gray-300 text-gray-700 hover:border-gray-400 hover:bg-gray-50"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Payment Method
        </Button>
      )}

      {/* Validation alert */}
      {excessAmount > 0 && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>
            Payment amount exceeds transaction total by {formatCurrency(excessAmount)}.
          </span>
        </div>
      )}

      {hasNegativeAmount && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>Payment amounts cannot be negative.</span>
        </div>
      )}

      {/* Payment Summary Footer */}
      <div className="p-3 rounded-lg border border-gray-200 bg-gray-50 space-y-1.5 text-xs">
        <div className="flex justify-between text-gray-600">
          <span>Total Amount:</span>
          <span className="font-semibold text-gray-900">
            {formatCurrency(totalAmount)}
          </span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>Total Paid:</span>
          <span className="font-semibold text-emerald-700">
            {formatCurrency(totalPaid)}
          </span>
        </div>
        <div className="flex justify-between text-gray-600">
          <span>Balance Amount:</span>
          <span
            className={`font-bold ${
              balanceAmount > 0 ? "text-amber-600" : "text-emerald-600"
            }`}
          >
            {formatCurrency(balanceAmount)}
          </span>
        </div>
        <div className="flex justify-between items-center text-gray-600 pt-1 border-t border-gray-200">
          <span className="font-medium text-gray-700">Payment Status:</span>
          {onPaymentStatusChange ? (
            <select
              disabled={disabled}
              value={paymentStatus || "Paid"}
              onChange={(e) => onPaymentStatusChange(e.target.value)}
              className="h-7 text-xs font-semibold rounded border border-gray-300 bg-white px-2 py-0.5 text-gray-900 focus:outline-none"
            >
              <option value="Paid">Paid</option>
              <option value="Credit">Credit / Partial</option>
              <option value="Pending">Pending</option>
            </select>
          ) : (
            <span className={`font-semibold px-2 py-0.5 rounded text-xs ${
              paymentStatus === "Paid" || paymentStatus === "Completed"
                ? "bg-emerald-100 text-emerald-800"
                : paymentStatus === "Credit"
                ? "bg-amber-100 text-amber-800"
                : "bg-gray-100 text-gray-800"
            }`}>
              {paymentStatus || "Paid"}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
