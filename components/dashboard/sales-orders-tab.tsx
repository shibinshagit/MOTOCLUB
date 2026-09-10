"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getAllJobCards } from "@/app/actions/job-card-actions"
import { deleteSale } from "@/app/actions/sale-actions"
import { DeliveryStatusSelect } from "@/components/sales/delivery-status-select"
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
import { ChevronDown, ChevronUp, MapPin, Phone, User, Calendar, Layers, Printer, Edit, Trash2, Search, PlayCircle, Eye, Plus, Loader2, FileText, ExternalLink } from "lucide-react"
import { formatPhoneNumber, parseSaleDateTime, parseSaleDate } from "@/lib/utils"
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
  
  // Modal States
  const [editingSaleId, setEditingSaleId] = useState<number | null>(null)
  const [viewingSaleId, setViewingSaleId] = useState<number | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  
  const [selectedSales, setSelectedSales] = useState<number[]>([])
  const [staffList, setStaffList] = useState<any[]>([])

  const toggleSelectSale = (id: number) => {
    setSelectedSales(prev => prev.includes(id) ? prev.filter(sId => sId !== id) : [...prev, id])
  }

  const toggleSelectAll = () => {
    if (selectedSales.length === filteredSales.length && filteredSales.length > 0) {
      setSelectedSales([])
    } else {
      setSelectedSales(filteredSales.map(s => s.id))
    }
  }

  const handleBatchPrint = () => {
    if (selectedSales.length === 0) return
    const salesToPrint = sales.filter(s => selectedSales.includes(s.id))
    printBatchJobCards(salesToPrint, currency)
  }

  useEffect(() => {
    fetchSales()
    if (deviceId) {
      import("@/app/actions/staff-actions").then(({ getDeviceStaff }) => {
        getDeviceStaff(deviceId).then(res => {
          if (res.success && res.data) setStaffList(res.data)
        })
      })
    }
  }, [deviceId, dateRange.from, dateRange.to])

  const fetchSales = async () => {
    setLoading(true)
    const res = await getAllJobCards(deviceId || 0, {
      dateFrom: dateRange.from,
      dateTo: dateRange.to,
    })
    if (res.success && res.data) {
      const sorted = [...res.data].sort((a, b) => {
        return parseSaleDateTime(b).getTime() - parseSaleDateTime(a).getTime()
      })
      setSales(sorted)
    }
    setLoading(false)
  }

  const toggleExpand = (id: number) => {
    setExpandedSaleId(expandedSaleId === id ? null : id)
  }

  const handlePrint = (sale: any) => {
    printJobCard(sale, currency)
  }

  const handlePrintInvoice = (sale: any) => {
    if (sale.items && sale.items.length > 0) {
      printSalesReceipt(sale, sale.items, currency, {}, false)
    } else {
      import("@/app/actions/sale-actions").then(({ getSaleDetails }) => {
        getSaleDetails(sale.id).then((res) => {
          if (res.success && res.data) {
            printSalesReceipt(res.data.sale, res.data.items, currency, {}, false)
          } else {
            toast({ title: "Error", description: "Failed to load invoice items", variant: "destructive" })
          }
        })
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

  const filteredSales = sales.filter((sale) => {
    if (!searchTerm) return true
    const term = searchTerm.toLowerCase()
    return (
      sale.tracking_id?.toLowerCase().includes(term) ||
      sale.courier_service_name?.toLowerCase().includes(term) ||
      sale.customer_name?.toLowerCase().includes(term) ||
      sale.customer_phone?.toLowerCase().includes(term) ||
      sale.id?.toString().includes(term)
    )
  })

  useEffect(() => {
    return () => {
      document.body.style.pointerEvents = ""
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full border-4 border-primary border-t-transparent h-8 w-8 mr-2" />
        <p className="text-gray-500">Loading orders...</p>
      </div>
    )
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

      {filteredSales.length === 0 ? (
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
                      checked={filteredSales.length > 0 && selectedSales.length === filteredSales.length}
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
                  <th className="whitespace-nowrap px-3 py-2.5 text-right">Total</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-center">Delivery Status</th>
                  <th className="whitespace-nowrap px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSales.map((sale, index) => {
                  const isExpanded = expandedSaleId === sale.id
                  const isSelected = selectedSales.includes(sale.id)
                  const itemQuantity = sale.items?.reduce((sum: number, i: any) => sum + i.quantity, 0) || 0
                  
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
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold text-slate-900">
                          {currency} {Number(sale.total_amount).toFixed(2)}
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
                        <tr key={`expanded-${sale.id}`} className="bg-slate-50/50 border-b border-slate-200">
                          <td colSpan={12} className="p-6">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                              
                              {/* Summary Card */}
                              <div className="col-span-1 lg:col-span-1 space-y-4 order-2 lg:order-2">
                                {/* Delivery Workflow Card */}
                                <div className="p-3.5 bg-gradient-to-r from-blue-50/70 to-indigo-50/50 rounded-xl border border-blue-100 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Delivery Workflow</span>
                                    <Badge variant="outline" className="text-xs font-semibold bg-blue-100 text-blue-800 border-blue-200">
                                      {sale.delivery_status || "Pending"}
                                    </Badge>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                                    <div>
                                      <span className="text-slate-400 block font-medium">Vendor:</span>
                                      <span className="font-semibold text-slate-800">{sale.courier_partner_name || "Standard Delivery"}</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 block font-medium">Customer:</span>
                                      <span className="font-semibold text-slate-800">{sale.customer_name || "N/A"}</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 block font-medium">Courier Service:</span>
                                      <span className="font-semibold text-blue-700">{sale.courier_service_name || "—"}</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 block font-medium">Tracking ID:</span>
                                      <span className="font-mono font-bold text-slate-900">{sale.tracking_id || "—"}</span>
                                    </div>
                                    <div>
                                      <span className="text-slate-400 block font-medium">Shipping Date:</span>
                                      <span className="font-semibold text-slate-800">
                                        {sale.shipping_date ? format(new Date(sale.shipping_date), "dd/MM/yyyy") : "—"}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Quick workflow actions */}
                                  <div className="flex items-center gap-2 pt-2 border-t border-blue-100/80 flex-wrap">
                                    <Button 
                                      variant="outline" 
                                      size="sm" 
                                      onClick={() => handlePrintInvoice(sale)} 
                                      className="h-7 text-xs bg-white text-blue-700 border-blue-200 hover:bg-blue-50 gap-1.5 font-medium"
                                    >
                                      <FileText className="h-3 w-3" />
                                      Invoice
                                    </Button>
                                    <Button 
                                      variant="outline" 
                                      size="sm" 
                                      onClick={() => handlePrint(sale)} 
                                      className="h-7 text-xs bg-white text-slate-700 border-slate-200 hover:bg-slate-50 gap-1.5 font-medium"
                                    >
                                      <Printer className="h-3 w-3" />
                                      Delivery Label
                                    </Button>
                                    {sale.tracking_id && (() => {
                                      const tUrl = generateCourierTrackingUrl(sale.courier_service_name, sale.tracking_id) || getPublicTrackingUrl(sale.tracking_id);
                                      return tUrl ? (
                                        <Button 
                                          variant="outline" 
                                          size="sm" 
                                          onClick={() => window.open(tUrl, "_blank")} 
                                          className="h-7 text-xs bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50 gap-1.5 font-semibold"
                                        >
                                          <ExternalLink className="h-3 w-3" />
                                          Track Shipment
                                        </Button>
                                      ) : null;
                                    })()}
                                  </div>
                                </div>

                                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b pb-2">
                                  <User className="h-4 w-4 text-slate-500" /> Customer Information
                                </h4>
                                
                                <div className="space-y-3 text-sm text-slate-600">
                                  {(sale.tracking_id || sale.courier_service_name) && (
                                    <div className="mb-4 bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-2">
                                      {sale.courier_service_name && (
                                        <div>
                                          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-0.5">Courier Service</span>
                                          <p className="font-sans text-blue-600 text-sm font-bold">{sale.courier_service_name}</p>
                                        </div>
                                      )}
                                      {sale.tracking_id && (
                                        <div>
                                          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-0.5">Tracking ID</span>
                                          <p className="font-mono text-blue-700 text-sm font-bold">{sale.tracking_id}</p>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  <div>
                                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">Customer Details</span>
                                    <p className="font-medium text-slate-800 text-base">{sale.customer_name || "N/A"}</p>
                                    <p className="flex items-center gap-1.5 mt-1"><Phone className="h-3.5 w-3.5 text-slate-400" /> {sale.customer_phone ? formatPhoneNumber(sale.customer_phone) : "N/A"}</p>
                                  </div>
                                  
                                  {sale.shipping_street && (
                                    <div className="pt-2">
                                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">Shipping Address</span>
                                      <div className="flex items-start gap-1.5 mt-1">
                                        <MapPin className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                                        <div className="space-y-0.5">
                                          <p className="text-slate-700">{sale.shipping_street}</p>
                                          {sale.shipping_landmark && <p className="text-xs text-slate-500">Landmark: {sale.shipping_landmark}</p>}
                                          {(sale.shipping_city || sale.shipping_pincode) && (
                                            <p className="font-medium text-slate-700">
                                              {sale.shipping_city}{sale.shipping_pincode ? `, ${sale.shipping_pincode}` : ""}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                      {sale.shipping_address_type && (
                                        <Badge variant="secondary" className="text-[10px] py-0 px-1.5 mt-2 font-semibold uppercase ml-5">
                                          {sale.shipping_address_type}
                                        </Badge>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
  
                              {/* Line Items */}
                              <div className="col-span-1 lg:col-span-2 space-y-4 order-1 lg:order-1">
                                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b pb-2">
                                  <Layers className="h-4 w-4 text-slate-500" /> Product Line Items
                                </h4>
                                
                                <div className="rounded-lg border border-slate-200 overflow-hidden text-sm shadow-sm">
                                  <table className="w-full">
                                    <thead className="bg-[#F1F4F9] text-slate-600 text-xs uppercase tracking-wider font-semibold border-b border-slate-200">
                                      <tr>
                                        <th className="px-4 py-3 text-left">Product</th>
                                        <th className="px-4 py-3 text-left">Variant</th>
                                        <th className="px-4 py-3 text-center">Qty</th>
                                        <th className="px-4 py-3 text-right">Cost Price</th>
                                        <th className="px-4 py-3 text-right">Selling Price</th>
                                        <th className="px-4 py-3 text-right">Line Total</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {sale.items?.map((item: any) => (
                                        <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                          <td className="px-4 py-3 font-medium text-slate-800">{item.product_name || "Unknown Product"}</td>
                                          <td className="px-4 py-3 text-slate-500 text-xs">{item.variant_name || "Default"}</td>
                                          <td className="px-4 py-3 text-center text-slate-700 font-medium">{item.quantity}</td>
                                          <td className="px-4 py-3 text-right text-slate-400 text-xs">{currency} {Number(item.cost || item.cost_price).toFixed(2)}</td>
                                          <td className="px-4 py-3 text-right text-slate-700">{currency} {Number(item.price).toFixed(2)}</td>
                                          <td className="px-4 py-3 text-right font-bold text-slate-900">{currency} {(Number(item.price) * item.quantity).toFixed(2)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
  
                                <div className="flex justify-end pt-2">
                                  <div className="space-y-2">
                                    {Number(sale.courier_paid_extra || 0) > 0 && (
                                      <div className="flex justify-end text-sm text-slate-600 px-4">
                                        <span className="mr-4">Courier Paid (Extra):</span>
                                        <span>{currency} {Number(sale.courier_paid_extra).toFixed(2)}</span>
                                      </div>
                                    )}
                                    <div className="flex gap-4 items-center bg-emerald-50 px-4 py-2.5 rounded-lg border border-emerald-100 shadow-sm">
                                      <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Order Total</span>
                                      <span className="text-lg font-black text-emerald-900">{currency} {Number(sale.total_amount).toFixed(2)}</span>
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
        </div>
      )}
    </div>
  )
}
