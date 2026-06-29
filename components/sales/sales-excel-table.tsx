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
import { getSaleDeliveryLabel } from "@/lib/sale-shipping"

function SaleStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Credit: "bg-amber-50 text-amber-700 border-amber-200",
    Cancelled: "bg-rose-50 text-rose-700 border-rose-200",
    Pending: "bg-amber-50 text-amber-700 border-amber-200",
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        styles[status] || "border-border bg-muted text-muted-foreground"
      }`}
    >
      {status}
    </span>
  )
}

function DeliveryStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Pickup: "bg-slate-50 text-slate-700 border-slate-200",
    Pending: "bg-amber-50 text-amber-700 border-amber-200",
    Packed: "bg-blue-50 text-blue-700 border-blue-200",
    Shipped: "bg-violet-50 text-violet-700 border-violet-200",
    "In transit": "bg-indigo-50 text-indigo-700 border-indigo-200",
    Delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Returned: "bg-rose-50 text-rose-700 border-rose-200",
    Failed: "bg-rose-50 text-rose-700 border-rose-200",
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        styles[status] || "border-border bg-muted text-muted-foreground"
      }`}
    >
      {status}
    </span>
  )
}

type ColumnKey = "saleId" | "status" | "delivery" | "date" | "customer" | "payment" | "total" | "received" | "balance"

type ColumnFilters = Record<ColumnKey, ExcelColumnFilterValue>

function buildInitialFilters(sales: any[], getters: Record<ColumnKey, (sale: any) => string>): ColumnFilters {
  const filters = {} as ColumnFilters
  ;(Object.keys(getters) as ColumnKey[]).forEach((key) => {
    const values = [...new Set(sales.map(getters[key]))]
    filters[key] = createEmptyColumnFilter(values)
  })
  return filters
}

interface SalesExcelTableProps {
  sales: any[]
  periodLabel: string
  isCurrentMonth: boolean
  canGoNextMonth: boolean
  onPreviousMonth: () => void
  onNextMonth: () => void
  onCurrentMonth: () => void
  isLoading: boolean
  error: string | null
  hasLoadedSales: boolean
  hideCogs: boolean
  formatCurrency: (amount: number) => string
  getPaymentMethodDisplay: (sale: any) => string
  getRemainingAmount: (sale: any) => number
  onViewSale: (sale: any) => void
  onEditSale: (sale: any) => void
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
          <Skeleton className="h-4 w-12 justify-self-end" />
        </div>
      ))}
    </div>
  )
}

export default function SalesExcelTable({
  sales,
  periodLabel,
  isCurrentMonth,
  canGoNextMonth,
  onPreviousMonth,
  onNextMonth,
  onCurrentMonth,
  isLoading,
  error,
  hasLoadedSales,
  hideCogs,
  formatCurrency,
  getPaymentMethodDisplay,
  getRemainingAmount,
  onViewSale,
  onEditSale,
}: SalesExcelTableProps) {
  const valueGetters = useMemo(
    () => ({
      saleId: (sale: any) => String(sale.id),
      status: (sale: any) => sale.status || "",
      delivery: (sale: any) => getSaleDeliveryLabel(sale),
      date: (sale: any) => format(new Date(sale.sale_date), "yyyy-MM-dd"),
      customer: (sale: any) => sale.customer_name || "Walk-in",
      payment: (sale: any) => getPaymentMethodDisplay(sale),
      total: (sale: any) => formatCurrency(Number(sale.total_amount)),
      received: (sale: any) => {
        const received =
          sale.status === "Credit"
            ? Number(sale.received_amount || 0)
            : sale.status === "Completed"
              ? Number(sale.total_amount || 0)
              : 0
        return received > 0 ? formatCurrency(received) : "—"
      },
      balance: (sale: any) => {
        const remaining = getRemainingAmount(sale)
        return remaining > 0 ? formatCurrency(remaining) : "—"
      },
    }),
    [formatCurrency, getPaymentMethodDisplay, getRemainingAmount],
  )

  const uniqueValues = useMemo(() => {
    const values = {} as Record<ColumnKey, string[]>
    ;(Object.keys(valueGetters) as ColumnKey[]).forEach((key) => {
      values[key] = [...new Set(sales.map(valueGetters[key]))]
    })
    return values
  }, [sales, valueGetters])

  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(() => buildInitialFilters(sales, valueGetters))

  useEffect(() => {
    if (!hasLoadedSales) return
    setColumnFilters(buildInitialFilters(sales, valueGetters))
  }, [periodLabel, hasLoadedSales, sales, valueGetters])

  const displaySales = useMemo(() => {
    if (!hasLoadedSales) return sales

    return sales.filter((sale) =>
      (Object.keys(valueGetters) as ColumnKey[]).every((key) =>
        passesColumnFilter(valueGetters[key](sale), columnFilters[key], uniqueValues[key]),
      ),
    )
  }, [sales, columnFilters, uniqueValues, valueGetters, hasLoadedSales])

  const totalSalesAmount = displaySales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0)
  const receivedAmountTotal = displaySales.reduce((sum, sale) => {
    if (sale.status === "Credit") return sum + Number(sale.received_amount || 0)
    if (sale.status === "Completed") return sum + Number(sale.total_amount || 0)
    return sum
  }, 0)
  const remainingAmountTotal = displaySales.reduce((sum, sale) => sum + getRemainingAmount(sale), 0)
  const cogsTotal = displaySales.reduce((sum, sale) => sum + Number(sale.total_cost || 0), 0)
  const profitTotal = displaySales.reduce(
    (sum, sale) => sum + (Number(sale.total_amount || 0) - Number(sale.total_cost || 0)),
    0,
  )

  const activeFilterCount = hasLoadedSales
    ? (Object.keys(columnFilters) as ColumnKey[]).filter((key) =>
        isColumnFilterActive(columnFilters[key], uniqueValues[key]),
      ).length
    : 0

  const updateColumnContains = (key: ColumnKey, contains: string) => {
    setColumnFilters((prev) => {
      const current = prev[key] ?? createEmptyColumnFilter(uniqueValues[key] ?? [])
      return {
        ...prev,
        [key]: {
          contains,
          selected: new Set(current.selected),
        },
      }
    })
  }

  const updateColumnSelection = (key: ColumnKey, selected: Set<string>) => {
    setColumnFilters((prev) => {
      const current = prev[key] ?? createEmptyColumnFilter(uniqueValues[key] ?? [])
      return {
        ...prev,
        [key]: {
          contains: current.contains,
          selected: new Set(selected),
        },
      }
    })
  }

  const clearAllFilters = () => {
    setColumnFilters(buildInitialFilters(sales, valueGetters))
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
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-violet-600">Total</p>
          <p className="text-sm font-bold text-violet-700">{formatCurrency(totalSalesAmount)}</p>
        </div>
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-600">Received</p>
          <p className="text-sm font-bold text-emerald-700">{formatCurrency(receivedAmountTotal)}</p>
        </div>
        <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-amber-600">Remaining</p>
          <p className="text-sm font-bold text-amber-700">{formatCurrency(remainingAmountTotal)}</p>
        </div>
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-blue-600">Profit</p>
          <p className="text-sm font-bold text-blue-700">{formatCurrency(profitTotal)}</p>
        </div>
        {!hideCogs && (
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">COGS</p>
            <p className="text-sm font-bold text-foreground">{formatCurrency(cogsTotal)}</p>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-card">
        <div className="relative flex items-center border-b border-slate-200 bg-[#F1F4F9] px-4 py-2">
          <span className="text-xs font-medium text-slate-600">
            {displaySales.length} of {sales.length} {sales.length === 1 ? "sale" : "sales"}
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
                {headerCell("saleId", "Sale #")}
                {headerCell("status", "Status")}
                {headerCell("delivery", "Delivery")}
                {headerCell("date", "Date")}
                {headerCell("customer", "Customer")}
                {headerCell("payment", "Payment")}
                {headerCell("total", "Total", "right")}
                {headerCell("received", "Received", "right")}
                {headerCell("balance", "Balance", "right")}
                <th className={stickyActionHeaderClass}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && !hasLoadedSales ? (
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
              ) : displaySales.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    {sales.length === 0 ? `No sales found for ${periodLabel}` : "No sales match the current column filters"}
                  </td>
                </tr>
              ) : (
                displaySales.map((sale, index) => {
                  const remaining = getRemainingAmount(sale)
                  const received =
                    sale.status === "Credit"
                      ? Number(sale.received_amount || 0)
                      : sale.status === "Completed"
                        ? Number(sale.total_amount || 0)
                        : 0

                  return (
                    <tr
                      key={sale.id}
                      onClick={() => onViewSale(sale)}
                      className={`group cursor-pointer border-b border-slate-200 transition-colors hover:bg-violet-50/50 ${
                        index % 2 === 0 ? "bg-white" : "bg-slate-50/60"
                      }`}
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">{index + 1}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-semibold text-slate-800">#{sale.id}</td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <SaleStatusBadge status={sale.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <DeliveryStatusBadge status={getSaleDeliveryLabel(sale)} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-700">
                        {format(new Date(sale.sale_date), "yyyy-MM-dd")}
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-2.5 text-slate-700">
                        {sale.customer_name || "Walk-in"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                        {getPaymentMethodDisplay(sale)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-slate-800">
                        {formatCurrency(Number(sale.total_amount))}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-emerald-700">
                        {received > 0 ? formatCurrency(received) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-amber-700">
                        {remaining > 0 ? formatCurrency(remaining) : "—"}
                      </td>
                      <td className={stickyActionCellClass(index % 2 === 0 ? "bg-white" : "bg-slate-50/60")}>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            onEditSale(sale)
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
