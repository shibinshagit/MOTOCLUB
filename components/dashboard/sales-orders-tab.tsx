"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { getAllJobCards } from "@/app/actions/job-card-actions"
import { deleteSale, getSaleDetails } from "@/app/actions/sale-actions"
import { getJobCardsSummary } from "@/app/actions/job-card-summary"
import { DeliveryStatusSelect } from "@/components/sales/delivery-status-select"
import { isPendingSale, isCriticalSale } from "@/lib/sale-shipping"
import { TrackingCell } from "@/components/sales/tracking-cell"
import { PhoneCell } from "@/components/sales/phone-cell"
import { StaffOwnerSelect } from "@/components/sales/staff-owner-select"
import { useDispatch, useSelector } from "react-redux"
import { selectDeviceCurrency, selectDeviceId } from "@/store/slices/deviceSlice"
import { selectDateRange } from "@/store/slices/dateRangeSlice"
import { markInventoryStale } from "@/lib/inventory-sync"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronDown, ChevronUp, MapPin, Phone, User, Calendar, Layers, Printer, Edit, Trash2, Search, PlayCircle, Eye, Plus, Loader2, FileText, ExternalLink, ShoppingCart, Clock, AlertTriangle, Info, ChevronLeft, ChevronRight } from "lucide-react"
import { SalesBreakdownModal } from "@/components/shared/sales-breakdown-modal"
import { formatPhoneNumber, parseSaleDateTime, parseSaleDate, cn } from "@/lib/utils"
import { useToast } from "@/components/ui/use-toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { printJobCard, printBatchJobCards, printSalesReceipt } from "@/lib/receipt-utils"
import { generateCourierTrackingUrl, getPublicTrackingUrl } from "@/lib/shipping/tracking-url"
import { JobCardModal } from "@/components/shared/job-card/job-card-modal"
import ViewSaleModal from "@/components/sales/view-sale-modal"
import { format } from "date-fns"

export default function SalesOrdersTab() {
  const router = useRouter()
  const dispatch = useDispatch()
  const currency = useSelector(selectDeviceCurrency)
  const deviceId = useSelector(selectDeviceId)
  const dateRange = useSelector(selectDateRange)
  const { toast } = useToast()

  const [sales, setSales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedSaleId, setExpandedSaleId] = useState<number | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  
  // Pagination State
  const [page, setPage] = useState(1)
  const limit = 25
  const [hasMore, setHasMore] = useState(false)

  // Summary State
  const [summary, setSummary] = useState({
    totalCount: 0,
    totalSalesAmount: 0,
    pendingCount: 0,
    pendingSalesAmount: 0,
    criticalCount: 0,
    criticalSalesAmount: 0
  })
  
  // Modal States
  const [editingSaleId, setEditingSaleId] = useState<number | null>(null)
  const [viewingSaleId, setViewingSaleId] = useState<number | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isBreakdownModalOpen, setIsBreakdownModalOpen] = useState(false)
  
  const [selectedSales, setSelectedSales] = useState<number[]>([])
  const [staffList, setStaffList] = useState<any[]>([])
  const [cardFilter, setCardFilter] = useState<"all" | "pending" | "critical">("all")
  const [expandedDetailsLoading, setExpandedDetailsLoading] = useState<boolean>(false)

  const toggleSelectSale = (id: number) => {
    setSelectedSales(prev => prev.includes(id) ? prev.filter(sId => sId !== id) : [...prev, id])
  }

  const toggleSelectAll = () => {
    if (selectedSales.length === sales.length && sales.length > 0) {
      setSelectedSales([])
    } else {
      setSelectedSales(sales.map(s => s.id))
    }
  }

  const handleBatchPrint = () => {
    if (selectedSales.length === 0) return
    const salesToPrint = sales.filter(s => selectedSales.includes(s.id))
    printBatchJobCards(salesToPrint, currency)
  }

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm)
      setPage(1)
    }, 300)
    return () => clearTimeout(handler)
  }, [searchTerm])

  useEffect(() => {
    setPage(1)
  }, [dateRange.from, dateRange.to, cardFilter])

  useEffect(() => {
    fetchSales()
    fetchSummary()
    if (deviceId) {
      import("@/app/actions/staff-actions").then(({ getDeviceStaff }) => {
        getDeviceStaff(deviceId).then(res => {
          if (res.success && res.data) setStaffList(res.data)
        })
      })
    }
  }, [deviceId, dateRange.from, dateRange.to, debouncedSearch, page, cardFilter])

  const fetchSummary = async () => {
    const res = await getJobCardsSummary(deviceId || 0, {
      dateFrom: dateRange.from,
      dateTo: dateRange.to,
      searchTerm: debouncedSearch,
    })
    if (res.success && res.data) {
      setSummary(res.data)
    }
  }

  const fetchSales = async () => {
    if (page === 1) setLoading(true)
    const res = await getAllJobCards(deviceId || 0, {
      dateFrom: dateRange.from,
      dateTo: dateRange.to,
      page,
      limit,
      searchTerm: debouncedSearch,
      statusFilter: cardFilter
    })
    if (res.success && res.data) {
      setSales(res.data)
      setHasMore(res.data.length === limit)
    }
    setLoading(false)
  }

  const toggleExpand = async (id: number) => {
    if (expandedSaleId === id) {
      setExpandedSaleId(null)
      return
    }
    setExpandedSaleId(id)

    // Lazy load items if not already present
    const sale = sales.find((s) => s.id === id)
    if (sale && !sale.items) {
      setExpandedDetailsLoading(true)
      const res = await getSaleDetails(id)
      if (res.success && res.data) {
        setSales((prev) =>
          prev.map((s) => (s.id === id ? { ...s, items: res.data.items } : s))
        )
      }
      setExpandedDetailsLoading(false)
    }
  }

  const handlePrint = (sale: any) => {
    printJobCard(sale, currency)
  }

  const handlePrintInvoice = (sale: any) => {
    if (sale.items && sale.items.length > 0) {
      printSalesReceipt(sale, sale.items, currency, {}, false)
    } else {
      getSaleDetails(sale.id).then((res) => {
        if (res.success && res.data) {
          printSalesReceipt(res.data.sale, res.data.items, currency, {}, false)
        } else {
          toast({ title: "Error", description: "Failed to load invoice items", variant: "destructive" })
        }
      })
    }
  }

  const handleEdit = (sale: any) => {
    if (sale.status !== "Pending") {
      toast({ title: "Not Allowed", description: "Only pending orders can be edited.", variant: "destructive" })
      return
    }
    setEditingSaleId(sale.id)
  }
  
  const handleView = (sale: any) => {
    setViewingSaleId(sale.id)
  }

  const handleOpenInPOS = (saleId: number) => {
    // Navigates to the POS tab and loads the sale as a draft for checkout
    router.push(`/dashboard?tab=sale&editSaleId=${saleId}`)
  }

  const handleDelete = async (saleId: number): Promise<boolean> => {
    try {
      setSales(prev => prev.filter(s => s.id !== saleId))
      const res = await deleteSale(saleId, deviceId || 0)
      if (res.success) {
        markInventoryStale(dispatch)
        toast({ title: "Success", description: "Order deleted successfully." })
        fetchSales() // Refresh
        return true
      } else {
        toast({ title: "Error", description: res.message || "Failed to delete order.", variant: "destructive" })
        fetchSales()
        return false
      }
    } catch (error) {
      console.error("Failed to delete order:", error)
      toast({ title: "Error", description: "An error occurred while deleting the order.", variant: "destructive" })
      return false
    }
  }

  const {
    totalCount,
    totalSalesAmount,
    pendingCount,
    pendingSalesAmount,
    criticalCount,
    criticalSalesAmount
  } = summary

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 2,
    }).format(amount)
  }

  useEffect(() => {
    return () => {
      document.body.style.pointerEvents = ""
    }
  }, [])

  if (loading && sales.length === 0) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full border-4 border-primary border-t-transparent h-8 w-8 mr-2" />
        <p className="text-gray-500">Loading orders...</p>
      </div>
    )
  }

  const getSaleProfit = (sale: any) => {
    const itemsCost = sale.items?.reduce(
      (sum: number, i: any) => sum + Number(i.cost || i.cost_price || 0) * Number(i.quantity || 1),
      0
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

  return (
    <div className="space-y-4 p-4 md:p-6 pb-20">
      {editingSaleId && (
        <JobCardModal
          isOpen={true}
          onClose={() => {
            setEditingSaleId(null)
            fetchSales()
          }}
          editSaleId={editingSaleId}
        />
      )}

      {isCreateModalOpen && (
        <JobCardModal
          isOpen={true}
          onClose={() => {
            setIsCreateModalOpen(false)
            fetchSales()
          }}
        />
      )}
      
      {viewingSaleId && (
        <ViewSaleModal
          isOpen={true}
          onClose={() => setViewingSaleId(null)}
          saleId={viewingSaleId}
          currency={currency}
          onEdit={(saleData) => {
            setViewingSaleId(null)
            if (saleData?.id) {
              const targetSale = sales.find(s => s.id === saleData.id) || saleData
              handleEdit(targetSale)
            }
          }}
          onDelete={async (saleId) => {
            setViewingSaleId(null)
            await handleDelete(saleId)
          }}
          onPrintInvoice={(saleId) => {
            const targetSale = sales.find(s => s.id === saleId)
            if (targetSale) {
              handlePrint(targetSale)
            }
          }}
        />
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Order List & Job Cards</h2>
          <p className="text-xs text-slate-500 mt-0.5">Manage and process all pending orders, assign staff ownership, and update delivery status</p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Search by order #, customer, phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-xs bg-slate-50"
            />
          </div>

          <Button variant="outline" size="sm" onClick={fetchSales} className="h-9 text-xs gap-1.5">
            <Loader2 className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          {selectedSales.length > 0 && (
            <Button variant="default" size="sm" onClick={handleBatchPrint} className="h-9 bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
              <Printer className="h-4 w-4" />
              Print ({selectedSales.length})
            </Button>
          )}

          <Button size="sm" onClick={() => setIsCreateModalOpen(true)} className="h-9 text-xs gap-2">
            <Plus className="h-4 w-4" /> Create Job Card
          </Button>
        </div>
      </div>

      {/* OPERATIONAL ORDER CARDS */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* CARD 1 — TOTAL SALES */}
        <button
          type="button"
          onClick={() => setCardFilter("all")}
          className={cn(
            "flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all cursor-pointer shadow-xs hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-400",
            cardFilter === "all"
              ? "border-violet-500 bg-violet-50/90 ring-2 ring-violet-400/30"
              : "border-slate-200 bg-white hover:border-violet-300 hover:bg-slate-50/50"
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
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
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <div>
              <div className="text-xl font-extrabold text-slate-900 leading-tight">
                {totalCount} <span className="text-xs font-normal text-slate-500">{totalCount === 1 ? "Order" : "Orders"}</span>
              </div>
              <div className="text-xs font-semibold text-violet-700 mt-0.5">
                {formatCurrency(totalSalesAmount)}
              </div>
            </div>
            {cardFilter === "all" && (
              <span className="text-[10px] font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full border border-violet-200">
                All Orders
              </span>
            )}
          </div>
        </button>

        {/* CARD 2 — PENDING ORDERS */}
        <button
          type="button"
          onClick={() => setCardFilter((prev) => (prev === "pending" ? "all" : "pending"))}
          className={cn(
            "flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all cursor-pointer shadow-xs hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400",
            cardFilter === "pending"
              ? "border-amber-500 bg-amber-50/90 ring-2 ring-amber-400/30"
              : "border-slate-200 bg-white hover:border-amber-300 hover:bg-slate-50/50"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Pending Orders</span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <div>
              <div className="text-xl font-extrabold text-slate-900 leading-tight">
                {pendingCount} <span className="text-xs font-normal text-slate-500">{pendingCount === 1 ? "Order" : "Orders"}</span>
              </div>
              <div className="text-xs font-semibold text-amber-700 mt-0.5">
                {formatCurrency(pendingSalesAmount)}
              </div>
            </div>
            {cardFilter === "pending" && (
              <span className="text-[10px] font-bold text-amber-800 bg-amber-200 px-2 py-0.5 rounded-full border border-amber-300">
                Active Filter
              </span>
            )}
          </div>
        </button>

        {/* CARD 3 — CRITICAL ORDERS */}
        <button
          type="button"
          onClick={() => setCardFilter((prev) => (prev === "critical" ? "all" : "critical"))}
          className={cn(
            "flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all cursor-pointer shadow-xs hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-400",
            cardFilter === "critical"
              ? "border-rose-500 bg-rose-50/90 ring-2 ring-rose-400/30"
              : "border-slate-200 bg-white hover:border-rose-300 hover:bg-slate-50/50"
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Critical Orders</span>
            <AlertTriangle className="h-4 w-4 text-rose-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <div>
              <div className="text-xl font-extrabold text-slate-900 leading-tight">
                {criticalCount} <span className="text-xs font-normal text-slate-500">{criticalCount === 1 ? "Order" : "Orders"}</span>
              </div>
              <div className="text-xs font-semibold text-rose-700 mt-0.5">
                {formatCurrency(criticalSalesAmount)}
              </div>
            </div>
            {cardFilter === "critical" && (
              <span className="text-[10px] font-bold text-rose-800 bg-rose-200 px-2 py-0.5 rounded-full border border-rose-300">
                Active Filter
              </span>
            )}
          </div>
        </button>
      </div>

      {sales.length === 0 ? (
        <Card className="border-dashed border-gray-300">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <Calendar className="h-12 w-12 text-gray-300 mb-4" />
            <h3 className="font-semibold text-lg text-gray-700">No Pending Orders</h3>
            <p className="text-gray-500 text-sm mt-1">
              {searchTerm ? "Try adjusting your search criteria." : "When staff create Job Cards, they will appear here."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1150px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-[#F1F4F9] text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <th className="w-10 whitespace-nowrap px-3 py-2.5 text-left">
                    <input 
                      type="checkbox" 
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                      checked={sales.length > 0 && selectedSales.length === sales.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="w-8 whitespace-nowrap px-2 py-2.5 text-left"></th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-left">Order #</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-left">Date & Time</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-left">Customer</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-left">Assigned Staff</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-left">Phone</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-left">Tracking ID</th>
                  <th className="whitespace-nowrap px-2 py-2.5 text-center">Items</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right">Total / Profit</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-center">Delivery Status</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sales.map((sale, index) => {
                  const isExpanded = expandedSaleId === sale.id
                  const isSelected = selectedSales.includes(sale.id)
                  const itemQuantity = Number(sale.total_quantity) || sale.items?.reduce((sum: number, i: any) => sum + i.quantity, 0) || 0
                  
                  const saleDate = parseSaleDate(sale.sale_date)
                  const dateFormatted = format(saleDate, "dd MMM yyyy")
  
                  const statusLower = (sale.delivery_status || "Pending").toLowerCase()
                  let rowBg = index % 2 === 0 ? "bg-white text-slate-800" : "bg-slate-50/50 text-slate-800"

                  if (statusLower === "pending" || statusLower === "pending delivery") {
                    rowBg = "bg-amber-100/80 border-l-4 border-l-amber-500 hover:bg-amber-200/80 text-amber-950 font-medium"
                  } else if (
                    statusLower.includes("paid") ||
                    statusLower.includes("pack") ||
                    statusLower.includes("sent") ||
                    statusLower.includes("ship") ||
                    statusLower.includes("transit") ||
                    statusLower.includes("out for delivery") ||
                    statusLower.includes("dispatch")
                  ) {
                    rowBg = "bg-blue-100/80 border-l-4 border-l-blue-500 hover:bg-blue-200/80 text-blue-950 font-medium"
                  } else if (statusLower.includes("deliver") || statusLower.includes("complete")) {
                    rowBg = "bg-emerald-100/80 border-l-4 border-l-emerald-500 hover:bg-emerald-200/80 text-emerald-950 font-medium"
                  } else if (statusLower.includes("cancel") || statusLower.includes("return")) {
                    rowBg = "bg-rose-100/80 border-l-4 border-l-rose-500 hover:bg-rose-200/80 text-rose-950 font-medium"
                  }

                  const saleProfit = getSaleProfit(sale)

                  return (
                    <div key={sale.id} className="contents">
                      <tr 
                        className={`group cursor-pointer border-b border-slate-200 transition-colors ${rowBg} ${isSelected ? 'bg-indigo-50/50' : ''}`}
                        onClick={() => toggleExpand(sale.id)}
                      >
                        <td className="whitespace-nowrap px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox" 
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                            checked={isSelected}
                            onChange={() => toggleSelectSale(sale.id)}
                          />
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-600" onClick={() => toggleExpand(sale.id)}>
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-700">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 font-bold text-blue-700">
                              <span>#{sale.id}</span>
                              {sale.source === "ECOMMERCE" && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 bg-indigo-50 text-indigo-700 border-indigo-200 font-semibold">
                                  ECOMMERCE
                                </Badge>
                              )}
                              {sale.status === "Pending" && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-800 border-amber-300 font-semibold">
                                  Not Updated
                                </Badge>
                              )}
                              {sale.status === "Returned" && (
                                <Badge className="bg-rose-100 text-rose-800 border-rose-300 text-[10px] px-1.5 py-0 flex items-center gap-1">
                                  Returned
                                </Badge>
                              )}
                              {Number(sale.total_returned_qty) > 0 && sale.status !== "Returned" && (
                                <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] px-1.5 py-0 flex items-center gap-1">
                                  Partial Return
                                </Badge>
                              )}
                            </div>
                            {sale.return_status && (
                              <div className="mt-0.5">
                                {sale.return_status === "pending" && (
                                  <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-[10px] px-1.5 py-0">
                                    Return: Pending Review
                                  </Badge>
                                )}
                                {sale.return_status === "approved" && (
                                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px] px-1.5 py-0">
                                    Return: Approved
                                  </Badge>
                                )}
                                {sale.return_status === "rejected" && (
                                  <Badge className="bg-rose-100 text-rose-800 border-rose-300 text-[10px] px-1.5 py-0">
                                    Return: Rejected
                                  </Badge>
                                )}
                                {sale.return_status === "received" && (
                                  <Badge className="bg-blue-100 text-blue-800 border-blue-300 text-[10px] px-1.5 py-0">
                                    Return: Received
                                  </Badge>
                                )}
                                {sale.return_status === "completed" && (
                                  <Badge className="bg-purple-100 text-purple-800 border-purple-300 text-[10px] px-1.5 py-0">
                                    Return: Completed
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <span className="font-medium text-slate-800 text-xs">{dateFormatted}</span>
                        </td>
                        <td className="max-w-[150px] px-3 py-2.5">
                          <div className="font-semibold text-slate-800 truncate" title={sale.customer_name || "N/A"}>
                            {sale.customer_name || "N/A"}
                          </div>
                          {sale.courier_partner_name && (
                            <div className="text-[11px] text-slate-500 font-medium truncate flex items-center gap-1 mt-0.5" title={`Vendor: ${sale.courier_partner_name}`}>
                              <span className="text-slate-400 font-normal">Vendor:</span>
                              <span className="text-blue-700 font-medium">{sale.courier_partner_name}</span>
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <StaffOwnerSelect
                            saleId={sale.id}
                            deviceId={deviceId || 0}
                            currentStaffId={sale.staff_id}
                            currentStaffName={sale.staff_name}
                            staffList={staffList}
                            onUpdate={fetchSales}
                          />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <PhoneCell
                            saleId={sale.id}
                            phone={sale.customer_phone}
                            deviceId={deviceId || 0}
                            onUpdate={fetchSales}
                          />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-slate-600">
                          <TrackingCell 
                            saleId={sale.id}
                            deviceId={deviceId || 0}
                            trackingId={sale.tracking_id}
                            deliveryStatus={sale.delivery_status}
                            courierServiceName={sale.courier_service_name}
                            onUpdate={fetchSales}
                          />
                          {sale.courier_service_name && (
                            <span className="block font-sans text-xs font-bold text-blue-600 mt-0.5">
                              {sale.courier_service_name}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-center font-medium text-slate-700">{itemQuantity}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right">
                          <div className="font-bold text-slate-900">
                            {currency} {Number(sale.total_amount).toFixed(2)}
                          </div>
                          <div className="text-[11px] font-semibold text-emerald-700 mt-0.5" title="Net Profit">
                            Profit: {currency} {saleProfit.toFixed(2)}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <DeliveryStatusSelect 
                            saleId={sale.id}
                            deviceId={deviceId || 0}
                            currentStatus={sale.delivery_status || "Pending"}
                            customerName={sale.customer_name}
                            customerPhone={sale.customer_phone}
                            trackingId={sale.tracking_id}
                            orderNumber={sale.id}
                            paymentStatus={sale.payment_status}
                            isJobCard={sale.sale_type === 'job_card'}
                            userRole="admin"
                            onStatusChange={() => fetchSales()}
                          />
                        </td>
                        <td 
                          className="whitespace-nowrap px-3 py-2.5 text-right" 
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-7 px-2 text-xs font-medium border-blue-200 text-blue-700 bg-blue-50/50 hover:bg-blue-100/70 hover:text-blue-800 gap-1 shadow-2xs" 
                              onClick={() => handlePrintInvoice(sale)} 
                              title="Print Invoice"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              <span>Invoice</span>
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-7 px-2 text-xs font-medium border-slate-200 text-slate-700 bg-slate-50/50 hover:bg-slate-100 hover:text-slate-900 gap-1 shadow-2xs" 
                              onClick={() => handlePrint(sale)} 
                              title="Print Delivery Label"
                            >
                              <Printer className="h-3.5 w-3.5" />
                              <span>Label</span>
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={() => handleView(sale)} title="View Details">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <div className="relative inline-block">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className={`h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 ${sale.status === "Pending" ? "bg-amber-50 ring-1 ring-amber-300" : ""}`} 
                                onClick={() => handleOpenInPOS(sale.id)} 
                                title={sale.status === "Pending" ? "Open in POS (Sale Not Updated Yet)" : "Open in POS"}
                              >
                                <PlayCircle className="h-4 w-4" />
                              </Button>
                              {sale.status === "Pending" && (
                                <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                </span>
                              )}
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-violet-600 hover:text-violet-700 hover:bg-violet-50" onClick={() => handleEdit(sale)} title="Edit">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-600 hover:text-rose-700 hover:bg-rose-50" onClick={() => handleDelete(sale.id)} title="Delete Order">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
  
                      {/* Expanded Row */}
                      {isExpanded && (
                        <tr key={`expanded-${sale.id}`} className="bg-slate-50/90 border-b border-slate-200">
                          <td colSpan={12} className="px-3 py-2">
                            <div className="bg-white p-2.5 sm:p-3 rounded-md border border-slate-200 shadow-2xs space-y-2 text-xs">
                              {/* Product Table */}
                              <div className="rounded border border-slate-200 overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead className="bg-[#F8FAFC] text-slate-600 font-semibold border-b border-slate-200">
                                    <tr>
                                      <th className="px-2.5 py-1 text-left">Product</th>
                                      <th className="px-2.5 py-1 text-left">Variant</th>
                                      <th className="px-2 py-1 text-center">Qty</th>
                                      <th className="px-2.5 py-1 text-right">Cost Price</th>
                                      <th className="px-2.5 py-1 text-right">Selling Price</th>
                                      <th className="px-2.5 py-1 text-right">Line Total</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {sale.items ? sale.items.map((item: any) => (
                                      <tr key={item.id} className="hover:bg-slate-50/60">
                                        <td className="px-2.5 py-1 font-medium text-slate-800">{item.product_name || "Unknown Product"}</td>
                                        <td className="px-2.5 py-1 text-slate-500">{item.variant_name || "Default"}</td>
                                        <td className="px-2 py-1 text-center text-slate-700 font-medium">{item.quantity}</td>
                                        <td className="px-2.5 py-1 text-right text-slate-400">{currency} {Number(item.cost || item.cost_price).toFixed(2)}</td>
                                        <td className="px-2.5 py-1 text-right text-slate-700">{currency} {Number(item.price).toFixed(2)}</td>
                                        <td className="px-2.5 py-1 text-right font-bold text-slate-900">{currency} {(Number(item.price) * item.quantity).toFixed(2)}</td>
                                      </tr>
                                    )) : (
                                      <tr>
                                        <td colSpan={6} className="px-2.5 py-4 text-center">
                                          <Loader2 className="h-4 w-4 animate-spin inline-block mr-2 text-slate-400" />
                                          <span className="text-slate-500">Loading items...</span>
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>

                              {/* Compact Side-by-Side: Delivery Info & Customer on Left, Totals & Actions on Right */}
                              <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 text-xs items-start">
                                {/* Delivery & Customer Info */}
                                <div className="lg:col-span-7 bg-slate-50/80 p-2 rounded border border-slate-100 text-[11px] space-y-1">
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1">
                                    <div>
                                      <span className="text-slate-400 font-medium">Vendor: </span>
                                      <span className="font-semibold text-slate-800">{sale.courier_partner_name || "Standard Delivery"}</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 font-medium">Courier: </span>
                                      <span className="font-semibold text-blue-700">{sale.courier_service_name || "—"}</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 font-medium">Tracking ID: </span>
                                      <span className="font-mono font-bold text-slate-900">{sale.tracking_id || "—"}</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 font-medium">Shipping Date: </span>
                                      <span className="font-semibold text-slate-800">
                                        {sale.shipping_date ? format(new Date(sale.shipping_date), "dd/MM/yyyy") : "—"}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 font-medium">Customer: </span>
                                      <span className="font-semibold text-slate-800">{sale.customer_name || "N/A"}</span>
                                    </div>
                                    <div className="col-span-2 sm:col-span-3">
                                      <span className="text-slate-400 font-medium">Phone: </span>
                                      <span className="font-medium text-slate-800">{sale.customer_phone ? formatPhoneNumber(sale.customer_phone) : "N/A"}</span>
                                    </div>
                                  </div>

                                  {(sale.shipping_street || sale.shipping_address) && (
                                    <div className="pt-1 border-t border-slate-200/50 flex items-start gap-1">
                                      <span className="text-slate-400 font-medium shrink-0">Address: </span>
                                      <span className="text-slate-700 font-normal">
                                        {sale.shipping_street || sale.shipping_address}
                                        {sale.shipping_landmark ? `, Near ${sale.shipping_landmark}` : ""}
                                        {[sale.shipping_area, sale.shipping_city, sale.shipping_district, sale.shipping_state].filter(Boolean).join(", ") ? `, ${[sale.shipping_area, sale.shipping_city, sale.shipping_district, sale.shipping_state].filter(Boolean).join(", ")}` : ""}
                                        {sale.shipping_pincode ? ` - ${sale.shipping_pincode}` : ""}
                                        {sale.shipping_address_type && <span className="ml-1.5 px-1 py-0 bg-slate-200 text-slate-700 text-[9px] rounded font-semibold uppercase">{sale.shipping_address_type}</span>}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* Totals & Action Buttons */}
                                <div className="lg:col-span-5 bg-slate-50/80 p-2 rounded border border-slate-100 space-y-1.5 text-[11px]">
                                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                                    {Number(sale.courier_paid_extra || 0) > 0 && (
                                      <div>
                                        <span className="text-slate-500">Courier Paid (Extra): </span>
                                        <span className="font-semibold text-slate-800">{currency} {Number(sale.courier_paid_extra).toFixed(2)}</span>
                                      </div>
                                    )}
                                    <div>
                                      <span className="text-slate-500">Items Cost: </span>
                                      <span className="font-semibold text-slate-800">{currency} {(() => {
                                        const itemsCost = sale.items?.reduce((sum: number, i: any) => sum + (Number(i.cost || i.cost_price || 0) * Number(i.quantity || 1)), 0) || 0;
                                        const cost = Number(sale.total_cost) > 0 ? Number(sale.total_cost) : itemsCost;
                                        return cost.toFixed(2);
                                      })()}</span>
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-slate-200/60">
                                    <div className="flex items-center gap-1.5">
                                      <div className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-[11px] font-bold">
                                        Total: {currency} {Number(sale.total_amount).toFixed(2)}
                                      </div>
                                      <div className="bg-emerald-50 text-emerald-900 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-bold">
                                        Profit: <span className="text-emerald-700">{currency} {saleProfit.toFixed(2)}</span>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1 ml-auto" onClick={(e) => e.stopPropagation()}>
                                      <Button 
                                        variant="outline" 
                                        size="sm" 
                                        onClick={() => handlePrintInvoice(sale)} 
                                        className="h-6 px-2 text-[10px] bg-white text-blue-700 border-blue-200 hover:bg-blue-50 gap-1 font-medium"
                                      >
                                        <FileText className="h-3 w-3" />
                                        <span>Invoice</span>
                                      </Button>
                                      <Button 
                                        variant="outline" 
                                        size="sm" 
                                        onClick={() => handlePrint(sale)} 
                                        className="h-6 px-2 text-[10px] bg-white text-slate-700 border-slate-200 hover:bg-slate-50 gap-1 font-medium"
                                      >
                                        <Printer className="h-3 w-3" />
                                        <span>Label</span>
                                      </Button>
                                      {sale.tracking_id && (() => {
                                        const tUrl = generateCourierTrackingUrl(sale.courier_service_name, sale.tracking_id) || getPublicTrackingUrl(sale.tracking_id);
                                        return tUrl ? (
                                          <Button 
                                            variant="outline" 
                                            size="sm" 
                                            onClick={() => window.open(tUrl, "_blank")} 
                                            className="h-6 px-2 text-[10px] bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50 gap-1 font-semibold"
                                          >
                                            <ExternalLink className="h-3 w-3" />
                                            <span>Track</span>
                                          </Button>
                                        ) : null;
                                      })()}
                                    </div>
                                  </div>
                                </div>
                              </div>

                            </div>
                          </td>
                        </tr>
                      )}
                    </div>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50 gap-4">
            <div className="text-xs text-slate-500">
              Showing <span className="font-medium text-slate-700">{totalCount > 0 ? (page - 1) * limit + 1 : 0}</span> to <span className="font-medium text-slate-700">{Math.min(page * limit, totalCount)}</span> of <span className="font-medium text-slate-700">{totalCount}</span> results
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                className="h-8 text-xs px-3"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                Previous
              </Button>
              <div className="text-xs font-medium text-slate-600 min-w-[2rem] text-center">
                {page}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasMore || loading}
                className="h-8 text-xs px-3"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <SalesBreakdownModal
        isOpen={isBreakdownModalOpen}
        onClose={() => setIsBreakdownModalOpen(false)}
        deviceId={deviceId || 0}
        dateRange={dateRange || {}}
        currency={currency}
      />
    </div>
  )
}
