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
import { DeliveryStatusSelect } from "@/components/sales/delivery-status-select"
import { parseSaleDate } from "@/lib/utils"

function getSaleStatusLabel(sale: any): string {
  if (sale.status === "Returned") {
    return "Returned";
  }

  if (
    sale.status === "Cancelled" ||
    sale.payment_status?.toLowerCase() === "cancelled" ||
    sale.delivery_status === "Returned" ||
    sale.delivery_status?.toLowerCase() === "returned"
  ) {
    return "Cancelled";
  }

  const pStatus = sale.payment_status?.toLowerCase();
  if (pStatus === "pending") {
    return "Pending";
  }

  const total = Number(sale.total_amount) || 0;
  const received = Number(sale.received_amount) || 0;

  if (pStatus === "paid" || pStatus === "completed" || (total > 0 && received >= total)) {
    return "Completed";
  }
  if (pStatus === "credit" || pStatus === "partial" || (received > 0 && received < total)) {
    return "Credit";
  }
  return "Pending";
}

function SaleStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Credit: "bg-amber-50 text-amber-700 border-amber-200",
    Cancelled: "bg-rose-50 text-rose-700 border-rose-200",
    Returned: "bg-rose-50 text-rose-700 border-rose-200",
    Pending: "bg-slate-50 text-slate-700 border-slate-200",
  }

  const labelMap: Record<string, string> = {
    Completed: "Paid",
    Credit: "Partially Paid",
    Pending: "Pending",
    Cancelled: "Cancelled",
    Returned: "Returned",
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        styles[status] || "border-border bg-muted text-muted-foreground"
      }`}
    >
      {labelMap[status] || status}
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

import { filterSalesSemantic } from "@/lib/sale-search"
import { Search, X, RotateCcw, Printer, Download, Loader2, FileText } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { notifyWarning, notifySuccess, notifyError } from "@/lib/notifications"
import { downloadSalesSummaryPDF, printSalesSummaryReport } from "@/lib/sales-summary-utils"

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
  searchTerm?: string
  onSearchTermChange?: (term: string) => void
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
  deviceId?: number
  onRefreshSales?: () => void
  globalDateRange?: { from?: string; to?: string }
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
  searchTerm: externalSearchTerm,
  onSearchTermChange,
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
  deviceId,
  onRefreshSales,
  globalDateRange,
}: SalesExcelTableProps) {
  const { toast } = useToast()
  const [internalSearchTerm, setInternalSearchTerm] = useState("")
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)

  const activeSearchTerm = externalSearchTerm !== undefined ? externalSearchTerm : internalSearchTerm

  const handleSearchChange = (val: string) => {
    if (onSearchTermChange) {
      onSearchTermChange(val)
    } else {
      setInternalSearchTerm(val)
    }
  }

  const valueGetters = useMemo(
    () => ({
      saleId: (sale: any) => String(sale.id),
      status: (sale: any) => getSaleStatusLabel(sale),
      delivery: (sale: any) => getSaleDeliveryLabel(sale),
      date: (sale: any) => format(parseSaleDate(sale.sale_date), "yyyy-MM-dd"),
      customer: (sale: any) => sale.customer_name || "Walk-in",
      payment: (sale: any) => getPaymentMethodDisplay(sale),
      total: (sale: any) => formatCurrency(Number(sale.total_amount)),
      received: (sale: any) => {
        const isCancelledOrReturned =
          sale.status === "Cancelled" ||
          sale.payment_status?.toLowerCase() === "cancelled" ||
          sale.delivery_status === "Returned" ||
          sale.delivery_status?.toLowerCase() === "returned"
        if (isCancelledOrReturned) return "—"
        const received = (sale.payment_status === "Paid" || sale.payment_status === "Completed")
          ? Number(sale.total_amount || 0)
          : Number(sale.received_amount || 0)
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

    // 1. Semantic Search filtering
    const semanticallyFiltered = filterSalesSemantic(sales, activeSearchTerm)

    // 2. Column filters and sort by Sale ID descending (newest first)
    return semanticallyFiltered
      .filter((sale) =>
        (Object.keys(valueGetters) as ColumnKey[]).every((key) =>
          passesColumnFilter(valueGetters[key](sale), columnFilters[key], uniqueValues[key]),
        ),
      )
      .sort((a, b) => Number(b.id) - Number(a.id))
  }, [sales, activeSearchTerm, columnFilters, uniqueValues, valueGetters, hasLoadedSales])

  const totalSalesAmount = displaySales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0)
  const receivedAmountTotal = displaySales.reduce((sum, sale) => {
    const isCancelledOrReturned =
      sale.status === "Cancelled" ||
      sale.payment_status?.toLowerCase() === "cancelled" ||
      sale.delivery_status === "Returned" ||
      sale.delivery_status?.toLowerCase() === "returned"
    if (isCancelledOrReturned) return sum
    const received = (sale.payment_status === "Paid" || sale.payment_status === "Completed")
      ? Number(sale.total_amount || 0)
      : Number(sale.received_amount || 0)
    return sum + received
  }, 0)
  const remainingAmountTotal = displaySales.reduce((sum, sale) => sum + getRemainingAmount(sale), 0)
  const cogsTotal = displaySales.reduce((sum, sale) => sum + Number(sale.total_cost || 0), 0)
  const profitTotal = displaySales.reduce(
    (sum, sale) => sum + (Number(sale.total_amount || 0) - Number(sale.total_cost || 0)),
    0,
  )

  const pendingSalesCount = useMemo(() => {
    return displaySales.filter((sale) => {
      const isCancelledOrReturned =
        sale.status === "Cancelled" ||
        sale.payment_status?.toLowerCase() === "cancelled" ||
        sale.delivery_status === "Returned" ||
        sale.delivery_status?.toLowerCase() === "returned"
      return !isCancelledOrReturned && (getSaleStatusLabel(sale) === "Pending" || sale.status === "Pending" || sale.payment_status === "Pending")
    }).length
  }, [displaySales])

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

  const handlePrintSummary = () => {
    if (isGeneratingReport) return
    if (!displaySales || displaySales.length === 0) {
      notifyWarning(toast, "No sales found for the selected filters.")
      return
    }
    setIsGeneratingReport(true)
    try {
      printSalesSummaryReport(displaySales, periodLabel, formatCurrency)
      notifySuccess(toast, "Sales summary printable report opened.")
    } catch (err: any) {
      notifyError(toast, err?.message || "Failed to generate print summary.")
    } finally {
      setIsGeneratingReport(false)
    }
  }

  const handleDownloadPDF = async () => {
    if (isGeneratingReport) return
    if (!displaySales || displaySales.length === 0) {
      notifyWarning(toast, "No sales found for the selected filters.")
      return
    }
    setIsGeneratingReport(true)
    try {
      await downloadSalesSummaryPDF(displaySales, periodLabel, formatCurrency, globalDateRange)
      notifySuccess(toast, "Sales summary PDF report downloaded.")
    } catch (err: any) {
      notifyError(toast, err?.message || "Failed to download PDF report.")
    } finally {
      setIsGeneratingReport(false)
    }
  }

  const stickyActionHeaderClass =
    "sticky right-0 z-20 min-w-[5.5rem] whitespace-nowrap border-l border-slate-200 bg-[#F1F4F9] px-4 py-2.5 text-right shadow-[-8px_0_12px_-8px_rgba(15,23,42,0.12)]"
  const stickyActionCellClass = (rowBg: string, isPending: boolean) =>
    `sticky right-0 z-10 min-w-[5.5rem] whitespace-nowrap border-l border-slate-200 px-4 py-2.5 text-right shadow-[-8px_0_12px_-8px_rgba(15,23,42,0.12)] ${
      isPending ? "bg-amber-50/90 group-hover:bg-amber-100/90" : `group-hover:bg-violet-50/50 ${rowBg}`
    }`

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
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 border-b border-slate-200 bg-[#F1F4F9] px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600">
              {displaySales.length} of {sales.length} {sales.length === 1 ? "sale" : "sales"}
            </span>
            {pendingSalesCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                {pendingSalesCount} Pending {pendingSalesCount === 1 ? "Sale" : "Sales"}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 shrink-0 bg-white"
              onClick={onPreviousMonth}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="min-w-[7rem] sm:min-w-[9rem] text-center text-xs font-medium text-foreground">{periodLabel}</span>
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

          <div className="w-full sm:w-auto flex flex-wrap min-h-[28px] items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={activeSearchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search sales, customer, product..."
                aria-label="Global sale search"
                className="h-7 w-full rounded-md border border-slate-200 bg-white py-1 pl-8 pr-7 text-xs outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
              {activeSearchTerm ? (
                <button
                  type="button"
                  onClick={() => handleSearchChange("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            {onRefreshSales && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2.5 text-xs font-medium bg-white hover:bg-slate-50 border-slate-200 shrink-0 text-slate-700 hover:text-slate-900"
                onClick={onRefreshSales}
                disabled={isLoading}
                title="Refresh sales list"
              >
                <RotateCcw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs font-medium bg-white hover:bg-slate-50 border-slate-200 shrink-0 text-slate-700 hover:text-slate-900 shadow-sm"
              onClick={handlePrintSummary}
              disabled={isLoading || isGeneratingReport}
              title="View and print Sales Summary Report"
            >
              {isGeneratingReport ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
              ) : (
                <Printer className="h-3.5 w-3.5 text-slate-600" />
              )}
              <span>View Summary</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs font-medium bg-white hover:bg-slate-50 border-slate-200 shrink-0 text-slate-700 hover:text-slate-900 shadow-sm"
              onClick={handleDownloadPDF}
              disabled={isLoading || isGeneratingReport}
              title="Download Sales Summary PDF Report"
            >
              {isGeneratingReport ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
              ) : (
                <Download className="h-3.5 w-3.5 text-slate-600" />
              )}
              <span>Download PDF</span>
            </Button>

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
                  const received = (sale.payment_status === "Paid" || sale.payment_status === "Completed")
                    ? Number(sale.total_amount || 0)
                    : Number(sale.received_amount || 0)

                  const statusLabel = getSaleStatusLabel(sale)
                  const isCancelledOrReturned =
                    sale.status === "Cancelled" ||
                    sale.payment_status?.toLowerCase() === "cancelled" ||
                    sale.delivery_status === "Returned" ||
                    sale.delivery_status?.toLowerCase() === "returned"

                  const isPending = !isCancelledOrReturned && (statusLabel === "Pending" || sale.status === "Pending" || sale.payment_status === "Pending")

                  const deliveryStatusLower = (sale.delivery_status || "").toLowerCase()
                  let statusClass = "pending"
                  if (isCancelledOrReturned) {
                    statusClass = "cancel"
                  } else if (isPending) {
                    statusClass = "pending"
                  } else if (
                    deliveryStatusLower.includes("deliver") ||
                    deliveryStatusLower.includes("complete") ||
                    sale.payment_status === "Paid" ||
                    sale.payment_status === "Completed"
                  ) {
                    statusClass = "deliver"
                  } else if (
                    deliveryStatusLower.includes("paid") ||
                    deliveryStatusLower.includes("pack") ||
                    deliveryStatusLower.includes("sent") ||
                    deliveryStatusLower.includes("ship") ||
                    deliveryStatusLower.includes("transit") ||
                    deliveryStatusLower.includes("out for delivery") ||
                    deliveryStatusLower.includes("dispatch")
                  ) {
                    statusClass = "ship"
                  } else {
                    statusClass = "deliver"
                  }

                  let baseBgClass = index % 2 === 0
                    ? "bg-white hover:bg-violet-50/50 text-slate-800"
                    : "bg-slate-50/60 hover:bg-violet-50/50 text-slate-800"
                  let borderLeftClass = ""

                  if (statusClass === "pending") {
                    baseBgClass = "bg-amber-100/80 text-amber-950 hover:bg-amber-200/80 font-medium"
                    borderLeftClass = "border-l-4 border-l-amber-500"
                  } else if (statusClass === "ship") {
                    baseBgClass = "bg-blue-100/80 text-blue-950 hover:bg-blue-200/80 font-medium"
                    borderLeftClass = "border-l-4 border-l-blue-500"
                  } else if (statusClass === "deliver") {
                    baseBgClass = "bg-emerald-100/80 text-emerald-950 hover:bg-emerald-200/80 font-medium"
                    borderLeftClass = "border-l-4 border-l-emerald-500"
                  } else if (statusClass === "cancel") {
                    baseBgClass = "bg-rose-100/80 text-rose-950 hover:bg-rose-200/80 font-medium"
                    borderLeftClass = "border-l-4 border-l-rose-500"
                  }

                  const rowClass = `${baseBgClass} ${borderLeftClass}`

                  const isJobCardSale = sale.sale_type === 'job_card' || String(sale.tracking_id || "").startsWith("JC-")

                  return (
                    <tr
                      key={sale.id}
                      onClick={() => onViewSale(sale)}
                      className={`group cursor-pointer border-b border-slate-200 transition-colors ${rowClass}`}
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">{index + 1}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-semibold text-slate-800">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>#{sale.id}</span>
                            {isJobCardSale && (
                              <span className="inline-flex items-center rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-800 border border-blue-200">
                                JOB CARD
                              </span>
                            )}
                            {(sale.source === 'ECOMMERCE' || sale.external_order_id) && (
                              <span className="inline-flex items-center rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-800 border border-purple-200">
                                ECOM
                              </span>
                            )}
                            {sale.status === "Returned" ? (
                              <span className="inline-flex items-center gap-0.5 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800 border border-rose-300">
                                <RotateCcw className="h-2.5 w-2.5" />
                                RETURNED
                              </span>
                            ) : Number(sale.total_returned_qty) > 0 || Number(sale.return_count) > 0 ? (
                              <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-300">
                                <RotateCcw className="h-2.5 w-2.5" />
                                PARTIAL RETURN
                              </span>
                            ) : null}
                          </div>
                          {sale.tracking_id && (
                            <span className="text-[11px] font-mono font-semibold text-blue-700">
                              {sale.tracking_id}
                            </span>
                          )}
                          {sale.external_order_id && (
                            <span className="text-[11px] font-mono font-semibold text-purple-700">
                              {sale.external_order_id}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <SaleStatusBadge status={getSaleStatusLabel(sale)} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                        {getSaleDeliveryLabel(sale) === "Pickup" ? (
                          <DeliveryStatusBadge status="Pickup" />
                        ) : (
                          <DeliveryStatusSelect
                            saleId={sale.id}
                            deviceId={sale.device_id || deviceId || 0}
                            currentStatus={sale.delivery_status || "Pending"}
                            customerName={sale.customer_name}
                            customerPhone={sale.customer_phone || sale.customer_phone_override}
                            trackingId={sale.tracking_id}
                            orderNumber={sale.id}
                            paymentStatus={sale.payment_status}
                            isJobCard={isJobCardSale}
                            userRole="admin"
                            onStatusChange={() => {
                              if (onRefreshSales) {
                                onRefreshSales()
                              }
                            }}
                          />
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-700">
                        {format(parseSaleDate(sale.sale_date), "yyyy-MM-dd")}
                      </td>
                      <td className="max-w-[200px] px-4 py-2.5 text-slate-700">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-slate-800 truncate">{sale.customer_name || "Walk-in"}</span>
                          {sale.items_summary ? (
                            <span className="text-[11px] text-slate-500 truncate" title={sale.items_summary}>
                              {sale.items_summary}
                            </span>
                          ) : null}
                        </div>
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
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-amber-700 font-semibold">
                        {remaining > 0 ? formatCurrency(remaining) : "—"}
                      </td>
                      <td className={stickyActionCellClass(baseBgClass, isPending)}>
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
