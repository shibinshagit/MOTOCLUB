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
import { getSalesBreakdown, type SalesBreakdownData } from "@/app/actions/sale-actions"
import {
  Info,
  Calendar,
  Layers,
  ShoppingBag,
  TrendingUp,
  XCircle,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Globe,
  Wrench,
  PackageCheck,
  RefreshCw,
} from "lucide-react"

interface SalesBreakdownModalProps {
  isOpen: boolean
  onClose: () => void
  deviceId: number
  dateRange: { from?: string; to?: string }
  periodLabel?: string
  currency?: string
  filters?: {
    typeFilter?: string
    staffId?: number | "all"
    courierPartnerId?: number | "all"
    courierServiceName?: string | "all"
    paymentMethod?: string | "all"
    statusFilter?: string | "all"
  }
  onFilterClick?: (filterType: string, filterValue: string) => void
}

export function SalesBreakdownModal({
  isOpen,
  onClose,
  deviceId,
  dateRange,
  periodLabel,
  currency = "INR",
  filters,
  onFilterClick,
}: SalesBreakdownModalProps) {
  const [data, setData] = useState<SalesBreakdownData | null>(null)
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
      const res = await getSalesBreakdown(deviceId || 0, {
        dateFrom: dateRange.from,
        dateTo: dateRange.to,
        typeFilter: filters?.typeFilter,
        staffId: filters?.staffId,
        courierPartnerId: filters?.courierPartnerId,
        courierServiceName: filters?.courierServiceName,
        paymentMethod: filters?.paymentMethod,
        statusFilter: filters?.statusFilter,
      })

      if (res.success && res.data) {
        setData(res.data)
      } else {
        setError(res.message || "Failed to load sales breakdown.")
      }
    } catch (err) {
      console.error("Failed to load breakdown modal data:", err)
      setError("An unexpected error occurred while fetching the breakdown.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadBreakdown()
    }
  }, [isOpen, deviceId, dateRange.from, dateRange.to, filters?.typeFilter, filters?.statusFilter])

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
              <div className="p-2 bg-blue-600/20 text-blue-400 rounded-lg border border-blue-500/30">
                <Info className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-white tracking-wide">
                  Sales & Orders Breakdown
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
        <div className="p-5 space-y-6 bg-slate-50/50">
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
              {/* Top Summary Banner */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm grid grid-cols-2 gap-4">
                <div className="border-r border-slate-100 pr-4">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                    Valid Included Orders
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-bold text-emerald-600">
                      {data.validOrders}
                    </span>
                    <span className="text-xs text-slate-500">orders</span>
                  </div>
                  <span className="text-[11px] text-slate-400 block mt-1">
                    Excluded {data.cancelledOrders} cancelled
                  </span>
                </div>

                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                    Total Valid Revenue
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-xl font-bold text-slate-900">
                      {formatAmount(data.validSalesRevenue)}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 block mt-1">
                    Authoritative financial sales
                  </span>
                </div>
              </div>

              {/* Section 1: ORDER TYPE (Valid Non-Cancelled Sales) */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-blue-600" />
                    Order Type Breakdown (Valid Sales)
                  </h4>
                  <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                    Non-Cancelled
                  </Badge>
                </div>

                <div className="divide-y divide-slate-100 text-sm">
                  {/* Normal Sales */}
                  <div
                    onClick={() => onFilterClick && onFilterClick("type", "normal")}
                    className={`py-2.5 flex items-center justify-between ${
                      onFilterClick ? "cursor-pointer hover:bg-slate-50 px-2 rounded-lg transition-colors" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-slate-100 text-slate-700 rounded-md">
                        <ShoppingBag className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="font-semibold text-slate-800 block text-xs">Normal Sales</span>
                        <span className="text-[11px] text-slate-500">Standard POS counter sales</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-slate-900 text-sm">{data.normalValidOrders}</span>
                      <span className="text-xs text-slate-500 block">{formatAmount(data.normalValidRevenue)}</span>
                    </div>
                  </div>

                  {/* Job Card Sales */}
                  <div
                    onClick={() => onFilterClick && onFilterClick("type", "job_card")}
                    className={`py-2.5 flex items-center justify-between ${
                      onFilterClick ? "cursor-pointer hover:bg-slate-50 px-2 rounded-lg transition-colors" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-indigo-50 text-indigo-700 rounded-md">
                        <Wrench className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="font-semibold text-slate-800 block text-xs">Job Card Sales</span>
                        <span className="text-[11px] text-slate-500">Service & custom job orders</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-indigo-600 text-sm">{data.jobCardValidOrders}</span>
                      <span className="text-xs text-slate-500 block">{formatAmount(data.jobCardValidRevenue)}</span>
                    </div>
                  </div>

                  {/* E-commerce Sales */}
                  <div
                    onClick={() => onFilterClick && onFilterClick("source", "ECOMMERCE")}
                    className={`py-2.5 flex items-center justify-between ${
                      onFilterClick ? "cursor-pointer hover:bg-slate-50 px-2 rounded-lg transition-colors" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-emerald-50 text-emerald-700 rounded-md">
                        <Globe className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="font-semibold text-slate-800 block text-xs">E-commerce Orders</span>
                        <span className="text-[11px] text-slate-500">Online Moto Cart orders</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-emerald-600 text-sm">{data.ecommerceValidOrders}</span>
                      <span className="text-xs text-slate-500 block">{formatAmount(data.ecommerceValidRevenue)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: ORDER STATUS & AUDIT SUMMARY */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Order Status Audit
                </h4>

                <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                  {/* Valid Orders */}
                  <div className="bg-emerald-50/70 border border-emerald-200/60 p-2.5 rounded-lg">
                    <span className="text-[11px] font-medium text-emerald-800 block">Valid Orders</span>
                    <span className="text-lg font-bold text-emerald-700 block mt-0.5">{data.validOrders}</span>
                    <span className="text-[10px] text-emerald-600">Included in Financials</span>
                  </div>

                  {/* Cancelled Orders */}
                  <div
                    onClick={() => onFilterClick && onFilterClick("status", "Cancelled")}
                    className={`bg-rose-50/70 border border-rose-200/60 p-2.5 rounded-lg ${
                      onFilterClick ? "cursor-pointer hover:bg-rose-100/70 transition-colors" : ""
                    }`}
                  >
                    <span className="text-[11px] font-medium text-rose-800 block">Cancelled</span>
                    <span className="text-lg font-bold text-rose-700 block mt-0.5">{data.cancelledOrders}</span>
                    <span className="text-[10px] text-rose-600">Excluded from Sales</span>
                  </div>

                  {/* Total Records */}
                  <div className="bg-slate-100/70 border border-slate-200/60 p-2.5 rounded-lg">
                    <span className="text-[11px] font-medium text-slate-700 block">Total Records</span>
                    <span className="text-lg font-bold text-slate-900 block mt-0.5">{data.totalRecords}</span>
                    <span className="text-[10px] text-slate-500">Raw Period Query</span>
                  </div>
                </div>
              </div>

              {/* Section 3: SALES REVENUE BREAKDOWN */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-blue-600" />
                  Revenue Composition
                </h4>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">POS Counter Sales Revenue:</span>
                    <span className="font-semibold text-slate-900">{formatAmount(data.posValidRevenue)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">E-commerce Sales Revenue:</span>
                    <span className="font-semibold text-emerald-600">{formatAmount(data.ecommerceValidRevenue)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 font-bold text-slate-900 text-sm bg-slate-50 px-2 rounded-md">
                    <span>Total Valid Financial Sales:</span>
                    <span className="text-blue-600">{formatAmount(data.validSalesRevenue)}</span>
                  </div>
                  {data.cancelledSalesRevenue > 0 && (
                    <div className="flex justify-between py-1 text-slate-400 italic">
                      <span>Cancelled Transactions Revenue (Excluded):</span>
                      <span className="line-through">{formatAmount(data.cancelledSalesRevenue)}</span>
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
