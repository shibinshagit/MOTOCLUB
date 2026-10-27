"use client"

import { useEffect, useState } from "react"
import { Receipt, CreditCard, CheckCircle2, Package, Info } from "lucide-react"
import { getPurchaseSummary } from "@/app/actions/purchase-actions"
import { getSalesSummaryCards } from "@/app/actions/sale-actions"
import { SalesBreakdownModal } from "@/components/shared/sales-breakdown-modal"
import { useAppSelector } from "@/store/hooks"
import { selectDeviceId, selectDeviceCurrency } from "@/store/slices/deviceSlice"
import { selectDateRange } from "@/store/slices/dateRangeSlice"
import { cn, formatCurrency as formatMoney } from "@/lib/utils"

export interface PurchaseManagerSummaryData {
  total: number
  paid: number
  remaining: number
}

export interface OrdersSummaryData {
  total: number
  total_amount?: number
}

interface PurchaseManagerKpiCardsProps {
  deviceId?: number
  globalDateRange?: { from?: string; to?: string }
  summary?: PurchaseManagerSummaryData | null
  ordersSummary?: OrdersSummaryData | null
  formatCurrency?: (amount: number) => string
  refreshKey?: number
  className?: string
  onTotalOrdersClick?: () => void
}

const DASH = "—"

export default function PurchaseManagerKpiCards({
  deviceId: propDeviceId,
  globalDateRange: propGlobalDateRange,
  summary: propSummary,
  ordersSummary: propOrdersSummary,
  formatCurrency,
  refreshKey = 0,
  className,
  onTotalOrdersClick,
}: PurchaseManagerKpiCardsProps) {
  const reduxDeviceId = useAppSelector(selectDeviceId)
  const reduxDateRange = useAppSelector(selectDateRange)
  const deviceCurrency = useAppSelector(selectDeviceCurrency) || "INR"

  const effectiveDeviceId = propDeviceId ?? reduxDeviceId ?? 0
  const effectiveDateRange = propGlobalDateRange ?? reduxDateRange

  const [fetchedSummary, setFetchedSummary] = useState<PurchaseManagerSummaryData | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const [fetchedOrdersSummary, setFetchedOrdersSummary] = useState<OrdersSummaryData | null>(null)
  const [isLoadingOrders, setIsLoadingOrders] = useState(false)
  const [isBreakdownModalOpen, setIsBreakdownModalOpen] = useState(false)

  // Fetch Purchase Summary
  useEffect(() => {
    if (propSummary !== undefined) {
      setFetchedSummary(null)
      return
    }

    if (!effectiveDeviceId) return

    let cancelled = false
    setIsLoading(true)

    getPurchaseSummary(effectiveDeviceId, {
      dateFrom: effectiveDateRange?.from,
      dateTo: effectiveDateRange?.to,
    })
      .then((res) => {
        if (!cancelled && res.success && res.summary) {
          setFetchedSummary({
            total: res.summary.total,
            paid: res.summary.paid,
            remaining: res.summary.remaining,
          })
        }
      })
      .catch((err) => console.error("Fetch purchase manager summary error:", err))
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [effectiveDeviceId, effectiveDateRange?.from, effectiveDateRange?.to, propSummary, refreshKey])

  // Fetch Total Orders Summary (using exact same Admin staff logic)
  useEffect(() => {
    if (propOrdersSummary !== undefined) {
      setFetchedOrdersSummary(null)
      return
    }

    if (!effectiveDeviceId) return

    let cancelled = false
    setIsLoadingOrders(true)

    getSalesSummaryCards(effectiveDeviceId, {
      dateFrom: effectiveDateRange?.from,
      dateTo: effectiveDateRange?.to,
    })
      .then((res) => {
        if (!cancelled && res.success && res.counts) {
          setFetchedOrdersSummary({
            total: res.counts.total,
            total_amount: res.counts.total_amount,
          })
        }
      })
      .catch((err) => console.error("Fetch total orders summary error:", err))
      .finally(() => {
        if (!cancelled) setIsLoadingOrders(false)
      })

    return () => {
      cancelled = true
    }
  }, [effectiveDeviceId, effectiveDateRange?.from, effectiveDateRange?.to, propOrdersSummary, refreshKey])

  const activeSummary = propSummary !== undefined ? propSummary : fetchedSummary
  const activeOrdersSummary = propOrdersSummary !== undefined ? propOrdersSummary : fetchedOrdersSummary

  const formatAmount = (amt: number) => {
    if (formatCurrency) return formatCurrency(amt)
    return formatMoney(Number(amt || 0), deviceCurrency)
  }

  const ordersCount = activeOrdersSummary?.total ?? 0
  const ordersAmount = activeOrdersSummary?.total_amount ?? 0

  return (
    <>
      <div className={cn("grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4", className)}>
        {/* CARD 1 — TOTAL ORDERS (Same count & logic as Admin) */}
        <div
          role={onTotalOrdersClick ? "button" : undefined}
          onClick={onTotalOrdersClick}
          className={cn(
            "flex flex-col justify-between rounded-xl border border-violet-200 bg-violet-50/90 p-3.5 sm:p-4 text-left transition-all shadow-xs min-w-0 min-h-[96px]",
            onTotalOrdersClick ? "cursor-pointer hover:border-violet-300 hover:shadow-sm" : ""
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] font-bold uppercase tracking-wider text-violet-700">
                Total Orders
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsBreakdownModalOpen(true)
                }}
                title="View sales breakdown"
                className="p-0.5 rounded-full hover:bg-violet-200/60 text-violet-600 hover:text-violet-800 transition-colors cursor-pointer"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </div>
            <Package className="h-4 w-4 text-violet-600 shrink-0" />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2 min-w-0">
            <div className="min-w-0">
              <div className="text-xl font-extrabold text-slate-900 leading-tight">
                {isLoadingOrders && !activeOrdersSummary ? (
                  <div className="h-6 w-24 bg-violet-200/60 rounded animate-pulse" />
                ) : (
                  <>
                    {ordersCount}{" "}
                    <span className="text-xs font-normal text-slate-500">
                      {ordersCount === 1 ? "Order" : "Orders"}
                    </span>
                  </>
                )}
              </div>
              <div className="text-xs font-semibold text-violet-700 mt-0.5 truncate">
                {isLoadingOrders && !activeOrdersSummary ? DASH : formatAmount(ordersAmount)}
              </div>
            </div>
            <span className="text-[10px] font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full border border-violet-200 shrink-0">
              All Orders
            </span>
          </div>
        </div>

        {/* CARD 2 — TOTAL PURCHASE AMOUNT */}
        <div className="flex flex-col justify-between rounded-xl border border-purple-200 bg-purple-50/90 p-3.5 sm:p-4 shadow-xs transition-all min-w-0 min-h-[96px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700">
              Total Purchase Amount
            </span>
            <Receipt className="h-4 w-4 text-purple-600 shrink-0" />
          </div>
          <div className="mt-2 text-xl font-extrabold text-purple-900 tracking-tight leading-none truncate">
            {isLoading && !activeSummary ? (
              <div className="h-6 w-28 bg-purple-200/60 rounded animate-pulse" />
            ) : activeSummary ? (
              formatAmount(activeSummary.total)
            ) : (
              DASH
            )}
          </div>
        </div>

        {/* CARD 3 — TOTAL CREDITS */}
        <div className="flex flex-col justify-between rounded-xl border border-amber-200 bg-amber-50/90 p-3.5 sm:p-4 shadow-xs transition-all min-w-0 min-h-[96px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
              Total Credits
            </span>
            <CreditCard className="h-4 w-4 text-amber-600 shrink-0" />
          </div>
          <div className="mt-2 text-xl font-extrabold text-amber-900 tracking-tight leading-none truncate">
            {isLoading && !activeSummary ? (
              <div className="h-6 w-28 bg-amber-200/60 rounded animate-pulse" />
            ) : activeSummary ? (
              formatAmount(activeSummary.remaining)
            ) : (
              DASH
            )}
          </div>
        </div>

        {/* CARD 4 — TOTAL PAID */}
        <div className="flex flex-col justify-between rounded-xl border border-emerald-200 bg-emerald-50/90 p-3.5 sm:p-4 shadow-xs transition-all min-w-0 min-h-[96px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
              Total Paid
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          </div>
          <div className="mt-2 text-xl font-extrabold text-emerald-900 tracking-tight leading-none truncate">
            {isLoading && !activeSummary ? (
              <div className="h-6 w-28 bg-emerald-200/60 rounded animate-pulse" />
            ) : activeSummary ? (
              formatAmount(activeSummary.paid)
            ) : (
              DASH
            )}
          </div>
        </div>
      </div>

      {effectiveDeviceId > 0 && (
        <SalesBreakdownModal
          isOpen={isBreakdownModalOpen}
          onClose={() => setIsBreakdownModalOpen(false)}
          deviceId={effectiveDeviceId}
          dateRange={effectiveDateRange || {}}
          currency={deviceCurrency}
        />
      )}
    </>
  )
}
