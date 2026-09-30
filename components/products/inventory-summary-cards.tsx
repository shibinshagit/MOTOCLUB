"use client"

import { useEffect, useState } from "react"
import { Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { getInventoryValuationSummary, type InventoryValuationSummary } from "@/app/actions/inventory-summary-actions"

interface InventorySummaryCardsProps {
  userId: number
  refreshKey?: number
  currency?: string
}

export function InventorySummaryCards({ userId, refreshKey = 0, currency = "INR" }: InventorySummaryCardsProps) {
  const [summary, setSummary] = useState<InventoryValuationSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setLoading(true)
    getInventoryValuationSummary(userId)
      .then((res) => {
        if (cancelled) return
        if (res.success && res.data) {
          setSummary(res.data)
          setFailed(false)
        } else {
          setFailed(true)
        }
      })
      .catch(() => !cancelled && setFailed(true))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [userId, refreshKey])

  const money = (v: number | null | undefined) =>
    v === null || v === undefined
      ? "—"
      : new Intl.NumberFormat("en-IN", { style: "currency", currency: currency || "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
  const count = (v: number | null | undefined) =>
    v === null || v === undefined ? "—" : new Intl.NumberFormat("en-IN").format(v)

  const noRecord = summary?.unitsWithoutPurchaseRecord ?? 0
  const cards = [
    { label: "Products in Stock", value: count(summary?.totalProductsInStock), sub: "Distinct products" },
    { label: "Total Stock Units", value: count(summary?.totalStockUnits), sub: "Current quantity" },
    {
      label: "Inventory Cost Value",
      value: money(summary?.inventoryCostValue),
      sub: "Acquisition/accounting",
      tip: "Accounting/acquisition value of current stock.",
    },
    {
      label: "Purchase Invoice Value",
      value: money(summary?.purchaseInvoiceValue),
      sub: "Invoice/grand-total basis",
      tip:
        "Current stock value based on purchase invoice amounts, including applicable purchase taxes and charges." +
        (noRecord > 0 ? ` ${count(noRecord)} unit(s) have no purchase record and are valued at cost.` : ""),
    },
    {
      label: "Current Retail Value",
      value: money(summary?.currentRetailValue),
      sub: "Current selling value",
      tip: "Current selling-price value of available stock.",
    },
  ]

  return (
    <TooltipProvider delayDuration={150}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{card.label}</span>
              {card.tip ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label={`${card.label} info`} className="text-slate-400 hover:text-slate-600">
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">{card.tip}</TooltipContent>
                </Tooltip>
              ) : null}
            </div>
            <div className={`mt-1 text-xl font-bold text-slate-900 ${loading ? "animate-pulse text-slate-300" : ""}`}>
              {loading && !summary ? "…" : failed && !summary ? "—" : card.value}
            </div>
            <div className="text-[11px] font-medium text-slate-500">{card.sub}</div>
          </div>
        ))}
      </div>
    </TooltipProvider>
  )
}

export default InventorySummaryCards
