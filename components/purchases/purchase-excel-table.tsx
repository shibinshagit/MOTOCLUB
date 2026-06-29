"use client"

import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ExcelColumnFilterHeader,
  createEmptyColumnFilter,
  isColumnFilterActive,
  passesColumnFilter,
  type ExcelColumnFilterValue,
} from "@/components/sales/excel-column-filter"

function PaymentStatusBadge({ status }: { status: string }) {
  const normalized = status === "Partial" ? "Cancelled" : status
  const styles: Record<string, string> = {
    Paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Credit: "bg-amber-50 text-amber-700 border-amber-200",
    Cancelled: "bg-rose-50 text-rose-700 border-rose-200",
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        styles[normalized] || "border-border bg-muted text-muted-foreground"
      }`}
    >
      {normalized}
    </span>
  )
}

function DeliveryStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Pending: "bg-amber-50 text-amber-700 border-amber-200",
    Ordered: "bg-blue-50 text-blue-700 border-blue-200",
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        styles[status] || "border-border bg-muted text-muted-foreground"
      }`}
    >
      {status || "Delivered"}
    </span>
  )
}

type ColumnKey =
  | "purchaseId"
  | "status"
  | "date"
  | "supplier"
  | "payment"
  | "total"
  | "paid"
  | "balance"
  | "delivery"

type ColumnFilters = Record<ColumnKey, ExcelColumnFilterValue>

function buildInitialFilters(
  purchases: any[],
  getters: Record<ColumnKey, (purchase: any) => string>,
): ColumnFilters {
  const filters = {} as ColumnFilters
  ;(Object.keys(getters) as ColumnKey[]).forEach((key) => {
    const values = [...new Set(purchases.map(getters[key]))]
    filters[key] = createEmptyColumnFilter(values)
  })
  return filters
}

interface PurchaseExcelTableProps {
  purchases: any[]
  periodLabel: string
  isCurrentMonth: boolean
  canGoNextMonth: boolean
  onPreviousMonth: () => void
  onNextMonth: () => void
  onCurrentMonth: () => void
  isLoading: boolean
  error: string | null
  hasLoadedPurchases: boolean
  formatCurrency: (amount: number) => string
  getPaymentMethodDisplay: (purchase: any) => string
  getRemainingAmount: (purchase: any) => number
  getPaidAmount: (purchase: any) => number
  onViewPurchase: (purchase: any) => void
  onEditPurchase: (purchase: any) => void
}

function TableSkeleton() {
  return (
    <div className="divide-y divide-slate-200">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="grid grid-cols-10 gap-3 px-4 py-3">
          <Skeleton className="h-4 w-6" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20 justify-self-end" />
          <Skeleton className="h-4 w-20 justify-self-end" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-12 justify-self-end" />
        </div>
      ))}
    </div>
  )
}

export default function PurchaseExcelTable({
  purchases,
  periodLabel,
  isCurrentMonth,
  canGoNextMonth,
  onPreviousMonth,
  onNextMonth,
  onCurrentMonth,
  isLoading,
  error,
  hasLoadedPurchases,
  formatCurrency,
  getPaymentMethodDisplay,
  getRemainingAmount,
  getPaidAmount,
  onViewPurchase,
  onEditPurchase,
}: PurchaseExcelTableProps) {
  const valueGetters = useMemo(
    () => ({
      purchaseId: (purchase: any) => String(purchase.id),
      status: (purchase: any) => {
        const s = purchase.status || ""
        return s === "Partial" ? "Cancelled" : s
      },
      date: (purchase: any) => format(new Date(purchase.purchase_date), "yyyy-MM-dd"),
      supplier: (purchase: any) => purchase.supplier || "—",
      payment: (purchase: any) => getPaymentMethodDisplay(purchase),
      total: (purchase: any) => formatCurrency(Number(purchase.total_amount)),
      paid: (purchase: any) => {
        const paid = getPaidAmount(purchase)
        return paid > 0 ? formatCurrency(paid) : "—"
      },
      balance: (purchase: any) => {
        const remaining = getRemainingAmount(purchase)
        return remaining > 0 ? formatCurrency(remaining) : "—"
      },
      delivery: (purchase: any) => purchase.purchase_status || "Delivered",
    }),
    [formatCurrency, getPaymentMethodDisplay, getRemainingAmount, getPaidAmount],
  )

  const uniqueValues = useMemo(() => {
    const values = {} as Record<ColumnKey, string[]>
    ;(Object.keys(valueGetters) as ColumnKey[]).forEach((key) => {
      values[key] = [...new Set(purchases.map(valueGetters[key]))]
    })
    return values
  }, [purchases, valueGetters])

  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(() =>
    buildInitialFilters(purchases, valueGetters),
  )

  useEffect(() => {
    if (!hasLoadedPurchases) return
    setColumnFilters(buildInitialFilters(purchases, valueGetters))
  }, [periodLabel, hasLoadedPurchases, purchases, valueGetters])

  const displayPurchases = useMemo(() => {
    if (!hasLoadedPurchases) return purchases

    return purchases.filter((purchase) =>
      (Object.keys(valueGetters) as ColumnKey[]).every((key) =>
        passesColumnFilter(valueGetters[key](purchase), columnFilters[key], uniqueValues[key]),
      ),
    )
  }, [purchases, columnFilters, uniqueValues, valueGetters, hasLoadedPurchases])

  const totalAmount = displayPurchases.reduce((sum, p) => sum + Number(p.total_amount || 0), 0)
  const paidTotal = displayPurchases.reduce((sum, p) => sum + getPaidAmount(p), 0)
  const remainingTotal = displayPurchases.reduce((sum, p) => sum + getRemainingAmount(p), 0)
  const deliveredCount = displayPurchases.filter((p) => (p.purchase_status || "Delivered") === "Delivered").length

  const activeFilterCount = hasLoadedPurchases
    ? (Object.keys(columnFilters) as ColumnKey[]).filter((key) =>
        isColumnFilterActive(columnFilters[key], uniqueValues[key]),
      ).length
    : 0

  const updateColumnContains = (key: ColumnKey, contains: string) => {
    setColumnFilters((prev) => {
      const current = prev[key] ?? createEmptyColumnFilter(uniqueValues[key] ?? [])
      return {
        ...prev,
        [key]: { contains, selected: new Set(current.selected) },
      }
    })
  }

  const updateColumnSelection = (key: ColumnKey, selected: Set<string>) => {
    setColumnFilters((prev) => {
      const current = prev[key] ?? createEmptyColumnFilter(uniqueValues[key] ?? [])
      return {
        ...prev,
        [key]: { contains: current.contains, selected: new Set(selected) },
      }
    })
  }

  const clearAllFilters = () => {
    setColumnFilters(buildInitialFilters(purchases, valueGetters))
  }

  const headerCell = (key: ColumnKey, label: string, align: "left" | "right" = "left") => (
    <th className={`whitespace-nowrap px-4 py-2.5 ${align === "right" ? "text-right" : "text-left"}`}>
      <ExcelColumnFilterHeader
        columnLabel={label}
        values={uniqueValues[key]}
        filter={columnFilters[key] ?? createEmptyColumnFilter(uniqueValues[key] ?? [])}
        onContainsChange={(contains) => updateColumnContains(key, contains)}
        onSelectionChange={(selected) => updateColumnSelection(key, selected)}
        align={align}
      />
    </th>
  )

  const stickyActionHeaderClass =
    "sticky right-0 z-20 min-w-[5.5rem] whitespace-nowrap border-l border-slate-200 bg-[#F1F4F9] px-4 py-2.5 text-right shadow-[-8px_0_12px_-8px_rgba(15,23,42,0.12)]"
  const stickyActionCellClass = (rowBg: string) =>
    `sticky right-0 z-10 min-w-[5.5rem] whitespace-nowrap border-l border-slate-200 px-4 py-2.5 text-right shadow-[-8px_0_12px_-8px_rgba(15,23,42,0.12)] group-hover:bg-violet-50/50 ${rowBg}`

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-violet-600">Total</p>
          <p className="text-sm font-bold text-violet-700">{formatCurrency(totalAmount)}</p>
        </div>
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-600">Paid</p>
          <p className="text-sm font-bold text-emerald-700">{formatCurrency(paidTotal)}</p>
        </div>
        <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-amber-600">Remaining</p>
          <p className="text-sm font-bold text-amber-700">{formatCurrency(remainingTotal)}</p>
        </div>
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-blue-600">Delivered</p>
          <p className="text-sm font-bold text-blue-700">
            {deliveredCount} of {displayPurchases.length}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-card">
        <div className="relative flex items-center border-b border-slate-200 bg-[#F1F4F9] px-4 py-2">
          <span className="text-xs font-medium text-slate-600">
            {displayPurchases.length} of {purchases.length}{" "}
            {purchases.length === 1 ? "purchase" : "purchases"}
          </span>

          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 shrink-0 bg-white"
              onClick={onPreviousMonth}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="min-w-[9rem] text-center text-xs font-medium text-foreground">{periodLabel}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 shrink-0 bg-white"
              onClick={onNextMonth}
              disabled={!canGoNextMonth}
              aria-label="Next month"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            {!isCurrentMonth ? (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onCurrentMonth}>
                This month
              </Button>
            ) : null}
          </div>

          <div className="ml-auto flex min-h-[28px] items-center gap-2">
            {activeFilterCount > 0 ? (
              <>
                <span className="text-xs font-medium text-violet-700">
                  {activeFilterCount} column filter{activeFilterCount === 1 ? "" : "s"} active
                </span>
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-xs font-medium text-brand-blue hover:text-blue-700 hover:underline"
                >
                  Clear all
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-[#F1F4F9] text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="w-12 whitespace-nowrap px-4 py-2.5 text-left">#</th>
                {headerCell("purchaseId", "Purchase #")}
                {headerCell("status", "Payment")}
                {headerCell("date", "Date")}
                {headerCell("supplier", "Supplier")}
                {headerCell("payment", "Method")}
                {headerCell("total", "Total", "right")}
                {headerCell("paid", "Paid", "right")}
                {headerCell("balance", "Balance", "right")}
                {headerCell("delivery", "Delivery")}
                <th className={stickyActionHeaderClass}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && !hasLoadedPurchases ? (
                <tr>
                  <td colSpan={11}>
                    <TableSkeleton />
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-sm text-rose-600">
                    {error}
                  </td>
                </tr>
              ) : displayPurchases.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    {purchases.length === 0
                      ? `No purchases found for ${periodLabel}`
                      : "No purchases match the current column filters"}
                  </td>
                </tr>
              ) : (
                displayPurchases.map((purchase, index) => {
                  const remaining = getRemainingAmount(purchase)
                  const paid = getPaidAmount(purchase)
                  const paymentStatus = purchase.status === "Partial" ? "Cancelled" : purchase.status

                  return (
                    <tr
                      key={purchase.id}
                      onClick={() => onViewPurchase(purchase)}
                      className={`group cursor-pointer border-b border-slate-200 transition-colors hover:bg-violet-50/50 ${
                        index % 2 === 0 ? "bg-white" : "bg-slate-50/60"
                      }`}
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">{index + 1}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-semibold text-slate-800">#{purchase.id}</td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <PaymentStatusBadge status={paymentStatus} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-700">
                        {format(new Date(purchase.purchase_date), "yyyy-MM-dd")}
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-2.5 text-slate-700">
                        {purchase.supplier || "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                        {getPaymentMethodDisplay(purchase)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-slate-800">
                        {formatCurrency(Number(purchase.total_amount))}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-emerald-700">
                        {paid > 0 ? formatCurrency(paid) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-amber-700">
                        {remaining > 0 ? formatCurrency(remaining) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <DeliveryStatusBadge status={purchase.purchase_status || "Delivered"} />
                      </td>
                      <td className={stickyActionCellClass(index % 2 === 0 ? "bg-white" : "bg-slate-50/60")}>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            onEditPurchase(purchase)
                          }}
                          className="text-sm font-medium text-brand-blue hover:text-blue-700 hover:underline"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
