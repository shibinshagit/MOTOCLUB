"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { getExpenseBreakdown, type ExpenseBreakdownData } from "@/app/actions/sale-actions"
import {
  Wallet,
  Calendar,
  Layers,
  Truck,
  Building,
  Receipt,
  AlertCircle,
  RefreshCw,
  Info,
  PackageX,
  CreditCard,
  Ban,
  CheckCircle2,
} from "lucide-react"

interface ExpenseBreakdownModalProps {
  isOpen: boolean
  onClose: () => void
  deviceId: number
  dateRange: { from?: string; to?: string }
  periodLabel?: string
  currency?: string
  filters?: {
    staffId?: number | "all"
    courierPartnerId?: number | "all"
    courierServiceName?: string | "all"
    paymentMethod?: string | "all"
    statusFilter?: string | "all"
  }
}

function formatCurrency(amount: number, currency = "INR"): string {
  if (!Number.isFinite(amount)) return `${currency === "INR" || !currency ? "₹" : currency} 0.00`
  const symbol = currency === "INR" || !currency ? "₹" : `${currency} `
  const isNegative = amount < 0
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount))
  return isNegative ? `-${symbol}${formatted}` : `${symbol}${formatted}`
}

export function ExpenseBreakdownModal({
  isOpen,
  onClose,
  deviceId,
  dateRange,
  periodLabel,
  currency = "INR",
  filters = {},
}: ExpenseBreakdownModalProps) {
  const [data, setData] = useState<ExpenseBreakdownData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return

    async function loadData() {
      setIsLoading(true)
      setError(null)
      try {
        const res = await getExpenseBreakdown(deviceId || 0, {
          dateFrom: dateRange.from,
          dateTo: dateRange.to,
          staffId: filters.staffId,
          courierPartnerId: filters.courierPartnerId,
          courierServiceName: filters.courierServiceName,
          paymentMethod: filters.paymentMethod,
          statusFilter: filters.statusFilter,
        })
        if (res.success && res.data) {
          setData(res.data)
        } else {
          setError(res.message || "Failed to load expense breakdown")
        }
      } catch (err) {
        setError("An unexpected error occurred while fetching expense data.")
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [
    isOpen,
    deviceId,
    dateRange.from,
    dateRange.to,
    filters.staffId,
    filters.courierPartnerId,
    filters.courierServiceName,
    filters.paymentMethod,
    filters.statusFilter,
  ])

  const formatAmount = (val: number) => formatCurrency(val, currency)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto p-0 gap-0 border-slate-200 shadow-2xl rounded-xl">
        {/* Header */}
        <DialogHeader className="bg-gradient-to-r from-rose-950 via-slate-900 to-rose-900 p-5 text-white rounded-t-xl sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-rose-500/20 border border-rose-500/30 text-rose-300">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-white tracking-tight">
                  Expense Breakdown
                </DialogTitle>
                <DialogDescription className="text-xs text-rose-200/80 mt-0.5">
                  Authoritative Operating Expenses & Classification Reconciliation
                </DialogDescription>
              </div>
            </div>

            {(dateRange.from || dateRange.to) && (
              <Badge variant="outline" className="bg-rose-900/60 border-rose-700/60 text-rose-100 text-[11px] px-2.5 py-1 flex items-center gap-1.5 shrink-0">
                <Calendar className="h-3.5 w-3.5 text-rose-300" />
                <span>
                  {dateRange.from || "Start"} → {dateRange.to || "End"}
                </span>
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="p-5 space-y-5 bg-slate-50/50">
          {isLoading ? (
            <div className="space-y-4 py-4">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          ) : data ? (
            <>
              {/* Total Expenses Header Card */}
              <div className="bg-gradient-to-br from-rose-50 to-pink-50 border border-rose-200/80 rounded-xl p-4 shadow-sm flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-rose-700 uppercase tracking-wider block">
                    Total Operating Expenses
                  </span>
                  <span className="text-2xl font-black text-rose-950 mt-1 block">
                    {formatAmount(data.operatingExpenses)}
                  </span>
                  <span className="text-[11px] text-rose-600 font-medium mt-0.5 block">
                    Includes all legitimate operational overhead costs
                  </span>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-md shadow-rose-600/20">
                  <Wallet className="h-6 w-6" />
                </div>
              </div>

              {/* Section 1: OPERATING EXPENSES BY CATEGORY */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-rose-600" />
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Operating Expenses by Category
                    </h4>
                  </div>
                  <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-700 font-medium">
                    {data.expenseBreakdown?.length || 0} Categories
                  </Badge>
                </div>

                {data.expenseBreakdown && data.expenseBreakdown.length > 0 ? (
                  <div className="space-y-2">
                    {data.expenseBreakdown.map((item, idx) => {
                      const pct = data.operatingExpenses > 0 ? ((item.amount / data.operatingExpenses) * 100).toFixed(1) : "0.0"
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-xs py-2 px-3 rounded-lg bg-slate-50 hover:bg-slate-100/80 transition-colors border border-slate-100"
                        >
                          <div className="flex items-center gap-2 font-medium text-slate-700">
                            <div className="h-2 w-2 rounded-full bg-rose-500" />
                            <span>{item.category}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] text-slate-400 font-semibold">{pct}%</span>
                            <span className="font-bold text-slate-900">{formatAmount(item.amount)}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic py-2">No operating expenses recorded for this period.</p>
                )}
              </div>

              {/* Section 2: SHIPPING & COURIER RECONCILIATION */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
                  <Truck className="h-4 w-4 text-blue-600" />
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Shipping & Courier Accounting
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-lg p-3">
                    <span className="text-[11px] font-semibold text-emerald-700 block">
                      Customer Shipping Collected
                    </span>
                    <span className="text-base font-bold text-emerald-950 mt-0.5 block">
                      {formatAmount(data.shippingSummary?.customerShippingCollected || 0)}
                    </span>
                    <span className="text-[10px] text-emerald-600 mt-0.5 block font-medium">
                      Pass-through Revenue (NOT an expense)
                    </span>
                  </div>

                  <div className="bg-rose-50/70 border border-rose-200/80 rounded-lg p-3">
                    <span className="text-[11px] font-semibold text-rose-700 block">
                      Actual Courier Cost Paid
                    </span>
                    <span className="text-base font-bold text-rose-950 mt-0.5 block">
                      {formatAmount(data.shippingSummary?.actualCourierCost || 0)}
                    </span>
                    <span className="text-[10px] text-rose-600 mt-0.5 block font-medium">
                      Included in Operating Expenses
                    </span>
                  </div>

                  <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-lg p-3">
                    <span className="text-[11px] font-semibold text-indigo-700 block">
                      Net Shipping Difference
                    </span>
                    <span className="text-base font-bold text-indigo-950 mt-0.5 block">
                      {formatAmount(data.shippingSummary?.netShippingDifference || 0)}
                    </span>
                    <span className="text-[10px] text-indigo-600 mt-0.5 block font-medium">
                      Fulfillment Profit/Margin
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 3: EXCLUDED / NON-EXPENSE MONEY OUT */}
              <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-4 shadow-sm space-y-3 text-xs">
                <div className="flex items-center gap-2 border-b border-amber-200/60 pb-2">
                  <Ban className="h-4 w-4 text-amber-700" />
                  <h4 className="font-bold text-amber-900 uppercase tracking-wider text-[11px]">
                    Excluded / Non-Expense Outflows
                  </h4>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  The following cash outflows are strictly excluded from Operating Expenses to prevent double-counting:
                </p>

                <div className="space-y-2 text-[11px]">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/80 border border-amber-200/60">
                    <div>
                      <span className="font-bold text-slate-800 block">Inventory Purchases</span>
                      <span className="text-[10px] text-slate-500">Accounted for separately as COGS when items sell</span>
                    </div>
                    <span className="font-bold text-slate-900">{formatAmount(data.excludedMoneyOut?.inventoryPurchases || 0)}</span>
                  </div>

                  {(data.excludedMoneyOut?.otherAdjustments || 0) > 0 && (
                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/80 border border-amber-200/60">
                      <div>
                        <span className="font-bold text-slate-800 block">Stock & Sale Adjustments</span>
                        <span className="text-[10px] text-slate-500">Ledger adjustments and discount settlements</span>
                      </div>
                      <span className="font-bold text-slate-900">{formatAmount(data.excludedMoneyOut?.otherAdjustments || 0)}</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="bg-white p-4 border-t border-slate-200 flex justify-end rounded-b-xl">
          <Button variant="outline" size="sm" onClick={onClose} className="px-5 font-semibold">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ExpenseBreakdownModal
