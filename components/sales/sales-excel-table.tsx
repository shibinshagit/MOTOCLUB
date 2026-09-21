"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ExcelColumnFilterHeader,
  createEmptyColumnFilter,
  isColumnFilterActive,
  passesColumnFilter,
  type ExcelColumnFilterValue,
} from "@/components/sales/excel-column-filter"
import { getSaleDeliveryLabel, isPendingSale, isCriticalSale, isJobCardSale, isNormalSale } from "@/lib/sale-shipping"
import { DeliveryStatusSelect } from "@/components/sales/delivery-status-select"
import { PhoneCell } from "@/components/sales/phone-cell"
import { TrackingCell } from "@/components/sales/tracking-cell"
import { StaffOwnerSelect } from "@/components/sales/staff-owner-select"
import { parseSaleDate, cn } from "@/lib/utils"
import { printJobCard, printBatchJobCards, printSalesReceipt } from "@/lib/receipt-utils"
import { getSaleDetails, getPaginatedUserSales, getSalesSummaryCards } from "@/app/actions/sale-actions"
import { filterSalesSemantic } from "@/lib/sale-search"
import {
  Search,
  X,
  RotateCcw,
  Printer,
  Download,
  Loader2,
  ShoppingCart,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Eye,
  Edit,
  Layers,
  Plus,
  ChevronLeft,
  ChevronRight,
  MapPin,
  MoreHorizontal,
  Phone,
  ExternalLink,
  Share2,
  Info,
} from "lucide-react"
import { SalesBreakdownModal } from "@/components/shared/sales-breakdown-modal"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/components/ui/use-toast"
import { notifyWarning, notifySuccess, notifyError } from "@/lib/notifications"
import { downloadSalesSummaryPDF, printSalesSummaryReport, downloadSalesSummaryExcel } from "@/lib/sales-summary-utils"
import { JobCardModal } from "@/components/shared/job-card/job-card-modal"

function getSaleStatusLabel(sale: any): string {
  if (sale.status === "Returned") {
    return "Returned"
  }

  if (
    sale.status === "Cancelled" ||
    sale.payment_status?.toLowerCase() === "cancelled" ||
    sale.delivery_status === "Returned" ||
    sale.delivery_status?.toLowerCase() === "returned"
  ) {
    return "Cancelled"
  }

  const pStatus = sale.payment_status?.toLowerCase()
  if (pStatus === "pending") {
    return "Pending"
  }

  const total = Number(sale.total_amount) || 0
  const received = Number(sale.received_amount) || 0

  if (pStatus === "paid" || pStatus === "completed" || (total > 0 && received >= total)) {
    return "Completed"
  }
  if (pStatus === "credit" || pStatus === "partial" || (received > 0 && received < total)) {
    return "Credit"
  }
  return "Pending"
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
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
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
    Paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Packed: "bg-blue-50 text-blue-700 border-blue-200",
    Sent: "bg-purple-50 text-purple-700 border-purple-200",
    Direct: "bg-blue-50 text-blue-700 border-blue-200",
    Shipping: "bg-cyan-50 text-cyan-700 border-cyan-200",
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

type ColumnKey = "saleId" | "status" | "delivery" | "date" | "customer" | "staff" | "payment" | "total" | "received" | "balance"

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
  const [isCreateJobCardOpen, setIsCreateJobCardOpen] = useState(false)
  const [editingJobCardId, setEditingJobCardId] = useState<number | null>(null)

  const handleRowEdit = (sale: any) => {
    if (isJobCardSale(sale)) {
      setEditingJobCardId(sale.id)
    } else {
      onEditSale(sale)
    }
  }

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
      staff: (sale: any) => sale.staff_name || "Store / Admin",
      payment: (sale: any) => getPaymentMethodDisplay(sale),
      total: (sale: any) => formatCurrency(Number(sale.total_amount)),
      received: (sale: any) => {
        const isCancelledOrReturned =
          sale.status === "Cancelled" ||
          sale.payment_status?.toLowerCase() === "cancelled" ||
          sale.delivery_status === "Returned" ||
          sale.delivery_status?.toLowerCase() === "returned"
        if (isCancelledOrReturned) return "—"
        const received =
          sale.payment_status === "Paid" || sale.payment_status === "Completed"
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
  const [cardFilter, setCardFilter] = useState<"all" | "pending" | "critical">("all")
  const [typeFilter, setTypeFilter] = useState<"all" | "normal" | "job_card">("all")
  const [selectedSales, setSelectedSales] = useState<number[]>([])
  const [expandedSaleId, setExpandedSaleId] = useState<number | null>(null)
  const [isBreakdownModalOpen, setIsBreakdownModalOpen] = useState(false)

  // High-performance server-side state
  const [page, setPage] = useState(1)
  const [pageSize] = useState(25)
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [serverSales, setServerSales] = useState<any[]>([])
  const [totalServerCount, setTotalServerCount] = useState(0)
  const [totalServerPages, setTotalServerPages] = useState(0)
  const [serverCardCounts, setServerCardCounts] = useState<{ total: number; pending: number; critical: number } | null>(
    null,
  )
  const [isFetchingServer, setIsFetchingServer] = useState(false)
  const [expandedCache, setExpandedCache] = useState<Record<number, any>>({})
  const [loadingExpandedId, setLoadingExpandedId] = useState<number | null>(null)

  // 250ms search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(activeSearchTerm)
      setPage(1)
    }, 250)
    return () => clearTimeout(timer)
  }, [activeSearchTerm])

  // Fetch paginated sales and card aggregates
  const fetchServerSales = useCallback(async () => {
    if (!deviceId) return
    setIsFetchingServer(true)
    try {
      const [salesRes, cardsRes] = await Promise.all([
        getPaginatedUserSales(deviceId!, {
          page,
          pageSize,
          dateFrom: globalDateRange?.from,
          dateTo: globalDateRange?.to,
          typeFilter,
          cardFilter,
          searchTerm: debouncedSearch,
        }),
        getSalesSummaryCards(deviceId!, {
          dateFrom: globalDateRange?.from,
          dateTo: globalDateRange?.to,
          typeFilter,
          searchTerm: debouncedSearch,
        }),
      ])

      if (salesRes.success && salesRes.data) {
        setServerSales(salesRes.data)
        setTotalServerCount(salesRes.totalCount)
        setTotalServerPages(salesRes.totalPages)
      }
      if (cardsRes.success && cardsRes.counts) {
        setServerCardCounts(cardsRes.counts)
      }
    } catch (err) {
      console.error("Error fetching server sales:", err)
    } finally {
      setIsFetchingServer(false)
    }
  }, [deviceId, page, pageSize, globalDateRange?.from, globalDateRange?.to, typeFilter, cardFilter, debouncedSearch])

  useEffect(() => {
    fetchServerSales()
  }, [fetchServerSales, sales])

  const handleDeliveryStatusChange = useCallback(
    (saleId: number, newStatus: string) => {
      setServerSales((prev) =>
        prev.map((s) => (s.id === saleId ? { ...s, delivery_status: newStatus } : s))
      )
      fetchServerSales()
      if (onRefreshSales) {
        onRefreshSales()
      }
    },
    [fetchServerSales, onRefreshSales]
  )

  // Prefetch next page silently
  useEffect(() => {
    if (deviceId && page < totalServerPages && !isFetchingServer) {
      getPaginatedUserSales(deviceId, {
        page: page + 1,
        pageSize,
        dateFrom: globalDateRange?.from,
        dateTo: globalDateRange?.to,
        typeFilter,
        cardFilter,
        searchTerm: debouncedSearch,
      }).catch(() => {})
    }
  }, [
    deviceId,
    page,
    totalServerPages,
    pageSize,
    globalDateRange?.from,
    globalDateRange?.to,
    typeFilter,
    cardFilter,
    debouncedSearch,
    isFetchingServer,
  ])

  const toggleExpandRow = async (saleId: number) => {
    if (expandedSaleId === saleId) {
      setExpandedSaleId(null)
      return
    }
    setExpandedSaleId(saleId)

    if (!expandedCache[saleId]) {
      setLoadingExpandedId(saleId)
      try {
        const res = await getSaleDetails(saleId)
        if (res.success && res.data) {
          const detailObj = res.data.sale
            ? { ...res.data.sale, items: res.data.items, payments: res.data.payments }
            : res.data
          setExpandedCache((prev) => ({ ...prev, [saleId]: detailObj }))
        }
      } catch (err) {
        console.error("Error loading expanded details:", err)
      } finally {
        setLoadingExpandedId(null)
      }
    }
  }

  const baseFilteredSales = useMemo(() => {
    if (deviceId) return serverSales
    if (!hasLoadedSales) return sales

    const semanticallyFiltered = filterSalesSemantic(sales, activeSearchTerm)
    return semanticallyFiltered.filter((sale) =>
      (Object.keys(valueGetters) as ColumnKey[]).every((key) =>
        passesColumnFilter(valueGetters[key](sale), columnFilters[key], uniqueValues[key]),
      ),
    )
  }, [deviceId, serverSales, sales, activeSearchTerm, columnFilters, uniqueValues, valueGetters, hasLoadedSales])

  const typeFilteredSales = useMemo(() => {
    if (deviceId) return serverSales
    if (typeFilter === "job_card") {
      return baseFilteredSales.filter(isJobCardSale)
    }
    if (typeFilter === "normal") {
      return baseFilteredSales.filter(isNormalSale)
    }
    return baseFilteredSales
  }, [deviceId, serverSales, baseFilteredSales, typeFilter])

  const displaySales = useMemo(() => {
    if (deviceId) return serverSales
    let result = typeFilteredSales
    if (cardFilter === "pending") {
      result = result.filter(isPendingSale)
    } else if (cardFilter === "critical") {
      result = result.filter(isCriticalSale)
    }
    return [...result].sort((a, b) => Number(b.id) - Number(a.id))
  }, [deviceId, serverSales, typeFilteredSales, cardFilter])

  const selectedSalesList = useMemo(() => {
    return displaySales.filter((s) => selectedSales.includes(s.id))
  }, [displaySales, selectedSales])

  const totalCount = serverCardCounts ? serverCardCounts.total : typeFilteredSales.length
  const pendingCount = serverCardCounts ? serverCardCounts.pending : typeFilteredSales.filter(isPendingSale).length
  const criticalCount = serverCardCounts ? serverCardCounts.critical : typeFilteredSales.filter(isCriticalSale).length
  const pendingSalesCount = pendingCount

  const totalSalesAmount = useMemo(
    () => displaySales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0),
    [displaySales],
  )
  const pendingSalesAmount = useMemo(
    () =>
      displaySales.filter(isPendingSale).reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0),
    [displaySales],
  )
  const criticalSalesAmount = useMemo(
    () =>
      displaySales.filter(isCriticalSale).reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0),
    [displaySales],
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
    setCardFilter("all")
    setTypeFilter("all")
    setSelectedSales([])
  }

  const headerCell = (key: ColumnKey, label: string, align: "left" | "right" = "left") => (
    <th className={`whitespace-nowrap px-3 py-1.5 ${align === "right" ? "text-right" : "text-left"}`}>
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

  const getSaleProfit = (sale: any) => {
    const itemsCost =
      sale.items?.reduce(
        (sum: number, i: any) => sum + Number(i.cost || i.cost_price || 0) * Number(i.quantity || 1),
        0,
      ) || 0
    const cost = Number(sale.total_cost) > 0 ? Number(sale.total_cost) : itemsCost
    const totalPrice = Number(sale.total_amount || 0)
    const partnerCourier = Number(sale.expense_courier || 0)

    if (
      sale.status === "Returned" ||
      sale.status === "Cancelled" ||
      sale.delivery_status === "Returned" ||
      sale.delivery_status?.toLowerCase() === "returned" ||
      sale.payment_status?.toLowerCase() === "cancelled"
    ) {
      return 0
    }

    return totalPrice - cost - partnerCourier
  }

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

  const handleDownloadExcel = () => {
    if (isGeneratingReport) return
    if (!displaySales || displaySales.length === 0) {
      notifyWarning(toast, "No sales found for the selected filters.")
      return
    }
    try {
      downloadSalesSummaryExcel(displaySales, periodLabel, globalDateRange)
      notifySuccess(toast, "Sales summary Excel report downloaded.")
    } catch (err: any) {
      notifyError(toast, err?.message || "Failed to download Excel report.")
    }
  }

  const handleBulkPrintInvoices = async () => {
    if (selectedSalesList.length === 0) return
    setIsGeneratingReport(true)
    try {
      for (const sale of selectedSalesList) {
        if (sale.items && sale.items.length > 0) {
          printSalesReceipt(sale, sale.items, "INR", {}, false)
        } else {
          const res = await getSaleDetails(sale.id)
          if (res.success && res.data) {
            printSalesReceipt(res.data.sale, res.data.items, "INR", {}, false)
          }
        }
      }
      notifySuccess(toast, `Sent ${selectedSalesList.length} invoice(s) to print.`)
    } catch (err: any) {
      notifyError(toast, err?.message || "Failed to print selected invoices.")
    } finally {
      setIsGeneratingReport(false)
    }
  }

  const handleBulkPrintLabels = () => {
    if (selectedSalesList.length === 0) return
    printBatchJobCards(selectedSalesList, "INR")
    notifySuccess(toast, `Opened print window for ${selectedSalesList.length} delivery label(s).`)
  }

  const handleBulkPrintJobCards = () => {
    const jobCardSales = selectedSalesList.filter(isJobCardSale)
    if (jobCardSales.length === 0) {
      notifyWarning(toast, "No Job Card orders selected.")
      return
    }
    printBatchJobCards(jobCardSales, "INR")
    notifySuccess(toast, `Opened print window for ${jobCardSales.length} Job Card(s).`)
  }

  const stickyActionHeaderClass =
    "min-w-[5.5rem] whitespace-nowrap border-l border-slate-200 bg-[#F1F4F9] px-3 py-1.5 text-right"
  const stickyActionCellClass = (rowBg: string, isPending: boolean) =>
    `min-w-[5.5rem] whitespace-nowrap border-l border-slate-200 px-3 py-1.5 text-right ${
      isPending ? "bg-amber-50 group-hover:bg-amber-100" : `group-hover:bg-violet-50 ${rowBg}`
    }`

  return (
    <div className="space-y-3 pb-28 sm:pb-6 min-w-0 max-w-full overflow-hidden">
      {/* TYPE FILTER CONTROL BAR */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 p-1 w-full sm:w-auto overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => {
              setTypeFilter("all")
              setPage(1)
              setSelectedSales([])
            }}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer whitespace-nowrap shrink-0",
              typeFilter === "all"
                ? "bg-white text-slate-900 shadow-2xs font-extrabold"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            All Sales ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => {
              setTypeFilter("normal")
              setPage(1)
              setSelectedSales([])
            }}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer whitespace-nowrap shrink-0",
              typeFilter === "normal"
                ? "bg-white text-slate-900 shadow-2xs font-extrabold"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            Normal Sales
          </button>
          <button
            type="button"
            onClick={() => {
              setTypeFilter("job_card")
              setPage(1)
              setSelectedSales([])
            }}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer whitespace-nowrap shrink-0",
              typeFilter === "job_card"
                ? "bg-white text-slate-900 shadow-2xs font-extrabold"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            Job Card Sales
          </button>
        </div>

        <div className="text-xs font-medium text-slate-500 hidden sm:block">
          Unified Sales & Order Management
        </div>
      </div>

      {/* OPERATIONAL CARDS */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {/* CARD 1 — TOTAL SALES */}
        <button
          type="button"
          onClick={() => {
            setCardFilter("all")
            setPage(1)
          }}
          className={cn(
            "flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all cursor-pointer shadow-xs hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-400 min-w-0",
            cardFilter === "all"
              ? "border-violet-500 bg-violet-50/90 ring-2 ring-violet-400/30"
              : "border-slate-200 bg-white hover:border-violet-300 hover:bg-slate-50/50",
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] font-bold uppercase tracking-wider text-violet-700">Total Sales</span>
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
            <ShoppingCart className="h-4 w-4 text-violet-600 shrink-0" />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2 min-w-0">
            <div className="min-w-0">
              <div className="text-xl font-extrabold text-slate-900 leading-tight">
                {totalCount} <span className="text-xs font-normal text-slate-500">{totalCount === 1 ? "Order" : "Orders"}</span>
              </div>
              <div className="text-xs font-semibold text-violet-700 mt-0.5 truncate">
                {formatCurrency(totalSalesAmount)}
              </div>
            </div>
            {cardFilter === "all" && (
              <span className="text-[10px] font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full border border-violet-200 shrink-0">
                All Orders
              </span>
            )}
          </div>
        </button>

        {/* CARD 2 — PENDING ORDERS */}
        <button
          type="button"
          onClick={() => {
            setCardFilter((prev) => (prev === "pending" ? "all" : "pending"))
            setPage(1)
          }}
          className={cn(
            "flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all cursor-pointer shadow-xs hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400 min-w-0",
            cardFilter === "pending"
              ? "border-amber-500 bg-amber-50/90 ring-2 ring-amber-400/30"
              : "border-slate-200 bg-white hover:border-amber-300 hover:bg-slate-50/50",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Pending Orders</span>
            <Clock className="h-4 w-4 text-amber-600 shrink-0" />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2 min-w-0">
            <div className="min-w-0">
              <div className="text-xl font-extrabold text-slate-900 leading-tight">
                {pendingCount} <span className="text-xs font-normal text-slate-500">{pendingCount === 1 ? "Order" : "Orders"}</span>
              </div>
              <div className="text-xs font-semibold text-amber-700 mt-0.5 truncate">
                {formatCurrency(pendingSalesAmount)}
              </div>
            </div>
            {cardFilter === "pending" && (
              <span className="text-[10px] font-bold text-amber-800 bg-amber-200 px-2 py-0.5 rounded-full border border-amber-300 shrink-0">
                Active Filter
              </span>
            )}
          </div>
        </button>

        {/* CARD 3 — CRITICAL ORDERS */}
        <button
          type="button"
          onClick={() => {
            setCardFilter((prev) => (prev === "critical" ? "all" : "critical"))
            setPage(1)
          }}
          className={cn(
            "flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all cursor-pointer shadow-xs hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-400 min-w-0",
            cardFilter === "critical"
              ? "border-rose-500 bg-rose-50/90 ring-2 ring-rose-400/30"
              : "border-slate-200 bg-white hover:border-rose-300 hover:bg-slate-50/50",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Critical Orders</span>
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2 min-w-0">
            <div className="min-w-0">
              <div className="text-xl font-extrabold text-slate-900 leading-tight">
                {criticalCount} <span className="text-xs font-normal text-slate-500">{criticalCount === 1 ? "Order" : "Orders"}</span>
              </div>
              <div className="text-xs font-semibold text-rose-700 mt-0.5 truncate">
                {formatCurrency(criticalSalesAmount)}
              </div>
            </div>
            {cardFilter === "critical" && (
              <span className="text-[10px] font-bold text-rose-800 bg-rose-200 px-2 py-0.5 rounded-full border border-rose-300 shrink-0">
                Active Filter
              </span>
            )}
          </div>
        </button>
      </div>

      {/* BULK ACTION TOOLBAR */}
      {selectedSales.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-300 bg-violet-50 p-3 shadow-xs min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-violet-900">
              {selectedSales.length} {selectedSales.length === 1 ? "order" : "orders"} selected
            </span>
            <button
              type="button"
              onClick={() => setSelectedSales([])}
              className="text-xs font-semibold text-violet-700 hover:text-violet-950 underline ml-1 cursor-pointer"
            >
              Clear selection
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5 bg-white border-violet-300 hover:bg-violet-100 text-violet-900 font-medium flex-1 sm:flex-initial"
              onClick={handleBulkPrintInvoices}
              disabled={isLoading || isGeneratingReport}
            >
              <Printer className="h-3.5 w-3.5 text-violet-600" />
              Print Invoices ({selectedSales.length})
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5 bg-white border-violet-300 hover:bg-violet-100 text-violet-900 font-medium flex-1 sm:flex-initial"
              onClick={handleBulkPrintLabels}
              disabled={isLoading || isGeneratingReport}
            >
              <Printer className="h-3.5 w-3.5 text-violet-600" />
              Print Labels ({selectedSales.length})
            </Button>

            {selectedSalesList.some(isJobCardSale) && (
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700 text-white font-medium flex-1 sm:flex-initial"
                onClick={handleBulkPrintJobCards}
                disabled={isLoading || isGeneratingReport}
              >
                <Printer className="h-3.5 w-3.5" />
                Print Job Cards ({selectedSalesList.filter(isJobCardSale).length})
              </Button>
            )}
          </div>
        </div>
      )}

      {/* MAIN CONTENT CONTAINER */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-card">
        {/* HEADER CONTROLS BAR */}
        <div className="flex flex-col gap-2.5 border-b border-slate-200 bg-[#F1F4F9] p-3 sm:px-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            {/* SEARCH INPUT */}
            <div className="relative w-full sm:w-72 min-w-0">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={activeSearchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search sales, customer, product..."
                aria-label="Global sale search"
                className="h-8 w-full rounded-lg border border-slate-200 bg-white py-1 pl-8 pr-7 text-xs outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
              {activeSearchTerm ? (
                <button
                  type="button"
                  onClick={() => handleSearchChange("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            {/* DATE NAVIGATOR */}
            <div className="flex items-center justify-between sm:justify-end gap-1 bg-white p-1 rounded-lg border border-slate-200 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={onPreviousMonth}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="min-w-[6.5rem] sm:min-w-[8.5rem] text-center text-xs font-semibold text-slate-800 truncate px-1">
                {periodLabel}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={onNextMonth}
                disabled={!canGoNextMonth}
                aria-label="Next month"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              {!isCurrentMonth ? (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs shrink-0" onClick={onCurrentMonth}>
                  This month
                </Button>
              ) : null}
            </div>
          </div>

          {/* ACTION BUTTONS ROW */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/60">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-600">
                {deviceId ? (
                  `Showing ${displaySales.length > 0 ? (page - 1) * pageSize + 1 : 0}–${Math.min(
                    page * pageSize,
                    totalCount,
                  )} of ${totalCount}`
                ) : (
                  `${displaySales.length} of ${sales.length}`
                )}
              </span>
              {pendingSalesCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                  {pendingSalesCount} Pending
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
              {onRefreshSales && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2.5 text-xs font-medium bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-2xs"
                  onClick={() => {
                    fetchServerSales()
                    onRefreshSales()
                  }}
                  disabled={isLoading || isFetchingServer}
                  title="Refresh sales list"
                >
                  <RotateCcw className={`h-3.5 w-3.5 ${isLoading || isFetchingServer ? "animate-spin" : ""}`} />
                  <span>Refresh</span>
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2.5 text-xs font-medium bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-2xs"
                onClick={handlePrintSummary}
                disabled={isLoading || isGeneratingReport}
                title="View and print Sales Summary Report"
              >
                {isGeneratingReport ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
                ) : (
                  <Printer className="h-3.5 w-3.5 text-slate-600" />
                )}
                <span>Summary</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2.5 text-xs font-medium bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-2xs"
                onClick={handleDownloadPDF}
                disabled={isLoading || isGeneratingReport}
                title="Download Sales Summary PDF Report"
              >
                {isGeneratingReport ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
                ) : (
                  <Download className="h-3.5 w-3.5 text-slate-600" />
                )}
                <span>PDF</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2.5 text-xs font-medium bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-2xs"
                onClick={handleDownloadExcel}
                disabled={isLoading || isGeneratingReport}
                title="Download Sales Summary Excel / CSV Report"
              >
                <Download className="h-3.5 w-3.5 text-emerald-600" />
                <span>Excel</span>
              </Button>

              <Button
                size="sm"
                className="h-7 gap-1.5 px-3 text-xs font-semibold bg-violet-600 hover:bg-violet-700 text-white shadow-2xs"
                onClick={() => setIsCreateJobCardOpen(true)}
                title="Create a new Job Card"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Job Card</span>
              </Button>

              {activeFilterCount > 0 || cardFilter !== "all" || typeFilter !== "all" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllFilters}
                  className="h-7 px-2 text-xs text-rose-600 hover:text-rose-800"
                >
                  Clear Filters
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {/* DATA CONTAINER: DESKTOP TABLE & MOBILE CARDS */}
        <div className="relative min-w-0">
          {isFetchingServer && (
            <div className="absolute inset-0 bg-white/60 z-30 flex items-center justify-center backdrop-blur-[1px]">
              <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-md text-xs font-semibold text-slate-700">
                <Loader2 className="h-4 w-4 animate-spin text-violet-600" /> Loading sales...
              </div>
            </div>
          )}

          {/* DESKTOP TABLE VIEW (>= 1024px) */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-[#F1F4F9] text-[11px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="whitespace-nowrap px-2 py-1.5 text-center w-10">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-600 cursor-pointer"
                      checked={displaySales.length > 0 && selectedSales.length === displaySales.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedSales(displaySales.map((s) => s.id))
                        } else {
                          setSelectedSales([])
                        }
                      }}
                      title="Select all visible orders"
                    />
                  </th>
                  <th className="whitespace-nowrap px-1 py-1.5 text-center w-8"></th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-xs font-bold text-slate-600 text-center">#</th>
                  {headerCell("saleId", "Order #")}
                  {headerCell("status", "Status")}
                  {headerCell("delivery", "Delivery Status")}
                  {headerCell("date", "Date & Time")}
                  {headerCell("customer", "Customer")}
                  {headerCell("staff", "Staff Member")}
                  {headerCell("payment", "Payment")}
                  {headerCell("total", "Total / Profit", "right")}
                  {headerCell("received", "Received", "right")}
                  {headerCell("balance", "Balance", "right")}
                  <th className={stickyActionHeaderClass}>Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && !hasLoadedSales ? (
                  <tr>
                    <td colSpan={14}>
                      <TableSkeleton />
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={14} className="px-4 py-8 text-center text-sm text-rose-600">
                      {error}
                    </td>
                  </tr>
                ) : displaySales.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      {sales.length === 0 ? `No sales found for ${periodLabel}` : "No sales match the current filters"}
                    </td>
                  </tr>
                ) : (
                  displaySales.flatMap((rawSale, index) => {
                    const sale = expandedCache[rawSale.id] ? { ...rawSale, ...expandedCache[rawSale.id] } : rawSale
                    const remaining = getRemainingAmount(sale)
                    const received =
                      sale.payment_status === "Paid" || sale.payment_status === "Completed"
                        ? Number(sale.total_amount || 0)
                        : Number(sale.received_amount || 0)

                    const statusLabel = getSaleStatusLabel(sale)
                    const isCancelledOrReturned =
                      sale.status === "Cancelled" ||
                      sale.payment_status?.toLowerCase() === "cancelled" ||
                      sale.delivery_status === "Returned" ||
                      sale.delivery_status?.toLowerCase() === "returned"

                    const isPending =
                      !isCancelledOrReturned &&
                      (statusLabel === "Pending" || sale.status === "Pending" || sale.payment_status === "Pending")

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

                    let baseBgClass =
                      index % 2 === 0
                        ? "bg-white hover:bg-violet-50 text-slate-800"
                        : "bg-slate-50 hover:bg-violet-50 text-slate-800"
                    let borderLeftClass = ""

                    if (statusClass === "pending") {
                      baseBgClass = "bg-amber-100 text-amber-950 hover:bg-amber-200 font-medium"
                      borderLeftClass = "border-l-4 border-l-amber-500"
                    } else if (statusClass === "ship") {
                      baseBgClass = "bg-blue-100 text-blue-950 hover:bg-blue-200 font-medium"
                      borderLeftClass = "border-l-4 border-l-blue-500"
                    } else if (statusClass === "deliver") {
                      baseBgClass = "bg-emerald-100 text-emerald-950 hover:bg-emerald-200 font-medium"
                      borderLeftClass = "border-l-4 border-l-emerald-500"
                    } else if (statusClass === "cancel") {
                      baseBgClass = "bg-rose-100 text-rose-950 hover:bg-rose-200 font-medium"
                      borderLeftClass = "border-l-4 border-l-rose-500"
                    }

                    const isSelected = selectedSales.includes(sale.id)
                    const isExpanded = expandedSaleId === sale.id
                    const rowClass = `${baseBgClass} ${borderLeftClass} ${isSelected ? "bg-violet-100" : ""}`
                    const isJobCard = isJobCardSale(sale)
                    const profitAmount = getSaleProfit(sale)

                    const mainRow = (
                      <tr
                        key={sale.id}
                        onClick={() => onViewSale(sale)}
                        className={`group cursor-pointer border-b border-slate-200 transition-colors ${rowClass}`}
                      >
                        <td className="whitespace-nowrap px-2 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-600 cursor-pointer"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedSales((prev) =>
                                prev.includes(sale.id) ? prev.filter((id) => id !== sale.id) : [...prev, sale.id],
                              )
                            }}
                          />
                        </td>
                        <td className="whitespace-nowrap px-1 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className="h-6 w-6 inline-flex items-center justify-center text-slate-400 hover:text-slate-700 rounded hover:bg-slate-200/60"
                            onClick={() => toggleExpandRow(sale.id)}
                            title={isExpanded ? "Collapse details" : "Expand details"}
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-violet-700" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-xs text-muted-foreground">
                          {(page - 1) * pageSize + index + 1}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 font-semibold text-slate-800">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-blue-700">#{sale.id}</span>
                              {isJobCard ? (
                                <span className="inline-flex items-center rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-800 border border-blue-200">
                                  JOB CARD
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 border border-slate-200">
                                  NORMAL
                                </span>
                              )}
                              {(sale.source === "ECOMMERCE" || sale.external_order_id) && (
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
                        <td className="whitespace-nowrap px-3 py-1.5">
                          <SaleStatusBadge status={getSaleStatusLabel(sale)} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
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
                              isJobCard={isJobCard}
                              userRole="admin"
                              onStatusChange={(newStatus) => handleDeliveryStatusChange(sale.id, newStatus)}
                            />
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-slate-700">
                          {format(parseSaleDate(sale.sale_date), "yyyy-MM-dd")}
                        </td>
                        <td className="max-w-[200px] px-3 py-1.5 text-slate-700">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-slate-800 truncate">
                              {sale.customer_name || "Walk-in"}
                            </span>
                            {sale.items_summary ? (
                              <span className="text-[11px] text-slate-500 truncate" title={sale.items_summary}>
                                {sale.items_summary}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                          <StaffOwnerSelect
                            saleId={sale.id}
                            deviceId={sale.device_id || deviceId || 0}
                            currentStaffId={sale.staff_id}
                            currentStaffName={sale.staff_name}
                            onUpdate={onRefreshSales}
                          />
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-slate-600">
                          {getPaymentMethodDisplay(sale)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right font-medium text-slate-800">
                          <div className="flex flex-col items-end">
                            <span className="font-bold text-slate-900">{formatCurrency(Number(sale.total_amount))}</span>
                            {!hideCogs && (
                              <span className="text-[11px] font-semibold text-emerald-700">
                                Profit: {formatCurrency(profitAmount)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right text-emerald-700">
                          {received > 0 ? formatCurrency(received) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right text-amber-700 font-semibold">
                          {remaining > 0 ? formatCurrency(remaining) : "—"}
                        </td>
                        <td className={stickyActionCellClass(baseBgClass, isPending)}>
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation()
                                onEditSale(sale)
                              }}
                              className="h-6 px-2 text-[11px] font-bold bg-green-600 hover:bg-green-700 text-white shadow-2xs gap-1 cursor-pointer"
                              title="Open and edit in POS mode"
                            >
                              <ShoppingCart className="h-3 w-3" />
                              POS
                            </Button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                handleRowEdit(sale)
                              }}
                              className="text-xs font-medium text-brand-blue hover:text-blue-700 hover:underline cursor-pointer"
                            >
                              Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    )

                    if (!isExpanded) return [mainRow]

                    const expandedRow = (
                      <tr key={`expand-${sale.id}`} className="bg-slate-50 border-b border-slate-200">
                        <td colSpan={14} className="p-3" onClick={(e) => e.stopPropagation()}>
                          <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-3">
                            <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-2 gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-900">Order #{sale.id} Details</span>
                                {isJobCard && (
                                  <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-[10px] font-bold border border-blue-200">
                                    JOB CARD
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-slate-500">
                                Date: {format(parseSaleDate(sale.sale_date), "dd MMM yyyy, hh:mm a")}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                              {/* Products / Items */}
                              <div className="space-y-1">
                                <span className="font-bold text-slate-700 block">Products / Items:</span>
                                <div className="font-mono text-[11px] text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200 whitespace-pre-wrap max-h-36 overflow-y-auto">
                                  {loadingExpandedId === sale.id ? (
                                    <div className="flex items-center gap-2 text-slate-500 py-1 font-sans">
                                      <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-600" /> Loading item details...
                                    </div>
                                  ) : (
                                    sale.products_text ||
                                    (sale.items &&
                                      sale.items.length > 0 &&
                                      sale.items
                                        .map((i: any) => `${i.product_name || i.name || i.notes || "Item"} × ${i.quantity || 1}`)
                                        .join("\n")) ||
                                    sale.items_summary ||
                                    "No item details available"
                                  )}
                                </div>
                              </div>

                              {/* Customer & Address & Staff */}
                              <div className="space-y-1.5">
                                <span className="font-bold text-slate-700 block">Customer Information:</span>
                                <p className="font-semibold text-slate-900">{sale.customer_name || "Walk-in Customer"}</p>
                                <PhoneCell
                                  saleId={sale.id}
                                  phone={sale.customer_phone || sale.customer_phone_override}
                                  deviceId={deviceId}
                                  onUpdate={onRefreshSales}
                                />
                                <div className="pt-1">
                                  <span className="text-[11px] font-semibold text-slate-500 block mb-0.5">Assigned Staff / Owner:</span>
                                  <StaffOwnerSelect
                                    saleId={sale.id}
                                    deviceId={sale.device_id || deviceId || 0}
                                    currentStaffId={sale.staff_id}
                                    currentStaffName={sale.staff_name}
                                    onUpdate={onRefreshSales}
                                  />
                                </div>
                                {(sale.shipping_street || sale.shipping_address || sale.customer_address) && (
                                  <p className="text-slate-600 text-[11px] mt-1">
                                    <MapPin className="inline h-3 w-3 mr-1 text-slate-400" />
                                    {[
                                      sale.shipping_street || sale.shipping_address || sale.customer_address,
                                      sale.shipping_landmark ? `Near ${sale.shipping_landmark}` : null,
                                      [sale.shipping_city, sale.shipping_district, sale.shipping_state].filter(Boolean).join(", "),
                                      sale.shipping_pincode,
                                    ]
                                      .filter(Boolean)
                                      .join(", ")}
                                  </p>
                                )}
                              </div>

                              {/* Shipping & Quick Actions */}
                              <div className="space-y-2">
                                <span className="font-bold text-slate-700 block">Shipping & Tracking:</span>
                                <p className="text-slate-700 font-medium">
                                  Courier: {sale.courier_service_name || "Standard"}
                                </p>
                                <TrackingCell
                                  saleId={sale.id}
                                  deviceId={deviceId || 0}
                                  trackingId={sale.tracking_id}
                                  deliveryStatus={sale.delivery_status}
                                  courierServiceName={sale.courier_service_name}
                                  trackingUrlTemplate={sale.tracking_url_template}
                                  onUpdate={onRefreshSales}
                                />

                                <div className="pt-2 flex flex-wrap gap-1.5">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs px-2.5"
                                    onClick={() => handleRowEdit(sale)}
                                  >
                                    <Edit className="h-3 w-3 mr-1 text-slate-600" /> Edit
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs px-2.5"
                                    onClick={() => onViewSale(sale)}
                                  >
                                    <Eye className="h-3 w-3 mr-1 text-slate-600" /> View Modal
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs px-2.5"
                                    onClick={() => printSalesReceipt(sale, sale.items || [], "INR", {}, false)}
                                  >
                                    <Printer className="h-3 w-3 mr-1 text-slate-600" /> Invoice
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs px-2.5"
                                    onClick={() => printBatchJobCards([sale], "INR")}
                                  >
                                    <Printer className="h-3 w-3 mr-1 text-slate-600" /> Label
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )

                    return [mainRow, expandedRow]
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* MOBILE & TABLET CARD LIST VIEW (< 1024px) */}
          <div className="block lg:hidden divide-y divide-slate-200 bg-slate-50/50">
            {isLoading && !hasLoadedSales ? (
              <div className="p-4 space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                    <div className="flex justify-between">
                      <Skeleton className="h-5 w-24" />
                      <Skeleton className="h-5 w-16" />
                    </div>
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="p-6 text-center text-sm text-rose-600 bg-white">{error}</div>
            ) : displaySales.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 bg-white">
                {sales.length === 0 ? `No sales found for ${periodLabel}` : "No sales match the current filters"}
              </div>
            ) : (
              displaySales.map((rawSale, index) => {
                const sale = expandedCache[rawSale.id] ? { ...rawSale, ...expandedCache[rawSale.id] } : rawSale
                const remaining = getRemainingAmount(sale)
                const received =
                  sale.payment_status === "Paid" || sale.payment_status === "Completed"
                    ? Number(sale.total_amount || 0)
                    : Number(sale.received_amount || 0)

                const statusLabel = getSaleStatusLabel(sale)
                const isCancelledOrReturned =
                  sale.status === "Cancelled" ||
                  sale.payment_status?.toLowerCase() === "cancelled" ||
                  sale.delivery_status === "Returned" ||
                  sale.delivery_status?.toLowerCase() === "returned"

                const isPending =
                  !isCancelledOrReturned &&
                  (statusLabel === "Pending" || sale.status === "Pending" || sale.payment_status === "Pending")

                const isJobCard = isJobCardSale(sale)
                const isSelected = selectedSales.includes(sale.id)
                const isExpanded = expandedSaleId === sale.id
                const profitAmount = getSaleProfit(sale)

                return (
                  <div
                    key={sale.id}
                    className={cn(
                      "p-3.5 bg-white transition-colors space-y-2.5",
                      isPending ? "bg-amber-50/40" : "",
                      isSelected ? "bg-violet-50/70 border-l-4 border-l-violet-600" : "",
                    )}
                  >
                    {/* TOP ROW: CHECKBOX + ORDER ID + BADGES + TOTAL & STATUS */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          className="h-5 w-5 rounded border-gray-300 text-violet-600 focus:ring-violet-600 cursor-pointer shrink-0"
                          checked={isSelected}
                          onChange={() => {
                            setSelectedSales((prev) =>
                              prev.includes(sale.id) ? prev.filter((id) => id !== sale.id) : [...prev, sale.id],
                            )
                          }}
                        />
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          <span className="font-extrabold text-blue-700 text-sm">#{sale.id}</span>
                          {isJobCard ? (
                            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-800 border border-blue-200">
                              JOB CARD
                            </span>
                          ) : (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 border border-slate-200">
                              NORMAL
                            </span>
                          )}
                          {(sale.source === "ECOMMERCE" || sale.external_order_id) && (
                            <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-800 border border-purple-200">
                              ECOM
                            </span>
                          )}
                          {sale.status === "Returned" ? (
                            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800 border border-rose-300">
                              RETURNED
                            </span>
                          ) : Number(sale.total_returned_qty) > 0 || Number(sale.return_count) > 0 ? (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-300">
                              PARTIAL RETURN
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-sm font-extrabold text-slate-900 leading-tight">
                          {formatCurrency(Number(sale.total_amount))}
                        </div>
                        <div className="mt-0.5">
                          <SaleStatusBadge status={statusLabel} />
                        </div>
                      </div>
                    </div>

                    {/* CUSTOMER & DATE */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="min-w-0">
                        <span className="text-[10px] font-semibold text-slate-400 block uppercase tracking-wider">
                          Customer
                        </span>
                        <span className="font-bold text-slate-800 block truncate">
                          {sale.customer_name || "Walk-in Customer"}
                        </span>
                        {(sale.customer_phone || sale.customer_phone_override) && (
                          <span className="text-[11px] text-slate-500 font-mono block">
                            {sale.customer_phone || sale.customer_phone_override}
                          </span>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-semibold text-slate-400 block uppercase tracking-wider">
                          Date & Time
                        </span>
                        <span className="font-semibold text-slate-700 block">
                          {format(parseSaleDate(sale.sale_date), "dd MMM yyyy")}
                        </span>
                        <span className="text-[11px] text-slate-500 block">
                          {format(parseSaleDate(sale.sale_date), "hh:mm a")}
                        </span>
                      </div>
                    </div>

                    {/* ASSIGNED STAFF / OWNER */}
                    <div className="flex items-center justify-between gap-2 text-xs bg-slate-50 p-2 rounded-lg border border-slate-100" onClick={(e) => e.stopPropagation()}>
                      <span className="text-[11px] font-semibold text-slate-500 shrink-0">Assigned Staff:</span>
                      <StaffOwnerSelect
                        saleId={sale.id}
                        deviceId={sale.device_id || deviceId || 0}
                        currentStaffId={sale.staff_id}
                        currentStaffName={sale.staff_name}
                        onUpdate={onRefreshSales}
                      />
                    </div>

                    {/* ITEMS SUMMARY & PROFIT */}
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 border border-slate-100 text-xs">
                      <div className="min-w-0 flex-1">
                        <span className="text-slate-600 truncate block font-medium">
                          {sale.items_summary || sale.products_text || "1 order item"}
                        </span>
                      </div>
                      {!hideCogs && (
                        <span className="shrink-0 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          Profit: {formatCurrency(profitAmount)}
                        </span>
                      )}
                    </div>

                    {/* DELIVERY STATUS & TRACKING CONTROLS */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-0.5">
                      <div className="flex-1">
                        {getSaleDeliveryLabel(sale) === "Pickup" ? (
                          <div className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md">
                            Delivery: Pickup
                          </div>
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
                            isJobCard={isJobCard}
                            userRole="admin"
                            onStatusChange={(newStatus) => handleDeliveryStatusChange(sale.id, newStatus)}
                          />
                        )}
                      </div>

                      {sale.tracking_id && (
                        <div className="shrink-0">
                          <TrackingCell
                            saleId={sale.id}
                            deviceId={deviceId || 0}
                            trackingId={sale.tracking_id}
                            deliveryStatus={sale.delivery_status}
                            courierServiceName={sale.courier_service_name}
                            trackingUrlTemplate={sale.tracking_url_template}
                            onUpdate={onRefreshSales}
                          />
                        </div>
                      )}
                    </div>

                    {/* ACTION BUTTONS TOOLBAR */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs px-2.5 font-medium gap-1 bg-white border-slate-200"
                          onClick={() => printSalesReceipt(sale, sale.items || [], "INR", {}, false)}
                        >
                          <Printer className="h-3.5 w-3.5 text-slate-600" />
                          Invoice
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs px-2.5 font-medium gap-1 bg-white border-slate-200"
                          onClick={() => printBatchJobCards([sale], "INR")}
                        >
                          <Printer className="h-3.5 w-3.5 text-slate-600" />
                          Label
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs px-2 font-medium text-slate-600 gap-1"
                          onClick={() => toggleExpandRow(sale.id)}
                        >
                          {isExpanded ? (
                            <>
                              Less <ChevronUp className="h-3.5 w-3.5" />
                            </>
                          ) : (
                            <>
                              Details <ChevronDown className="h-3.5 w-3.5" />
                            </>
                          )}
                        </Button>
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8 w-8 p-0 shrink-0 border-slate-200">
                            <MoreHorizontal className="h-4 w-4 text-slate-600" />
                            <span className="sr-only">More actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => onViewSale(sale)}>
                            <Eye className="h-4 w-4 mr-2 text-slate-500" /> View Modal
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onEditSale(sale)}>
                            <ShoppingCart className="h-4 w-4 mr-2 text-green-600" /> Open in POS
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleRowEdit(sale)}>
                            <Edit className="h-4 w-4 mr-2 text-slate-500" /> Edit Sale
                          </DropdownMenuItem>
                          {isJobCard && (
                            <DropdownMenuItem onClick={() => setEditingJobCardId(sale.id)}>
                              <Layers className="h-4 w-4 mr-2 text-blue-600" /> Edit Job Card
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => printSalesReceipt(sale, sale.items || [], "INR", {}, false)}>
                            <Printer className="h-4 w-4 mr-2 text-slate-500" /> Print Invoice
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => printBatchJobCards([sale], "INR")}>
                            <Printer className="h-4 w-4 mr-2 text-slate-500" /> Print Delivery Label
                          </DropdownMenuItem>
                          {isJobCard && (
                            <DropdownMenuItem onClick={() => printBatchJobCards([sale], "INR")}>
                              <Printer className="h-4 w-4 mr-2 text-blue-600" /> Print Job Card
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* MOBILE EXPANDED DETAILS */}
                    {isExpanded && (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3 text-xs mt-2">
                        <div className="font-bold text-slate-900 border-b border-slate-200 pb-1.5 flex justify-between items-center">
                          <span>Order #{sale.id} Details</span>
                          <span className="text-[11px] font-normal text-slate-500">
                            {format(parseSaleDate(sale.sale_date), "dd/MM/yyyy, hh:mm a")}
                          </span>
                        </div>

                        {/* PRODUCTS LIST */}
                        <div>
                          <span className="font-bold text-slate-700 block mb-1">Products / Items:</span>
                          <div className="font-mono text-[11px] bg-white p-2.5 rounded border border-slate-200 max-h-36 overflow-y-auto whitespace-pre-wrap">
                            {loadingExpandedId === sale.id ? (
                              <div className="flex items-center gap-2 text-slate-500 py-1 font-sans">
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-600" /> Loading item details...
                              </div>
                            ) : (
                              sale.products_text ||
                              (sale.items &&
                                sale.items.length > 0 &&
                                sale.items
                                  .map(
                                    (i: any) =>
                                      `${i.product_name || i.name || i.notes || "Item"} × ${i.quantity || 1}`,
                                  )
                                  .join("\n")) ||
                              sale.items_summary ||
                              "No item details available"
                            )}
                          </div>
                        </div>

                        {/* FINANCIAL SUMMARY */}
                        <div className="grid grid-cols-2 gap-2 bg-white p-2.5 rounded border border-slate-200">
                          <div>
                            <span className="text-[11px] text-slate-500 block">Total Amount</span>
                            <span className="font-bold text-slate-900">{formatCurrency(Number(sale.total_amount))}</span>
                          </div>
                          <div>
                            <span className="text-[11px] text-slate-500 block">Received Amount</span>
                            <span className="font-bold text-emerald-700">
                              {received > 0 ? formatCurrency(received) : "—"}
                            </span>
                          </div>
                          <div>
                            <span className="text-[11px] text-slate-500 block">Balance Remaining</span>
                            <span className="font-bold text-amber-700">
                              {remaining > 0 ? formatCurrency(remaining) : "0"}
                            </span>
                          </div>
                          <div>
                            <span className="text-[11px] text-slate-500 block">Calculated Profit</span>
                            <span className="font-bold text-emerald-700">{formatCurrency(profitAmount)}</span>
                          </div>
                        </div>

                        {/* CUSTOMER & SHIPPING ADDRESS */}
                        <div className="bg-white p-2.5 rounded border border-slate-200 space-y-1">
                          <span className="font-bold text-slate-700 block">Customer & Shipping Details:</span>
                          <p className="font-semibold text-slate-800">{sale.customer_name || "Walk-in Customer"}</p>
                          <PhoneCell
                            saleId={sale.id}
                            phone={sale.customer_phone || sale.customer_phone_override}
                            deviceId={deviceId}
                            onUpdate={onRefreshSales}
                          />
                          {(sale.shipping_street || sale.shipping_address || sale.customer_address) && (
                            <p className="text-slate-600 text-[11px] pt-1">
                              <MapPin className="inline h-3 w-3 mr-1 text-slate-400" />
                              {[sale.shipping_street || sale.shipping_address || sale.customer_address, sale.shipping_landmark ? `Near ${sale.shipping_landmark}` : null, [sale.shipping_city, sale.shipping_district, sale.shipping_state].filter(Boolean).join(", "), sale.shipping_pincode].filter(Boolean).join(", ")}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* SERVER-SIDE PAGINATION FOOTER */}
        {deviceId ? (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 bg-[#F1F4F9] px-4 py-3 text-xs font-medium text-slate-600">
            <div>
              Showing {serverSales.length > 0 ? (page - 1) * pageSize + 1 : 0} to{" "}
              {Math.min(page * pageSize, totalServerCount)} of {totalServerCount} sales
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs bg-white border-slate-200"
                disabled={page <= 1 || isFetchingServer}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                Previous
              </Button>
              <span className="px-2 text-slate-700 font-semibold">
                Page {page} of {totalServerPages || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs bg-white border-slate-200"
                disabled={page >= totalServerPages || isFetchingServer}
                onClick={() => setPage((p) => Math.min(totalServerPages, p + 1))}
              >
                Next
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {isCreateJobCardOpen && (
        <JobCardModal
          isOpen={true}
          onClose={() => {
            setIsCreateJobCardOpen(false)
            fetchServerSales()
            onRefreshSales?.()
          }}
        />
      )}

      {editingJobCardId && (
        <JobCardModal
          isOpen={true}
          onClose={() => {
            setEditingJobCardId(null)
            fetchServerSales()
            onRefreshSales?.()
          }}
          editSaleId={editingJobCardId}
        />
      )}

      <SalesBreakdownModal
        isOpen={isBreakdownModalOpen}
        onClose={() => setIsBreakdownModalOpen(false)}
        deviceId={deviceId || 0}
        dateRange={globalDateRange || {}}
        periodLabel={periodLabel}
        currency={undefined}
        filters={{ typeFilter }}
        onFilterClick={(type, val) => {
          if (type === "type") {
            setTypeFilter(val as any)
            setIsBreakdownModalOpen(false)
          }
        }}
      />
    </div>
  )
}
