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
import { getProfitBreakdown, type ProfitBreakdownData } from "@/app/actions/sale-actions"
import {
  PiggyBank,
  Calendar,
  Layers,
  ShoppingBag,
  TrendingUp,
  TrendingDown,
  Calculator,
  Receipt,
  Wallet,
  AlertCircle,
  RefreshCw,
  Info,
} from "lucide-react"

interface ProfitBreakdownModalProps {
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

export function ProfitBreakdownModal({
  isOpen,
  onClose,
  deviceId,
  dateRange,
  periodLabel,
  currency = "INR",
  filters,
}: ProfitBreakdownModalProps) {
  const [data, setData] = useState<ProfitBreakdownData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 2,
    }).format(amount)
  }

  const loadBreakdown = async () => {
    if (!isOpen) return
    setLoading(true)
    setError(null)
    try {
      const res = await getProfitBreakdown(deviceId || 0, {
        dateFrom: dateRange.from,
        dateTo: dateRange.to,
        staffId: filters?.staffId,
        courierPartnerId: filters?.courierPartnerId,
        courierServiceName: filters?.courierServiceName,
        paymentMethod: filters?.paymentMethod,
        statusFilter: filters?.statusFilter,
      })

      if (res.success && res.data) {
        setData(res.data)
      } else {
        setError(res.message || "Failed to load profit breakdown.")
      }
    } catch (err) {
      console.error("Failed to load profit breakdown data:", err)
      setError("An error occurred while fetching the profit breakdown.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadBreakdown()
    }
  }, [isOpen, deviceId, dateRange.from, dateRange.to, filters?.statusFilter])

  const dateFromFormatted = dateRange.from ? dateRange.from : "Start"
  const dateToFormatted = dateRange.to ? dateRange.to : "End"
  const dateDisplay = periodLabel ? periodLabel : `${dateFromFormatted} – ${dateToFormatted}`

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-0 gap-0 sm:rounded-xl">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 rounded-t-xl">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-600/20 text-emerald-400 rounded-lg border border-emerald-500/30">
                <PiggyBank className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-white tracking-wide">
                  Profit & Loss Breakdown
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" />
                  <span>Period: <strong className="text-slate-200">{dateDisplay}</strong></span>
                </DialogDescription>
              </div>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-5 bg-slate-50/50">
          {loading ? (
            <div className="space-y-4 py-4">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          ) : error ? (
            <div className="p-6 text-center space-y-3">
              <AlertCircle className="h-10 w-10 text-rose-500 mx-auto" />
              <p className="text-sm font-medium text-slate-800">{error}</p>
              <Button size="sm" variant="outline" onClick={loadBreakdown} className="gap-2">
                <RefreshCw className="h-4 w-4" /> Retry
              </Button>
            </div>
          ) : data ? (
            <>
              {/* Summary Cards Row */}
              <div className="grid grid-cols-2 gap-3">
                {/* Gross Profit Card */}
                <div className="bg-emerald-50/80 border border-emerald-200 p-3.5 rounded-xl">
                  <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider block">
                    Gross Profit
                  </span>
                  <span className="text-xl font-extrabold text-emerald-700 block mt-1">
                    {formatAmount(data.grossProfit)}
                  </span>
                  <span className="text-[11px] text-emerald-600 block mt-0.5">
                    Sales Revenue − COGS
                  </span>
                </div>

                {/* Net Profit Card */}
                <div className="bg-blue-50/80 border border-blue-200 p-3.5 rounded-xl">
                  <span className="text-xs font-semibold text-blue-800 uppercase tracking-wider block">
                    Net Profit
                  </span>
                  <span className="text-xl font-extrabold text-blue-700 block mt-1">
                    {formatAmount(data.netProfit)}
                  </span>
                  <span className="text-[11px] text-blue-600 block mt-0.5">
                    After Operating Expenses
                  </span>
                </div>
              </div>

              {/* Section 1: SALES / ORDERS GROSS PROFIT */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <ShoppingBag className="h-4 w-4 text-blue-600" />
                    1. Sales & Inventory Performance
                  </h4>
                  <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-700 border-slate-200">
                    {data.validOrders} Valid Orders
                  </Badge>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">Total Sales Revenue:</span>
                    <span className="font-semibold text-slate-900">{formatAmount(data.salesRevenue)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">Cost of Goods Sold (COGS):</span>
                    <span className="font-semibold text-rose-600">− {formatAmount(data.salesCogs)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 font-bold text-slate-900 text-sm bg-slate-50 px-2 rounded-md">
                    <span>Order Gross Profit:</span>
                    <span className="text-emerald-600">{formatAmount(data.orderGrossProfit)}</span>
                  </div>
                </div>
              </div>

              {/* Section 2: OTHER BUSINESS INCOME */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-emerald-600" />
                  2. Other Business Income
                </h4>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">Petty Cash / Non-Sales Income:</span>
                    <span className="font-semibold text-slate-900">{formatAmount(data.pettyCashProfit)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">Other Legitimate Profit / Adjustments:</span>
                    <span className="font-semibold text-slate-900">{formatAmount(data.otherProfit)}</span>
                  </div>
                </div>
              </div>

              {/* Section 3: EXPENSES & NET PROFIT */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Wallet className="h-4 w-4 text-rose-600" />
                  3. Operating Expenses & Net Calculation
                </h4>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">Operating Expenses (Shipping, Salaries, Manual Debits):</span>
                    <span className="font-semibold text-rose-600">− {formatAmount(data.operatingExpenses)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 font-bold text-slate-900 text-sm bg-blue-50 px-2 rounded-md">
                    <span>Final Net Profit:</span>
                    <span className="text-blue-700">{formatAmount(data.netProfit)}</span>
                  </div>
                </div>
              </div>

              {/* Section 4: FORMULA RECONCILIATION FOR ACCOUNTANTS */}
              <div className="bg-slate-100/80 border border-slate-200/80 rounded-xl p-3.5 space-y-2 text-[11px] text-slate-600">
                <div className="flex items-center gap-1.5 font-bold text-slate-800">
                  <Calculator className="h-3.5 w-3.5 text-indigo-600" />
                  <span>Formula Reconciliation</span>
                </div>
                <p className="leading-relaxed">
                  <strong className="text-slate-800">Gross Profit</strong> = Sales Revenue ({formatAmount(data.salesRevenue)}) − COGS ({formatAmount(data.salesCogs)}) + Other Income ({formatAmount(data.otherIncome)}) = <strong className="text-emerald-700">{formatAmount(data.grossProfit)}</strong>
                </p>
                <p className="leading-relaxed">
                  <strong className="text-slate-800">Net Profit</strong> = Gross Profit ({formatAmount(data.grossProfit)}) − Operating Expenses ({formatAmount(data.operatingExpenses)}) = <strong className="text-blue-700">{formatAmount(data.netProfit)}</strong>
                </p>
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

export default ProfitBreakdownModal
