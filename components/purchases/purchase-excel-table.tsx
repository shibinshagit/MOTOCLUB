"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { format } from "date-fns"
import { ChevronLeft, ChevronRight, Search, X, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ExcelColumnFilterHeader,
  createEmptyColumnFilter,
  isColumnFilterActive,
  type ExcelColumnFilterValue,
} from "@/components/sales/excel-column-filter"
import {
  getPaginatedUserPurchases,
  getPurchaseSummary,
  getPurchaseFilterOptions,
  type PurchaseColumnFilters,
} from "@/app/actions/purchase-actions"

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
  | "products"
  | "payment"
  | "total"
  | "paid"
  | "balance"
  | "delivery"

type ColumnFilters = Record<ColumnKey, ExcelColumnFilterValue>

const PAGE_SIZE = 25
const DASH = "\u2014"
const COLUMN_KEYS: ColumnKey[] = [
  "purchaseId",
  "status",
  "date",
  "supplier",
  "products",
  "payment",
  "total",
  "paid",
  "balance",
  "delivery",
]
const MONEY_COLUMNS: ColumnKey[] = ["total", "paid", "balance"]

function serializePurchaseRecord(purchase: any) {
  const iso = (value: any) =>
    value && typeof value === "object" ? value.toISOString() : value || ""
  return {
    ...purchase,
    purchase_date: iso(purchase.purchase_date),
    created_at: iso(purchase.created_at),
    updated_at: iso(purchase.updated_at),
  }
}

function buildInitialFilters(): ColumnFilters {
  const filters = {} as ColumnFilters
  COLUMN_KEYS.forEach((key) => {
    filters[key] = createEmptyColumnFilter()
  })
  return filters
}

interface PurchaseExcelTableProps {
  deviceId: number
  isActive?: boolean
  dateFrom?: string
  dateTo?: string
  debouncedSearchTerm: string
  refreshKey?: number
  periodLabel: string
  isCurrentMonth: boolean
  canGoNextMonth: boolean
  searchTerm: string
  onSearchChange: (value: string) => void
  onPreviousMonth: () => void
  onNextMonth: () => void
  onCurrentMonth: () => void
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
  deviceId,
  isActive = true,
  dateFrom,
  dateTo,
  debouncedSearchTerm,
  refreshKey = 0,
  periodLabel,
  isCurrentMonth,
  canGoNextMonth,
  searchTerm,
  onSearchChange,
  onPreviousMonth,
  onNextMonth,
  onCurrentMonth,
  formatCurrency,
  getPaymentMethodDisplay,
  getRemainingAmount,
  getPaidAmount,
  onViewPurchase,
  onEditPurchase,
}: PurchaseExcelTableProps) {
  // Plain value of a row for a column; matches the SQL expressions used by the server-side filters.
  const rawValue = useCallback(
    (key: ColumnKey, purchase: any): string => {
      switch (key) {
        case "purchaseId":
          return String(purchase.id)
        case "status": {
          const s = purchase.status || ""
          return s === "Partial" ? "Cancelled" : s
        }
        case "date":
          return format(new Date(purchase.purchase_date), "dd-MM-yyyy")
        case "supplier":
          return purchase.supplier || DASH
        case "products":
          return purchase.items_summary || DASH
        case "payment":
          return getPaymentMethodDisplay(purchase)
        case "total":
          return (Number(purchase.total_amount) || 0).toFixed(2)
        case "paid":
          return getPaidAmount(purchase).toFixed(2)
        case "balance":
          return getRemainingAmount(purchase).toFixed(2)
        case "delivery":
          return purchase.purchase_status || "Delivered"
      }
    },
    [getPaymentMethodDisplay, getPaidAmount, getRemainingAmount],
  )

  // Text shown for a plain value (money columns are formatted for display).
  const labelOf = useCallback(
    (key: ColumnKey, raw: string): string => {
      if (key === "total") return formatCurrency(Number(raw))
      if (key === "paid" || key === "balance") return Number(raw) > 0 ? formatCurrency(Number(raw)) : DASH
      return raw
    },
    [formatCurrency],
  )

  // ---- server-side list state ----
  const [rows, setRows] = useState<any[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [summary, setSummary] = useState<{
    count: number
    total: number
    paid: number
    remaining: number
    delivered: number
  } | null>(null)
  const [isFetching, setIsFetching] = useState(false)
  const [hasFetched, setHasFetched] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const listFetchIdRef = useRef(0)
  const summaryFetchIdRef = useRef(0)

  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(() => buildInitialFilters())
  const [appliedFilters, setAppliedFilters] = useState<PurchaseColumnFilters>({})
  const [facets, setFacets] = useState<{
    key: string
    options: Partial<Record<ColumnKey, string[]>>
    truncated: Partial<Record<ColumnKey, boolean>>
  } | null>(null)
  const [facetsLoading, setFacetsLoading] = useState(false)
  // Accumulates label -> plain values for money columns so a selection survives list/option reloads.
  const labelRawRef = useRef<Record<string, Map<string, Set<string>>>>({})

  const rememberLabel = useCallback(
    (key: ColumnKey, raw: string) => {
      if (!MONEY_COLUMNS.includes(key)) return
      const map = (labelRawRef.current[key] ||= new Map())
      const label = labelOf(key, raw)
      const set = map.get(label) || new Set<string>()
      set.add(raw)
      map.set(label, set)
    },
    [labelOf],
  )

  const facetsKey = JSON.stringify([deviceId, dateFrom, dateTo, debouncedSearchTerm, refreshKey, refreshTick])
  const currentFacets = facets && facets.key === facetsKey ? facets : null

  // Options for each column dropdown: server values once loaded, otherwise the values on the current page.
  const uniqueValues = useMemo(() => {
    const values = {} as Record<ColumnKey, string[]>
    COLUMN_KEYS.forEach((key) => {
      const raws = currentFacets?.options[key] ?? rows.map((row) => rawValue(key, row))
      values[key] = [...new Set(raws.map((raw) => labelOf(key, raw)))]
    })
    return values
  }, [currentFacets, rows, rawValue, labelOf])

  // Selected labels -> plain values for the server. Omitted when everything is selected (no filtering).
  const buildServerFilters = useCallback((): PurchaseColumnFilters => {
    const out: PurchaseColumnFilters = {}
    COLUMN_KEYS.forEach((key) => {
      const filter = columnFilters[key]
      if (!filter) return
      let contains = filter.contains.trim()
      if (MONEY_COLUMNS.includes(key)) contains = contains.replace(/[^0-9.]/g, "")
      const all = uniqueValues[key] || []
      const truncated = !!currentFacets?.truncated[key]
      let selected: string[] | undefined
      if (filter.selected.size > 0 && (truncated || filter.selected.size < all.length)) {
        selected = [...filter.selected].flatMap((label) =>
          MONEY_COLUMNS.includes(key) ? [...(labelRawRef.current[key]?.get(label) ?? [])] : [label],
        )
      }
      if (contains || (selected && selected.length > 0)) {
        out[key] = { ...(contains ? { contains } : {}), ...(selected && selected.length > 0 ? { selected } : {}) }
      }
    })
    return out
  }, [columnFilters, uniqueValues, currentFacets])

  // Column filters hit the server, so apply them after a short pause (same 400 ms as the search box).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = buildServerFilters()
      setAppliedFilters((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    }, 400)
    return () => window.clearTimeout(timer)
  }, [buildServerFilters])

  // Any change to the query returns to page 1 without an extra request.
  const queryKey = JSON.stringify([deviceId, dateFrom, dateTo, debouncedSearchTerm, appliedFilters])
  const [pageState, setPageState] = useState({ key: queryKey, page: 1 })
  const page = pageState.key === queryKey ? pageState.page : 1
  const setPage = (next: number) => setPageState({ key: queryKey, page: next })

  useEffect(() => {
    if (!deviceId || !isActive) return
    const fetchId = ++listFetchIdRef.current
    setIsFetching(true)
    getPaginatedUserPurchases(deviceId, {
      page,
      pageSize: PAGE_SIZE,
      dateFrom,
      dateTo,
      searchTerm: debouncedSearchTerm,
      columnFilters: appliedFilters,
    })
      .then((res) => {
        if (fetchId !== listFetchIdRef.current) return
        if (res.success) {
          setRows(res.data.map(serializePurchaseRecord))
          setTotalCount(res.totalCount)
          setTotalPages(res.totalPages)
          setFetchError(null)
          res.data.forEach((row: any) => MONEY_COLUMNS.forEach((key) => rememberLabel(key, rawValue(key, row))))
        } else {
          setFetchError(res.message || "Failed to load purchases")
        }
      })
      .catch((err) => {
        console.error("Fetch purchases error:", err)
        if (fetchId !== listFetchIdRef.current) return
        setFetchError("An error occurred while loading purchases")
      })
      .finally(() => {
        if (fetchId !== listFetchIdRef.current) return
        setIsFetching(false)
        setHasFetched(true)
      })
    // appliedFilters is part of queryKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, isActive, page, queryKey, refreshKey, refreshTick])

  // KPI cards are aggregates over the whole filtered range; they do not depend on the page.
  useEffect(() => {
    if (!deviceId || !isActive) return
    const fetchId = ++summaryFetchIdRef.current
    getPurchaseSummary(deviceId, {
      dateFrom,
      dateTo,
      searchTerm: debouncedSearchTerm,
      columnFilters: appliedFilters,
    })
      .then((res) => {
        if (fetchId !== summaryFetchIdRef.current) return
        if (res.success) setSummary(res.summary)
      })
      .catch((err) => console.error("Fetch purchase summary error:", err))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, isActive, queryKey, refreshKey, refreshTick])

  // Dropdown options are loaded the first time a filter dropdown opens for the current range/search.
  const ensureFacets = useCallback(() => {
    if (!deviceId || facetsLoading || (facets && facets.key === facetsKey)) return
    const key = facetsKey
    setFacetsLoading(true)
    getPurchaseFilterOptions(deviceId, { dateFrom, dateTo, searchTerm: debouncedSearchTerm })
      .then((res) => {
        if (!res.success) return
        const options = res.options as Partial<Record<ColumnKey, string[]>>
        MONEY_COLUMNS.forEach((col) => (options[col] || []).forEach((raw) => rememberLabel(col, raw)))
        setFacets({ key, options, truncated: res.truncated as Partial<Record<ColumnKey, boolean>> })
      })
      .catch((err) => console.error("Fetch purchase filter options error:", err))
      .finally(() => setFacetsLoading(false))
  }, [deviceId, facetsLoading, facets, facetsKey, dateFrom, dateTo, debouncedSearchTerm, rememberLabel])

  const displayPurchases = rows
  const showInitialSkeleton = !hasFetched
  const hasActiveQuery = !!debouncedSearchTerm.trim() || Object.keys(appliedFilters).length > 0
  const retry = () => setRefreshTick((t) => t + 1)

  const activeFilterCount = COLUMN_KEYS.filter((key) =>
    isColumnFilterActive(columnFilters[key], uniqueValues[key]),
  ).length

  const clearAllFilters = () => {
    setColumnFilters(buildInitialFilters())
    setAppliedFilters({})
  }

  const updateColumnContains = (key: ColumnKey, contains: string) => {
    setColumnFilters((prev) => ({
      ...prev,
      [key]: { ...prev[key], contains },
    }))
  }

  const updateColumnSelection = (key: ColumnKey, selected: Set<string>) => {
    setColumnFilters((prev) => ({
      ...prev,
      [key]: { ...prev[key], selected },
    }))
  }

  const headerCell = (key: ColumnKey, label: string, align: "left" | "right" = "left") => (
    <th
      className={`whitespace-nowrap px-3 py-1.5 ${align === "right" ? "text-right" : "text-left"}`}
    >
      <ExcelColumnFilterHeader
        columnLabel={label}
        values={uniqueValues[key] || []}
        filter={columnFilters[key] || createEmptyColumnFilter(uniqueValues[key] || [])}
        onContainsChange={(contains) => updateColumnContains(key, contains)}
        onSelectionChange={(selected) => updateColumnSelection(key, selected)}
        onOpenChange={(open) => {
          if (open) ensureFacets()
        }}
        valuesNote={
          currentFacets?.truncated[key]
            ? "Showing the first 300 values. Use Contains to narrow the list."
            : facetsLoading && !currentFacets
              ? "Loading values..."
              : undefined
        }
        align={align}
      />
    </th>
  )

  const stickyActionHeaderClass =
    "whitespace-nowrap bg-[#F1F4F9] px-3 py-1.5 text-right font-semibold uppercase tracking-wide text-slate-600 border-b border-slate-200"

  const stickyActionCellClass = (bgClass: string) =>
    `whitespace-nowrap px-3 py-1.5 text-right font-medium ${bgClass}`

  return (
    <div className="space-y-4">
      {/* KPI Cards Header */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-purple-100 bg-purple-50 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-purple-600">Total</p>
          <p className="text-sm font-bold text-purple-700">{summary ? formatCurrency(summary.total) : DASH}</p>
        </div>
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-600">Paid</p>
          <p className="text-sm font-bold text-emerald-700">{summary ? formatCurrency(summary.paid) : DASH}</p>
        </div>
        <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-amber-600">Remaining</p>
          <p className="text-sm font-bold text-amber-700">{summary ? formatCurrency(summary.remaining) : DASH}</p>
        </div>
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-blue-600">Delivered</p>
          <p className="text-sm font-bold text-blue-700">
            {summary ? `${summary.delivered} of ${summary.count}` : DASH}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-card">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 border-b border-slate-200 bg-[#F1F4F9] px-3 py-2.5 sm:px-4">
          <span className="text-xs font-medium text-slate-600">
            Showing {displayPurchases.length > 0 ? (page - 1) * PAGE_SIZE + 1 : 0}-
            {Math.min(page * PAGE_SIZE, totalCount)} of {totalCount} {totalCount === 1 ? "purchase" : "purchases"}
          </span>

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

          <div className="w-full sm:w-auto flex min-h-[28px] items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 shrink-0 bg-white mr-1"
              onClick={retry}
              disabled={isFetching}
              title="Refresh purchases"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search purchases, supplier, product..."
                aria-label="Global purchase search"
                className="h-7 w-full rounded-md border border-slate-200 bg-white py-1 pl-8 pr-7 text-xs outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
              {searchTerm ? (
                <button
                  type="button"
                  onClick={() => onSearchChange("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  aria-label="Clear global purchase search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
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

        {fetchError && displayPurchases.length > 0 ? (
          <div className="flex items-center justify-between gap-2 border-b border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
            <span>{fetchError}. Showing previously loaded rows.</span>
            <Button variant="outline" size="sm" className="h-6 text-xs" onClick={retry}>
              Retry
            </Button>
          </div>
        ) : null}

        <div className="hidden lg:block overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-[#F1F4F9] text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="w-12 whitespace-nowrap px-3 py-1.5 text-left">#</th>
                {headerCell("purchaseId", "Purchase #")}
                {headerCell("status", "Payment")}
                {headerCell("date", "Date")}
                {headerCell("supplier", "Supplier")}
                {headerCell("products", "Products")}
                {headerCell("payment", "Method")}
                {headerCell("total", "Total", "right")}
                {headerCell("paid", "Paid", "right")}
                {headerCell("balance", "Balance", "right")}
                {headerCell("delivery", "Delivery")}
                <th className={stickyActionHeaderClass}>Action</th>
              </tr>
            </thead>
            <tbody className={isFetching && hasFetched ? "opacity-60 transition-opacity" : "transition-opacity"}>
              {showInitialSkeleton ? (
                <tr>
                  <td colSpan={12}>
                    <TableSkeleton />
                  </td>
                </tr>
              ) : fetchError && displayPurchases.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-8 text-center text-sm text-rose-600">
                    {fetchError}
                    <Button variant="outline" size="sm" className="ml-3 h-7 text-xs" onClick={retry}>
                      Retry
                    </Button>
                  </td>
                </tr>
              ) : displayPurchases.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    {hasActiveQuery
                      ? "No purchases match the current search or column filters"
                      : `No purchases found for ${periodLabel}`}
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
                      <td className="whitespace-nowrap px-3 py-1.5 text-xs text-muted-foreground">{(page - 1) * PAGE_SIZE + index + 1}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 font-semibold text-slate-800">#{purchase.id}</td>
                      <td className="whitespace-nowrap px-3 py-1.5">
                        <PaymentStatusBadge status={paymentStatus} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-slate-700">
                        {format(new Date(purchase.purchase_date), "dd-MM-yyyy")}
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-1.5 text-slate-700">
                        {purchase.supplier || "—"}
                      </td>
                      <td className="max-w-[300px] truncate px-3 py-1.5 text-slate-700" title={purchase.items_summary || undefined}>
                        {purchase.items_summary || "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-slate-600">
                        {getPaymentMethodDisplay(purchase)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right font-medium text-slate-800">
                        {formatCurrency(Number(purchase.total_amount))}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right text-emerald-700">
                        {paid > 0 ? formatCurrency(paid) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right text-amber-700">
                        {remaining > 0 ? formatCurrency(remaining) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5">
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

        {/* MOBILE & TABLET CARD LIST VIEW (< 1024px) */}
        <div className={`block lg:hidden divide-y divide-slate-200 bg-slate-50/50 ${isFetching && hasFetched ? "opacity-60" : ""} transition-opacity`}>
          {showInitialSkeleton ? (
            <div className="p-4 space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                  <div className="flex justify-between">
                    <div className="h-5 w-24 bg-slate-200 animate-pulse rounded" />
                    <div className="h-5 w-16 bg-slate-200 animate-pulse rounded" />
                  </div>
                  <div className="h-4 w-3/4 bg-slate-200 animate-pulse rounded" />
                  <div className="h-8 w-full bg-slate-200 animate-pulse rounded" />
                </div>
              ))}
            </div>
          ) : fetchError && displayPurchases.length === 0 ? (
            <div className="p-6 text-center text-sm text-rose-600 bg-white">
              {fetchError}
              <Button variant="outline" size="sm" className="ml-3 h-7 text-xs" onClick={retry}>
                Retry
              </Button>
            </div>
          ) : displayPurchases.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 bg-white">
              {hasActiveQuery
                ? "No purchases match the current search or column filters"
                : `No purchases found for ${periodLabel}`}
            </div>
          ) : (
            displayPurchases.map((purchase, index) => {
              const remaining = getRemainingAmount(purchase)
              const paid = getPaidAmount(purchase)
              const paymentStatus = purchase.status === "Partial" ? "Cancelled" : purchase.status
              const isEven = index % 2 === 0

              return (
                <div
                  key={purchase.id}
                  onClick={() => onViewPurchase(purchase)}
                  className={`p-3.5 bg-white transition-colors space-y-2.5 cursor-pointer ${isEven ? "" : "bg-slate-50/60"}`}
                >
                  {/* TOP ROW: ID + PAYMENT BADGE + TOTAL */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-blue-700 text-sm">#{purchase.id}</span>
                      </div>
                      <PaymentStatusBadge status={paymentStatus} />
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-extrabold text-slate-900 leading-tight">
                        {formatCurrency(Number(purchase.total_amount))}
                      </div>
                      <div className="mt-0.5 text-[11px] font-medium text-emerald-700">
                        Paid: {paid > 0 ? formatCurrency(paid) : "—"}
                      </div>
                      <div className="mt-0.5 text-[11px] font-medium text-amber-700">
                        Bal: {remaining > 0 ? formatCurrency(remaining) : "—"}
                      </div>
                    </div>
                  </div>

                  {/* SUPPLIER & DATE */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="min-w-0">
                      <span className="text-[10px] font-semibold text-slate-400 block uppercase tracking-wider">
                        Supplier
                      </span>
                      <span className="font-bold text-slate-800 block truncate">
                        {purchase.supplier || "—"}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-semibold text-slate-400 block uppercase tracking-wider">
                        Date
                      </span>
                      <span className="font-semibold text-slate-700 block">
                        {format(new Date(purchase.purchase_date), "dd MMM yyyy")}
                      </span>
                    </div>
                  </div>

                  {/* PRODUCTS SUMMARY */}
                  <div className="text-xs bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <span className="text-[10px] font-semibold text-slate-400 block uppercase tracking-wider mb-0.5">
                      Products
                    </span>
                    <span className="text-slate-600 block truncate">
                      {purchase.items_summary || "—"}
                    </span>
                  </div>

                  {/* BOTTOM ACTIONS */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <DeliveryStatusBadge status={purchase.purchase_status || "Delivered"} />
                      <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                        {getPaymentMethodDisplay(purchase)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        onEditPurchase(purchase)
                      }}
                      className="text-xs font-semibold text-brand-blue hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-md transition-colors"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 bg-[#F1F4F9] px-4 py-3 text-xs font-medium text-slate-600">
          <div>
            Showing {displayPurchases.length > 0 ? (page - 1) * PAGE_SIZE + 1 : 0} to{" "}
            {Math.min(page * PAGE_SIZE, totalCount)} of {totalCount} purchases
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs bg-white border-slate-200"
              disabled={page <= 1 || isFetching}
              onClick={() => setPage(Math.max(1, page - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />
              Previous
            </Button>
            <span className="px-2 text-slate-700 font-semibold">
              Page {page} of {totalPages || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs bg-white border-slate-200"
              disabled={page >= totalPages || isFetching}
              onClick={() => setPage(Math.min(totalPages, page + 1))}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
