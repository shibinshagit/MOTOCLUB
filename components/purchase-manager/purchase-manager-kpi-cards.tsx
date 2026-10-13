"use client"

import { useEffect, useState } from "react"
import { Receipt, CreditCard, CheckCircle2 } from "lucide-react"
import { getPurchaseSummary } from "@/app/actions/purchase-actions"
import { useAppSelector } from "@/store/hooks"
import { selectDeviceId, selectDeviceCurrency } from "@/store/slices/deviceSlice"
import { selectDateRange } from "@/store/slices/dateRangeSlice"
import { cn, formatCurrency as formatMoney } from "@/lib/utils"

export interface PurchaseManagerSummaryData {
  total: number
  paid: number
  remaining: number
}

interface PurchaseManagerKpiCardsProps {
  deviceId?: number
  globalDateRange?: { from?: string; to?: string }
  summary?: PurchaseManagerSummaryData | null
  formatCurrency?: (amount: number) => string
  refreshKey?: number
  className?: string
}

const DASH = "—"

export default function PurchaseManagerKpiCards({
  deviceId: propDeviceId,
  globalDateRange: propGlobalDateRange,
  summary: propSummary,
  formatCurrency,
  refreshKey = 0,
  className,
}: PurchaseManagerKpiCardsProps) {
  const reduxDeviceId = useAppSelector(selectDeviceId)
  const reduxDateRange = useAppSelector(selectDateRange)
  const deviceCurrency = useAppSelector(selectDeviceCurrency) || "INR"

  const effectiveDeviceId = propDeviceId ?? reduxDeviceId ?? 0
  const effectiveDateRange = propGlobalDateRange ?? reduxDateRange

  const [fetchedSummary, setFetchedSummary] = useState<PurchaseManagerSummaryData | null>(null)
  const [isLoading, setIsLoading] = useState(false)

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

  const activeSummary = propSummary !== undefined ? propSummary : fetchedSummary

  const formatAmount = (amt: number) => {
    if (formatCurrency) return formatCurrency(amt)
    return formatMoney(Number(amt || 0), deviceCurrency)
  }

  return (
    <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-3", className)}>
      {/* CARD 1 — TOTAL PURCHASE AMOUNT */}
      <div className="flex flex-col justify-between rounded-xl border border-purple-200 bg-purple-50/90 p-4 sm:p-5 shadow-xs transition-all min-h-[96px]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-purple-700">
            Total Purchase Amount
          </span>
          <Receipt className="h-4 w-4 text-purple-600 shrink-0" />
        </div>
        <div className="mt-2 text-xl sm:text-2xl font-extrabold text-purple-900 tracking-tight leading-none">
          {isLoading && !activeSummary ? (
            <div className="h-6 w-28 bg-purple-200/60 rounded animate-pulse" />
          ) : activeSummary ? (
            formatAmount(activeSummary.total)
          ) : (
            DASH
          )}
        </div>
      </div>

      {/* CARD 2 — TOTAL CREDITS */}
      <div className="flex flex-col justify-between rounded-xl border border-amber-200 bg-amber-50/90 p-4 sm:p-5 shadow-xs transition-all min-h-[96px]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-amber-700">
            Total Credits
          </span>
          <CreditCard className="h-4 w-4 text-amber-600 shrink-0" />
        </div>
        <div className="mt-2 text-xl sm:text-2xl font-extrabold text-amber-900 tracking-tight leading-none">
          {isLoading && !activeSummary ? (
            <div className="h-6 w-28 bg-amber-200/60 rounded animate-pulse" />
          ) : activeSummary ? (
            formatAmount(activeSummary.remaining)
          ) : (
            DASH
          )}
        </div>
      </div>

      {/* CARD 3 — TOTAL PAID */}
      <div className="flex flex-col justify-between rounded-xl border border-emerald-200 bg-emerald-50/90 p-4 sm:p-5 shadow-xs transition-all min-h-[96px]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-emerald-700">
            Total Paid
          </span>
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
        </div>
        <div className="mt-2 text-xl sm:text-2xl font-extrabold text-emerald-900 tracking-tight leading-none">
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
  )
}
