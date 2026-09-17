"use client"

import { useState, useEffect, useTransition } from "react"
import { format } from "date-fns"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import Link from "next/link"
import { DELIVERY_STATUSES } from "@/lib/sale-shipping"
import {
  updatePartnerDeliveryStatus,
  updatePartnerSaleDetails,
  updatePartnerReplacementDeliveryStatus,
  getFilteredPartnerOrders,
} from "@/app/actions/partner-actions"
import { notifySuccess, notifyError } from "@/lib/notifications"
import { useToast } from "@/components/ui/use-toast"
import { Loader2, Phone, RefreshCw, FileText, Printer, Package, ArrowRight, FilterX, Info, ExternalLink } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

import { TrackingDetailsModal } from "@/components/sales/tracking-details-modal"
import { PartnerFilterToolbar, PartnerFilterState } from "@/components/partner/partner-filter-toolbar"
import { PartnerPagination } from "@/components/partner/partner-pagination"
import { printJobCard } from "@/lib/receipt-utils"

interface PartnerSalesTableProps {
  initialOrders?: any[]
  initialSales?: any[]
  initialReplacements?: any[]
  initialTotalCount?: number
  initialPage?: number
  initialPageSize?: number
  initialTotalPages?: number
  pendingReplacementsCount?: number
  hideOrderTypeFilter?: boolean
  onlyReplacements?: boolean
}

export function PartnerSalesTable({
  initialOrders,
  initialSales = [],
  initialReplacements = [],
  initialTotalCount = 0,
  initialPage = 1,
  initialPageSize = 20,
  initialTotalPages = 1,
  pendingReplacementsCount = 0,
  hideOrderTypeFilter = false,
  onlyReplacements = false,
}: PartnerSalesTableProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const [orders, setOrders] = useState<any[]>(() => {
    if (initialOrders && initialOrders.length > 0) return initialOrders
    return [...initialSales, ...initialReplacements]
  })
  const [totalCount, setTotalCount] = useState(initialTotalCount || orders.length)
  const [page, setPage] = useState(initialPage)
  const [pageSize, setPageSize] = useState(initialPageSize)
  const [totalPages, setTotalPages] = useState(initialTotalPages)
  const [pendingCount, setPendingCount] = useState(pendingReplacementsCount)

  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({})
  const [directConfirmSaleId, setDirectConfirmSaleId] = useState<number | null>(null)
  const [selectedReplacementModal, setSelectedReplacementModal] = useState<any | null>(null)

  // Initialize filter state from URL search params
  const [filters, setFilters] = useState<PartnerFilterState>({
    search: searchParams.get("search") || "",
    orderType: onlyReplacements ? "Replacement Shipments" : (searchParams.get("orderType") || "All"),
    status: searchParams.get("status") || "All",
    tracking: searchParams.get("tracking") || "All",
    dateRange: searchParams.get("dateRange") || "All",
    fromDate: searchParams.get("fromDate") || "",
    toDate: searchParams.get("toDate") || "",
  })

  const [trackingModal, setTrackingModal] = useState<{
    isOpen: boolean
    targetType: "sale" | "replacement"
    targetId: number
    targetStatus: string
    initialTrackingId: string
    initialCourierServiceName: string
  }>({
    isOpen: false,
    targetType: "sale",
    targetId: 0,
    targetStatus: "Shipping",
    initialTrackingId: "",
    initialCourierServiceName: "",
  })

  // Sync props when initial state updates
  useEffect(() => {
    if (initialOrders) {
      setOrders(initialOrders)
    } else {
      setOrders([...initialSales, ...initialReplacements])
    }
    setTotalCount(initialTotalCount || 0)
    setPage(initialPage)
    setPageSize(initialPageSize)
    setTotalPages(initialTotalPages)
    setPendingCount(pendingReplacementsCount)
    setIsRefreshing(false)
  }, [initialOrders, initialSales, initialReplacements, initialTotalCount, initialPage, initialPageSize, initialTotalPages, pendingReplacementsCount])

  // Sync state when URL params change
  useEffect(() => {
    const urlSearch = searchParams.get("search") || ""
    const urlOrderType = onlyReplacements ? "Replacement Shipments" : (searchParams.get("orderType") || "All")
    const urlStatus = searchParams.get("status") || "All"
    const urlTracking = searchParams.get("tracking") || "All"
    const urlDateRange = searchParams.get("dateRange") || "All"
    const urlFromDate = searchParams.get("fromDate") || ""
    const urlToDate = searchParams.get("toDate") || ""
    const urlPage = Math.max(1, Number(searchParams.get("page")) || 1)

    setFilters({
      search: urlSearch,
      orderType: urlOrderType,
      status: urlStatus,
      tracking: urlTracking,
      dateRange: urlDateRange,
      fromDate: urlFromDate,
      toDate: urlToDate,
    })
    setPage(urlPage)
  }, [searchParams, onlyReplacements])

  // Execute filter search client-side/server-side fetch
  const executeFilterFetch = async (newFilters: PartnerFilterState, newPage: number) => {
    setIsLoading(true)
    try {
      const res = await getFilteredPartnerOrders({
        page: newPage,
        pageSize: pageSize,
        search: newFilters.search,
        status: newFilters.status,
        orderType: newFilters.orderType,
        dateRange: newFilters.dateRange,
        fromDate: newFilters.fromDate,
        toDate: newFilters.toDate,
        tracking: newFilters.tracking,
      })

      if (res.success) {
        setOrders(res.data || [])
        setTotalCount(res.totalCount || 0)
        setPage(res.page || 1)
        setTotalPages(res.totalPages || 1)
        if (res.pendingReplacementsCount !== undefined) {
          setPendingCount(res.pendingReplacementsCount)
        }
      } else {
        notifyError(toast, res.message || "Failed to load filtered orders")
      }
    } catch (err) {
      console.error("Filter fetch error:", err)
      notifyError(toast, "An error occurred while loading orders")
    } finally {
      setIsLoading(false)
    }
  }

  // Update URL params
  const pushQueryParams = (newFilters: PartnerFilterState, newPage: number) => {
    const params = new URLSearchParams()
    if (newFilters.search) params.set("search", newFilters.search)
    if (!hideOrderTypeFilter && newFilters.orderType && newFilters.orderType !== "All") params.set("orderType", newFilters.orderType)
    if (newFilters.status && newFilters.status !== "All") params.set("status", newFilters.status)
    if (newFilters.tracking && newFilters.tracking !== "All") params.set("tracking", newFilters.tracking)
    if (newFilters.dateRange && newFilters.dateRange !== "All") params.set("dateRange", newFilters.dateRange)
    if (newFilters.fromDate) params.set("fromDate", newFilters.fromDate)
    if (newFilters.toDate) params.set("toDate", newFilters.toDate)
    if (newPage > 1) params.set("page", String(newPage))

    const queryStr = params.toString()
    startTransition(() => {
      router.push(`${pathname}${queryStr ? `?${queryStr}` : ""}`, { scroll: false })
    })
  }

  const handleFilterChange = (newFilters: PartnerFilterState) => {
    setFilters(newFilters)
    const resetPage = 1
    setPage(resetPage)
    pushQueryParams(newFilters, resetPage)
    executeFilterFetch(newFilters, resetPage)
  }

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    pushQueryParams(filters, newPage)
    executeFilterFetch(filters, newPage)
  }

  const handleResetFilters = () => {
    const resetState: PartnerFilterState = {
      search: "",
      orderType: onlyReplacements ? "Replacement Shipments" : "All",
      status: "All",
      tracking: "All",
      dateRange: "All",
      fromDate: "",
      toDate: "",
    }
    setFilters(resetState)
    setPage(1)
    pushQueryParams(resetState, 1)
    executeFilterFetch(resetState, 1)
  }

  const handleRefresh = () => {
    setIsRefreshing(true)
    executeFilterFetch(filters, page)
    router.refresh()
    setTimeout(() => setIsRefreshing(false), 500)
  }

  const isOptionDisabled = (currentStatus: string, optionStatus: string) => {
    const statusLower = currentStatus?.toLowerCase() || 'pending';
    const optionLower = optionStatus?.toLowerCase() || '';
    if (currentStatus === optionStatus) return false;
    
    // Allowed transitions for Partner:
    // Sent -> Direct, Shipping
    // Direct -> Delivered, Shipping
    // Shipping/Shipped -> Delivered
    const isCurrentShipping = statusLower === 'shipping' || statusLower === 'shipped';
    const isOptionShipping = optionLower === 'shipping' || optionLower === 'shipped';

    if (statusLower === 'sent' && (optionLower === 'direct' || isOptionShipping)) return false;
    if (statusLower === 'direct' && (optionLower === 'delivered' || isOptionShipping)) return false;
    if (isCurrentShipping && optionLower === 'delivered') return false;
    
    return true; // Disable everything else
  }

  const handleStatusChange = async (saleId: number, newStatus: string) => {
    const newStatusLower = newStatus?.toLowerCase() || '';
    
    if (newStatusLower === 'direct') {
      setDirectConfirmSaleId(saleId)
      return
    }

    if (newStatusLower === 'shipped' || newStatusLower === 'shipping') {
      const currentSale = orders.find(s => s.id === saleId && !s.is_replacement);
      setTrackingModal({
        isOpen: true,
        targetType: "sale",
        targetId: saleId,
        targetStatus: newStatus,
        initialTrackingId: currentSale?.tracking_id || "",
        initialCourierServiceName: currentSale?.courier_service_name || "",
      })
      return
    }

    await executeStatusUpdate(saleId, newStatus)
  }

  const executeStatusUpdate = async (saleId: number, newStatus: string, trackingId?: string, courierServiceName?: string) => {
    setLoadingMap(prev => ({ ...prev, [`sale-${saleId}`]: true }))
    try {
      const result = await updatePartnerDeliveryStatus(saleId, newStatus, trackingId, courierServiceName)
      if (result.success) {
        setOrders(prev => prev.map(s => {
          if (s.id === saleId && !s.is_replacement) {
             return { 
               ...s, 
               delivery_status: newStatus, 
               shipping_date: result.shippingDate || s.shipping_date,
               ...(trackingId !== undefined && { tracking_id: result.trackingId ?? (trackingId || null) }),
               ...(courierServiceName !== undefined && { courier_service_name: result.courierServiceName ?? courierServiceName })
             }
          }
          return s;
        }))
        notifySuccess(toast, "Status updated successfully", "Success")
      } else {
        notifyError(toast, result.message || "Failed to update status")
      }
    } catch {
      notifyError(toast, "An error occurred while updating status")
    } finally {
      setLoadingMap(prev => ({ ...prev, [`sale-${saleId}`]: false }))
    }
  }

  const handleConfirmDirect = async () => {
    if (!directConfirmSaleId) return
    const saleId = directConfirmSaleId
    setDirectConfirmSaleId(null)
    await executeStatusUpdate(saleId, "Direct")
  }

  const handleReplacementStatusChange = async (replacementId: number, newStatus: string) => {
    const newStatusLower = newStatus?.toLowerCase() || ""

    if (newStatusLower === "shipped" || newStatusLower === "shipping") {
      const currentRs = orders.find((r) => r.id === replacementId && r.is_replacement)
      setTrackingModal({
        isOpen: true,
        targetType: "replacement",
        targetId: replacementId,
        targetStatus: newStatus,
        initialTrackingId: currentRs?.tracking_id || "",
        initialCourierServiceName: currentRs?.courier_service_name || "",
      })
      return
    }

    await executeReplacementStatusUpdate(replacementId, newStatus)
  }

  const executeReplacementStatusUpdate = async (replacementId: number, newStatus: string, trackingId?: string, courierServiceName?: string) => {
    setLoadingMap((prev) => ({ ...prev, [`rs-${replacementId}`]: true }))
    try {
      const result = await updatePartnerReplacementDeliveryStatus(replacementId, newStatus, trackingId, courierServiceName)
      if (result.success) {
        setOrders((prev) =>
          prev.map((r) => {
            if (r.id === replacementId && r.is_replacement) {
              return {
                ...r,
                delivery_status: newStatus,
                status: newStatus,
                shipping_date: result.shippingDate || r.shipping_date,
                ...(trackingId !== undefined && { tracking_id: result.trackingId ?? (trackingId || null) }),
                ...(courierServiceName !== undefined && { courier_service_name: result.courierServiceName ?? courierServiceName }),
              }
            }
            return r
          })
        )
        notifySuccess(toast, "Replacement status updated successfully", "Success")
      } else {
        notifyError(toast, result.message || "Failed to update replacement status")
      }
    } catch {
      notifyError(toast, "An error occurred while updating status")
    } finally {
      setLoadingMap((prev) => ({ ...prev, [`rs-${replacementId}`]: false }))
    }
  }

  const handleSaveTrackingFromModal = async (trackingId: string, courierServiceName?: string) => {
    const { targetType, targetId, targetStatus } = trackingModal
    setTrackingModal((prev) => ({ ...prev, isOpen: false }))

    if (targetType === "sale") {
      await executeStatusUpdate(targetId, targetStatus, trackingId, courierServiceName)
    } else {
      await executeReplacementStatusUpdate(targetId, targetStatus, trackingId, courierServiceName)
    }
  }

  const handlePrintInvoice = (sale: any) => {
    import("@/lib/receipt-utils").then(({ printSalesReceipt }) => {
      if (sale.items && sale.items.length > 0) {
        printSalesReceipt(sale, sale.items, "INR", {}, false)
      } else {
        import("@/app/actions/sale-actions").then(({ getSaleDetails }) => {
          getSaleDetails(sale.id).then((res) => {
            if (res.success && res.data) {
              printSalesReceipt(res.data.sale, res.data.items, "INR", {}, false)
            } else {
              toast({ title: "Error", description: "Failed to load invoice items", variant: "destructive" })
            }
          })
        })
      }
    })
  }

  const handlePrintLabel = (sale: any) => {
    printJobCard(sale, "INR")
  }

  const handleDetailsChange = async (saleId: number, field: 'weight_kg' | 'expense_courier', value: string) => {
    const sale = orders.find(s => s.id === saleId && !s.is_replacement)
    if (!sale) return
    
    // Optimistic update
    setOrders(prev => prev.map(s => (s.id === saleId && !s.is_replacement) ? { ...s, [field]: value } : s))
    
    // Get both values for API call
    const weightKg = field === 'weight_kg' ? value : (sale.weight_kg?.toString() || "")
    const expenseCourier = field === 'expense_courier' ? value : (sale.expense_courier?.toString() || "")
    
    try {
      const result = await updatePartnerSaleDetails(saleId, weightKg, expenseCourier)
      if (!result.success) {
        notifyError(toast, result.message || "Failed to update details")
      }
    } catch {
      notifyError(toast, "An error occurred while updating details")
    }
  }

  return (
    <div className="space-y-4">
      {/* Compact Replacement Shipments Banner (only on dashboard main page) */}
      {!onlyReplacements && pendingCount > 0 && (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-xl p-3.5 sm:p-4 shadow-sm border border-indigo-900/40 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 border border-indigo-400/30 rounded-lg text-indigo-300 shrink-0">
              <RefreshCw className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-bold tracking-tight">Active Replacement Shipments</span>
                <span className="text-[10px] font-extrabold bg-indigo-500 text-white px-2 py-0.5 rounded-full">
                  {pendingCount} Pending
                </span>
              </div>
              <p className="text-[11px] text-indigo-200/80 mt-0.5">
                Replacement logistics orders are integrated inline below in your Assigned Orders list.
              </p>
            </div>
          </div>
          <Link
            href="/partner/replacement-shipments"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors shadow-2xs shrink-0"
          >
            <span>View Replacement Log</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      {/* Filter Toolbar & Refresh Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">
            {onlyReplacements ? "Replacement Shipments" : "Assigned Orders"}
          </h3>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading || isPending}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing || isLoading || isPending ? "animate-spin text-indigo-600" : ""}`} />
            Refresh
          </button>
        </div>

        <PartnerFilterToolbar
          filters={filters}
          onFilterChange={handleFilterChange}
          onReset={handleResetFilters}
          isLoading={isLoading || isPending}
          hideOrderTypeFilter={hideOrderTypeFilter || onlyReplacements}
        />
      </div>

      {/* Loading Skeleton Indicator */}
      {(isLoading || isPending) && (
        <div className="flex items-center justify-center p-6 bg-white/80 rounded-xl border border-indigo-100 space-x-2 text-indigo-600 font-semibold text-xs shadow-2xs">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Searching & filtering partner orders...</span>
        </div>
      )}

      {orders.length === 0 ? (
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-8 text-center space-y-3">
          <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
            <FilterX className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h4 className="text-base font-bold text-slate-900">No matching orders found</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              We couldn't find any assigned orders matching your current search term or active filter parameters.
            </p>
          </div>
          <div className="pt-2">
            <Button
              variant="outline"
              onClick={handleResetFilters}
              className="text-xs font-bold border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Reset All Filters
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden pt-2">
          {/* Mobile Card List View (< md) */}
          <div className="block md:hidden divide-y divide-gray-100">
            {orders.map((order) => {
              const isReplacement = Boolean(order.is_replacement || order.record_type === "replacement")
              const itemKey = isReplacement ? `rs-${order.id}` : `sale-${order.id}`

              if (isReplacement) {
                return (
                  <div key={itemKey} className="p-4 space-y-3 bg-purple-50/30 hover:bg-purple-50/60 transition-colors">
                    {/* Header: Replacement Number & Original Order */}
                    <div className="flex items-start justify-between gap-2 border-b border-purple-100 pb-2.5">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-extrabold text-indigo-950 text-base">
                            {order.replacement_number || `RS-${String(order.id).padStart(4, '0')}`}
                          </span>
                          <span className="text-[10px] font-black uppercase tracking-wider bg-purple-600 text-white px-2 py-0.5 rounded shadow-2xs">
                            REPLACEMENT
                          </span>
                        </div>
                        {order.sale_id && (
                          <p className="text-xs font-semibold text-slate-600 mt-0.5">
                            Original Order: <span className="font-bold text-slate-900">#{order.sale_id}</span>
                          </p>
                        )}
                        <span className="text-[11px] font-medium text-slate-400">
                          {order.created_at || order.sale_date ? format(new Date(order.created_at || order.sale_date), "dd/MM/yyyy") : "-"}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block font-semibold uppercase">Payment</span>
                        <span className="text-xs font-bold text-slate-700 bg-purple-100 text-purple-900 px-2 py-0.5 rounded-full inline-block">
                          ₹0 (No Payment)
                        </span>
                      </div>
                    </div>

                    {/* Customer Details & WhatsApp */}
                    <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-purple-100">
                      <div className="min-w-0 pr-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Customer</span>
                        <p className="font-bold text-slate-900 text-sm truncate">{order.customer_name || "Guest"}</p>
                        <p className="text-xs text-slate-500 font-medium">{order.customer_phone || "-"}</p>
                      </div>
                      {order.customer_phone ? (
                        <a
                          href={`https://wa.me/${order.customer_phone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="h-8 w-8 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center transition-colors shadow-sm shrink-0"
                          title="Chat on WhatsApp"
                        >
                          <Phone className="h-3.5 w-3.5 fill-current" />
                        </a>
                      ) : (
                        <button disabled className="h-8 w-8 rounded-full bg-gray-200 text-gray-400 flex items-center justify-center shrink-0 cursor-not-allowed">
                          <Phone className="h-3.5 w-3.5 fill-current" />
                        </button>
                      )}
                    </div>

                    {/* Replacement Items & Details Button */}
                    {order.items && order.items.length > 0 && (
                      <div className="bg-white p-2.5 rounded-lg border border-purple-100 text-xs space-y-1">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">Replacement Items</span>
                          <button
                            onClick={() => setSelectedReplacementModal(order)}
                            className="text-[10px] font-bold text-purple-800 hover:underline flex items-center gap-1"
                          >
                            <span>View Full Details</span>
                            <Info className="h-3 w-3" />
                          </button>
                        </div>
                        {order.items.map((item: any) => (
                          <div key={item.id} className="flex justify-between text-slate-800">
                            <span className="font-medium truncate pr-2">{item.product_name}{item.variant_name ? ` (${item.variant_name})` : ""}</span>
                            <span className="font-mono font-bold text-purple-900 shrink-0">× {item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Status & Tracking */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-600 shrink-0">Status:</span>
                        <div className="relative flex-1 max-w-[190px]">
                          <select
                            value={order.delivery_status || order.status || "Pending"}
                            onChange={(e) => handleReplacementStatusChange(order.id, e.target.value)}
                            disabled={loadingMap[`rs-${order.id}`]}
                            className="w-full h-8 rounded-full border border-purple-200 bg-purple-100 text-purple-900 px-3 py-1 text-xs font-bold focus:ring-2 focus:ring-purple-300 disabled:opacity-50 appearance-none text-center cursor-pointer hover:bg-purple-200 transition-colors"
                          >
                            {DELIVERY_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                          {loadingMap[`rs-${order.id}`] && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-600 absolute right-2 top-2" />
                          )}
                        </div>
                      </div>

                      {(order.tracking_id || order.courier_service_name || order.shipping_date) && (
                        <div className="bg-purple-50/60 rounded-lg p-2.5 border border-purple-100 text-xs space-y-1">
                          {order.shipping_date && (
                            <div className="flex justify-between">
                              <span className="text-slate-500 font-medium">Shipping Date:</span>
                              <span className="font-semibold text-slate-800">
                                {format(new Date(order.shipping_date), "dd/MM/yyyy")}
                              </span>
                            </div>
                          )}
                          {order.tracking_id && (
                            <div className="flex justify-between">
                              <span className="text-slate-500 font-medium">Tracking ID:</span>
                              <span className="font-mono font-bold text-purple-900">{order.tracking_id}</span>
                            </div>
                          )}
                          {order.courier_service_name && (
                            <div className="flex justify-between">
                              <span className="text-slate-500 font-medium">Courier:</span>
                              <span className="font-semibold text-purple-700">{order.courier_service_name}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              }

              // Normal Order Mobile Card
              return (
                <div key={itemKey} className="p-4 space-y-3 hover:bg-slate-50/60 transition-colors">
                  {/* Header: Order ID + Date & Amount */}
                  <div className="flex items-start justify-between gap-2 border-b border-gray-100 pb-2.5">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-indigo-600 text-base">#{order.id}</span>
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          NORMAL
                        </span>
                      </div>
                      <span className="text-[11px] font-medium text-slate-400 block mt-0.5">
                        {order.sale_date ? format(new Date(order.sale_date), "dd/MM/yyyy") : "-"}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block font-semibold uppercase">Total Amount</span>
                      <span className="text-base font-extrabold text-slate-900">
                        ₹{Number(order.total_amount || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Customer Details & WhatsApp */}
                  <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div className="min-w-0 pr-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Customer</span>
                      <p className="font-bold text-slate-900 text-sm truncate">{order.customer_name || "Guest"}</p>
                      <p className="text-xs text-slate-500 font-medium">{order.customer_phone || "-"}</p>
                    </div>
                    {order.customer_phone ? (
                      <a
                        href={`https://wa.me/${order.customer_phone.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-8 w-8 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center transition-colors shadow-sm shrink-0"
                        title="Chat on WhatsApp"
                      >
                        <Phone className="h-3.5 w-3.5 fill-current" />
                      </a>
                    ) : (
                      <button disabled className="h-8 w-8 rounded-full bg-gray-200 text-gray-400 flex items-center justify-center shrink-0 cursor-not-allowed">
                        <Phone className="h-3.5 w-3.5 fill-current" />
                      </button>
                    )}
                  </div>

                  {/* Status & Direct Actions */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-600 shrink-0">Delivery Status:</span>
                      <div className="relative flex-1 max-w-[190px]">
                        <select
                          value={order.delivery_status || "Pending"}
                          onChange={(e) => handleStatusChange(order.id, e.target.value)}
                          disabled={loadingMap[`sale-${order.id}`]}
                          className="w-full h-8 rounded-full border border-blue-200 bg-blue-100 text-blue-700 px-3 py-1 text-xs font-bold focus:border-blue-300 focus:ring-2 focus:ring-blue-200 disabled:opacity-50 appearance-none text-center cursor-pointer hover:bg-blue-200 transition-colors"
                        >
                          {DELIVERY_STATUSES.map((status) => (
                            <option
                              key={status}
                              value={status}
                              disabled={isOptionDisabled(order.delivery_status, status)}
                            >
                              {status}
                            </option>
                          ))}
                        </select>
                        {loadingMap[`sale-${order.id}`] && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600 absolute right-2 top-2" />
                        )}
                      </div>
                    </div>

                    {order.delivery_status?.toLowerCase() === "direct" && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => handlePrintInvoice(order)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors shadow-2xs"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span>Print Invoice</span>
                        </button>
                        <button
                          onClick={() => handlePrintLabel(order)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 text-slate-700 bg-slate-50 hover:bg-slate-100 transition-colors shadow-2xs"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          <span>Print Label</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Tracking & Shipping Info */}
                  {(order.tracking_id || order.courier_service_name || order.shipping_date) && (
                    <div className="bg-blue-50/60 rounded-lg p-2.5 border border-blue-100 text-xs space-y-1">
                      {order.shipping_date && (
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-medium">Shipping Date:</span>
                          <span className="font-semibold text-slate-800">
                            {format(new Date(order.shipping_date), "dd/MM/yyyy")}
                          </span>
                        </div>
                      )}
                      {order.tracking_id && (
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-medium">Tracking ID:</span>
                          <span className="font-mono font-bold text-blue-900">{order.tracking_id}</span>
                        </div>
                      )}
                      {order.courier_service_name && (
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-medium">Courier:</span>
                          <span className="font-semibold text-blue-700">{order.courier_service_name}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Details Inputs (Unit Wt & Courier Cost) */}
                  <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-100">
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Unit / Wt (kg)
                      </label>
                      <input
                        type="text"
                        defaultValue={order.weight_kg || ""}
                        placeholder="kg/unit"
                        onBlur={(e) => handleDetailsChange(order.id, "weight_kg", e.target.value)}
                        className="w-full h-8 text-center text-xs font-semibold border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                        Courier Cost (₹)
                      </label>
                      <input
                        type="text"
                        defaultValue={order.expense_courier || 0}
                        onBlur={(e) => handleDetailsChange(order.id, "expense_courier", e.target.value)}
                        className="w-full h-8 text-center text-xs font-semibold border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop Table View (>= md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs sm:text-sm text-left">
              <thead className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100 bg-slate-50/50">
                <tr>
                  <th className="px-3 py-3.5 lg:px-4 font-bold whitespace-nowrap">Order / Date</th>
                  <th className="px-3 py-3.5 lg:px-4 font-bold">Customer</th>
                  <th className="px-3 py-3.5 lg:px-4 font-bold whitespace-nowrap text-right">Amount</th>
                  <th className="px-3 py-3.5 lg:px-4 font-bold text-center">Status</th>
                  <th className="px-3 py-3.5 lg:px-4 font-bold text-center whitespace-nowrap">Actions</th>
                  <th className="px-3 py-3.5 lg:px-4 font-bold text-center whitespace-nowrap">Shipping Date</th>
                  <th className="px-3 py-3.5 lg:px-4 font-bold">Tracking</th>
                  <th className="px-2 py-3.5 lg:px-3 font-bold text-center">Unit / Wt</th>
                  <th className="px-2 py-3.5 lg:px-3 font-bold text-center">Courier Cost</th>
                  <th className="px-2 py-3.5 lg:px-3 font-bold text-center">WA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {orders.map((order) => {
                  const isReplacement = Boolean(order.is_replacement || order.record_type === "replacement")
                  const itemKey = isReplacement ? `rs-${order.id}` : `sale-${order.id}`

                  return (
                    <tr
                      key={itemKey}
                      className={isReplacement ? "bg-purple-50/25 hover:bg-purple-50/50 transition-colors" : "hover:bg-gray-50/50 transition-colors"}
                    >
                      {/* Order / Date */}
                      <td className="px-3 py-3 lg:px-4 text-gray-600 font-medium whitespace-nowrap">
                        {isReplacement ? (
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-extrabold text-indigo-950 text-xs sm:text-sm">
                                {order.replacement_number || `RS-${String(order.id).padStart(4, '0')}`}
                              </span>
                              <span className="inline-flex items-center text-[10px] font-black uppercase tracking-wider bg-purple-600 text-white px-1.5 py-0.5 rounded shadow-2xs">
                                REPLACEMENT
                              </span>
                            </div>
                            {order.sale_id && (
                              <div className="text-[11px] font-semibold text-slate-600 mt-0.5">
                                Original Order: <span className="text-slate-900 font-bold">#{order.sale_id}</span>
                              </div>
                            )}
                            <div className="text-[11px] text-gray-400 mt-0.5">
                              {order.created_at || order.sale_date ? format(new Date(order.created_at || order.sale_date), "dd/MM/yyyy") : "-"}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-indigo-600">#{order.id}</span>
                              <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                NORMAL
                              </span>
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {order.sale_date ? format(new Date(order.sale_date), "dd/MM/yyyy") : "-"}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Customer */}
                      <td className="px-3 py-3 lg:px-4">
                        <div className="font-bold text-gray-900 truncate max-w-[140px]" title={order.customer_name || "Guest"}>
                          {order.customer_name || "Guest"}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">{order.customer_phone || "-"}</div>
                        {isReplacement && order.reason && (
                          <div
                            className="text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-100 px-1.5 py-0.5 rounded mt-1 truncate max-w-[140px]"
                            title={`Reason: ${order.reason}`}
                          >
                            Reason: {order.reason}
                          </div>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="px-3 py-3 lg:px-4 text-right whitespace-nowrap">
                        {isReplacement ? (
                          <div>
                            <span className="font-bold text-slate-700 text-xs">₹0</span>
                            <span className="block text-[10px] font-semibold text-slate-400 uppercase">No Payment</span>
                          </div>
                        ) : (
                          <div className="font-bold text-gray-900">₹{Number(order.total_amount || 0).toFixed(2)}</div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3 lg:px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <select
                            value={order.delivery_status || order.status || "Pending"}
                            onChange={(e) =>
                              isReplacement
                                ? handleReplacementStatusChange(order.id, e.target.value)
                                : handleStatusChange(order.id, e.target.value)
                            }
                            disabled={loadingMap[itemKey]}
                            className={`h-7 rounded-full border border-transparent ${
                              isReplacement
                                ? "bg-purple-100 text-purple-900 hover:bg-purple-200"
                                : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                            } px-2.5 py-0.5 text-xs font-bold focus:ring-2 disabled:opacity-50 appearance-none text-center cursor-pointer transition-colors`}
                            style={{ paddingRight: '0.75rem', backgroundImage: 'none' }}
                          >
                            {DELIVERY_STATUSES.map((status) => (
                              <option
                                key={status}
                                value={status}
                                disabled={!isReplacement && isOptionDisabled(order.delivery_status, status)}
                              >
                                {status}
                              </option>
                            ))}
                          </select>
                          {loadingMap[itemKey] && (
                            <Loader2 className={`h-3.5 w-3.5 animate-spin ${isReplacement ? "text-purple-600" : "text-blue-600"}`} />
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-3 lg:px-4 text-center whitespace-nowrap">
                        {isReplacement ? (
                          <button
                            onClick={() => setSelectedReplacementModal(order)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-md border border-purple-200 text-purple-800 bg-purple-50 hover:bg-purple-100 transition-colors shadow-2xs cursor-pointer"
                            title="View Replacement Items & Details"
                          >
                            <Package className="h-3.5 w-3.5 text-purple-600" />
                            <span>Items ({order.items?.length || 0})</span>
                          </button>
                        ) : order.delivery_status?.toLowerCase() === "direct" ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handlePrintInvoice(order)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-md border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors shadow-2xs cursor-pointer"
                              title="Print Customer Invoice"
                            >
                              <FileText className="h-3 w-3" />
                              <span>Invoice</span>
                            </button>
                            <button
                              onClick={() => handlePrintLabel(order)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-md border border-slate-200 text-slate-700 bg-slate-50 hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer"
                              title="Print Delivery Label"
                            >
                              <Printer className="h-3 w-3" />
                              <span>Label</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-medium">—</span>
                        )}
                      </td>

                      {/* Shipping Date */}
                      <td className="px-3 py-3 lg:px-4 text-center whitespace-nowrap">
                        {order.shipping_date ? (
                          <span 
                            className="font-semibold text-slate-700 text-xs" 
                            title={format(new Date(order.shipping_date), "dd/MM/yyyy HH:mm:ss")}
                          >
                            {format(new Date(order.shipping_date), "dd/MM/yyyy")}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-medium">—</span>
                        )}
                      </td>

                      {/* Tracking */}
                      <td className="px-3 py-3 lg:px-4">
                        <div className="font-bold text-gray-700 truncate max-w-[120px]" title={order.tracking_id || "No Tracking"}>
                          {order.tracking_id || (isReplacement ? <span className="text-slate-400 font-normal italic">No Tracking</span> : "—")}
                        </div>
                        {order.courier_service_name && (
                          <div className={`text-[11px] font-semibold truncate max-w-[120px] ${isReplacement ? "text-purple-700" : "text-blue-600"}`} title={order.courier_service_name}>
                            {order.courier_service_name}
                          </div>
                        )}
                      </td>

                      {/* Unit / Wt */}
                      <td className="px-2 py-3 lg:px-3 text-center">
                        {!isReplacement ? (
                          <input
                            type="text"
                            defaultValue={order.weight_kg || ""}
                            placeholder="kg/unit"
                            onBlur={(e) => handleDetailsChange(order.id, 'weight_kg', e.target.value)}
                            className="w-14 h-7 text-center text-xs font-medium border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        ) : (
                          <span className="text-slate-400 font-medium">—</span>
                        )}
                      </td>

                      {/* Courier Cost */}
                      <td className="px-2 py-3 lg:px-3 text-center">
                        {!isReplacement ? (
                          <input
                            type="text"
                            defaultValue={order.expense_courier || 0}
                            onBlur={(e) => handleDetailsChange(order.id, 'expense_courier', e.target.value)}
                            className="w-14 h-7 text-center text-xs font-medium border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        ) : (
                          <span className="text-slate-400 font-medium">₹0</span>
                        )}
                      </td>

                      {/* WA */}
                      <td className="px-2 py-3 lg:px-3 text-center">
                        <div className="flex justify-center">
                          {order.customer_phone ? (
                            <a 
                              href={`https://wa.me/${order.customer_phone.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="h-7 w-7 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center transition-colors shadow-sm"
                              title="Chat on WhatsApp"
                            >
                              <Phone className="h-3 w-3 fill-current" />
                            </a>
                          ) : (
                            <button 
                              disabled
                              className="h-7 w-7 rounded-full bg-gray-300 text-white flex items-center justify-center shadow-sm cursor-not-allowed"
                            >
                              <Phone className="h-3 w-3 fill-current" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination Controls */}
      <PartnerPagination
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        totalPages={totalPages}
        onPageChange={handlePageChange}
        isLoading={isLoading || isPending}
      />

      {/* Replacement Details Modal */}
      <Dialog open={!!selectedReplacementModal} onOpenChange={(open) => !open && setSelectedReplacementModal(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-900">
              <Package className="h-5 w-5 text-purple-600" />
              Replacement Shipment Details
            </DialogTitle>
          </DialogHeader>
          {selectedReplacementModal && (
            <div className="space-y-4 text-xs">
              <div className="bg-purple-50 p-3 rounded-lg border border-purple-100 flex justify-between items-center">
                <div>
                  <div className="font-extrabold text-sm text-purple-900">
                    {selectedReplacementModal.replacement_number || `RS-${String(selectedReplacementModal.id).padStart(4, '0')}`}
                  </div>
                  {selectedReplacementModal.sale_id && (
                    <div className="text-slate-600 text-[11px] font-medium mt-0.5">
                      Original Order: <span className="font-bold text-slate-900">#{selectedReplacementModal.sale_id}</span>
                    </div>
                  )}
                </div>
                <span className="px-2.5 py-1 bg-purple-600 text-white font-black text-[10px] rounded uppercase shadow-2xs">
                  REPLACEMENT
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Customer</span>
                  <p className="font-bold text-slate-900 text-sm truncate">{selectedReplacementModal.customer_name || "Guest"}</p>
                  <p className="text-slate-500 font-medium">{selectedReplacementModal.customer_phone || "-"}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Shipment Status</span>
                  <p className="font-bold text-purple-900 text-sm">{selectedReplacementModal.delivery_status || selectedReplacementModal.status || "Pending"}</p>
                  <p className="text-[11px] text-slate-500">₹0 (No Payment)</p>
                </div>
              </div>

              {selectedReplacementModal.reason && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Reason for Replacement</span>
                  <p className="font-medium text-slate-800 bg-amber-50 border border-amber-100 p-2.5 rounded-lg text-xs">
                    {selectedReplacementModal.reason}
                  </p>
                </div>
              )}

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Replacement Items</span>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 divide-y divide-slate-100 space-y-2">
                  {(selectedReplacementModal.items && selectedReplacementModal.items.length > 0) ? (
                    selectedReplacementModal.items.map((item: any) => (
                      <div key={item.id} className="pt-2 first:pt-0 flex justify-between items-center">
                        <div>
                          <p className="font-bold text-slate-900">{item.product_name}</p>
                          {item.variant_name && <p className="text-[11px] text-slate-500">Variant: {item.variant_name}</p>}
                        </div>
                        <span className="font-mono font-bold text-purple-900 bg-purple-100 px-2.5 py-1 rounded-md">
                          × {item.quantity}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-slate-400 italic text-center py-2">No item records attached</p>
                  )}
                </div>
              </div>

              {selectedReplacementModal.shipping_address && (
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Shipping Address</span>
                  <p className="font-medium text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    {selectedReplacementModal.shipping_address}
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedReplacementModal(null)} className="text-xs font-bold">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Direct Delivery Confirmation Dialog */}
      <Dialog open={!!directConfirmSaleId} onOpenChange={(open) => !open && setDirectConfirmSaleId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-600">
              <Package className="h-5 w-5" />
              Direct Delivery
            </DialogTitle>
            <DialogDescription className="text-slate-600 mt-2">
              This order will be marked for direct delivery from the partner/vendor to the customer.
              <br /><br />
              The invoice and delivery label will be available for this order.
              <br /><br />
              Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-4">
            <Button variant="outline" onClick={() => setDirectConfirmSaleId(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmDirect}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Confirm Direct Delivery
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TrackingDetailsModal
        isOpen={trackingModal.isOpen}
        onClose={() => setTrackingModal((prev) => ({ ...prev, isOpen: false }))}
        onSave={handleSaveTrackingFromModal}
        initialTrackingId={trackingModal.initialTrackingId}
        initialCourierServiceName={trackingModal.initialCourierServiceName}
        targetDeliveryStatus={trackingModal.targetStatus}
        saleId={trackingModal.targetId}
      />
    </div>
  )
}
