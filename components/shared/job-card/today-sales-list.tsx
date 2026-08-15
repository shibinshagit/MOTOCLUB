"use client"

import { useState, useEffect } from "react"
import { getTodayJobCards } from "@/app/actions/job-card-actions"
import { deleteSale } from "@/app/actions/sale-actions"
import { useSelector } from "react-redux"
import { selectDeviceCurrency, selectDeviceId } from "@/store/slices/deviceSlice"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronDown, ChevronUp, MapPin, Phone, User, Calendar, Layers, MessageCircle, Printer, Edit, Trash2, Search, X } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useConfirm } from "@/hooks/use-confirm"
import { printJobCard, printBatchJobCards } from "@/lib/receipt-utils"
import { JobCardModal } from "./job-card-modal"
import { DeliveryStatusSelect } from "@/components/sales/delivery-status-select"
import { TrackingCell } from "@/components/sales/tracking-cell"
import { format } from "date-fns"
import { formatPhoneNumber, parseSaleDateTime } from "@/lib/utils"
import { getPublicTrackingUrl } from "@/lib/shipping/tracking-url"

export function TodaySalesList({ onOpenCreateModal }: { onOpenCreateModal?: () => void }) {
  const currency = useSelector(selectDeviceCurrency)
  const deviceId = useSelector(selectDeviceId)
  const { toast } = useToast()
  const { confirm, ConfirmDialog } = useConfirm()

  const [sales, setSales] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedSaleId, setExpandedSaleId] = useState<number | null>(null)
  
  // Search and Filter State
  const [monthStr, setMonthStr] = useState<string>(format(new Date(), "yyyy-MM"))
  const [searchTerm, setSearchTerm] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  const [selectedSales, setSelectedSales] = useState<number[]>([])

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

  // Edit Modal State
  const [editingSaleId, setEditingSaleId] = useState<number | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm)
    }, 500)
    return () => clearTimeout(timer)
  }, [searchTerm])

  useEffect(() => {
    fetchSales()
  }, [debouncedSearch, monthStr])

  const fetchSales = async () => {
    setLoading(true)
    const res = await getTodayJobCards(monthStr, debouncedSearch)
    if (res.success && res.data) {
      setSales(res.data)
    }
    setLoading(false)
  }

  const toggleExpand = (id: number) => {
    setExpandedSaleId(expandedSaleId === id ? null : id)
  }

  const handleWhatsApp = (sale: any) => {
    if (!sale.customer_phone) {
      toast({ title: "Error", description: "Customer phone number not available", variant: "destructive" })
      return
    }
    let phone = sale.customer_phone.replace(/\D/g, "")
    // Ensure country code is present (assuming +971 if not provided)
    if (phone.length === 9) phone = "971" + phone // Add UAE code if it's 9 digits
    if (phone.length === 10 && phone.startsWith("0")) phone = "971" + phone.substring(1)
    
    const tokenOrId = sale.tracking_token || sale.tracking_id
    const trackingUrl = getPublicTrackingUrl(tokenOrId)
    const trackingLink = trackingUrl
      ? `\n\nTrack your shipment:\n${trackingUrl}`
      : ""

    const message = `Hello ${sale.customer_name || 'Customer'},\n\nYour Job Card has been created.\nOrder Number: #${sale.id}\nTracking ID: ${sale.tracking_id || 'N/A'}${trackingLink}\n\nThank you for choosing our service!`
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    window.open(url, "_blank")
  }

  const handlePrint = (sale: any) => {
    printJobCard(sale, currency)
  }

  const handleEdit = (sale: any) => {
    setEditingSaleId(sale.id)
  }



  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full border-4 border-primary border-t-transparent h-8 w-8 mr-2" />
        <p className="text-gray-500">Loading monthly sales...</p>
      </div>
    )
  }

  if (sales.length === 0) {
    return (
      <Card className="border-dashed border-gray-300">
        <CardContent className="flex flex-col items-center justify-center p-12 text-center">
          <Calendar className="h-12 w-12 text-gray-300 mb-4" />
          <h3 className="font-semibold text-lg text-gray-700">No Sales Created This Month</h3>
          <p className="text-gray-500 text-sm mt-1">Create your first Job Card to see it appear here.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {ConfirmDialog}
      
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

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-gray-900">Monthly Sales / Job Cards</h2>
          <p className="text-sm text-gray-500">All pending orders created in the selected month</p>
        </div>
        <div className="flex flex-col sm:flex-row flex-wrap sm:flex-nowrap gap-3 w-full sm:w-auto items-stretch sm:items-center">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
            <Input
              type="text"
              placeholder="Search customers or ID..."
              className="pl-9 pr-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1 h-7 w-7 text-gray-400 hover:text-gray-600"
                onClick={() => setSearchTerm("")}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Input
              type="month"
              className="flex-1 sm:w-auto"
              value={monthStr}
              onChange={(e) => setMonthStr(e.target.value)}
            />
            <Button variant="outline" size="icon" onClick={fetchSales} title="Refresh" className="shrink-0">
              <Layers className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            {selectedSales.length > 0 && (
              <Button variant="default" onClick={handleBatchPrint} className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 text-white gap-2 px-3">
                <Printer className="h-4 w-4" />
                Print ({selectedSales.length})
              </Button>
            )}
            {onOpenCreateModal && (
              <Button onClick={onOpenCreateModal} className="flex-1 sm:flex-none whitespace-nowrap">
                + Create Job Card
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Card View (Visible on screens < md) */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
            <p className="text-sm">Loading job cards...</p>
          </div>
        ) : sales.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
            <p className="text-sm font-semibold">No sales / job cards found for this month.</p>
          </div>
        ) : (
          sales.map((sale) => {
            const isExpanded = expandedSaleId === sale.id
            const isSelected = selectedSales.includes(sale.id)
            const itemQuantity = sale.items?.reduce((sum: number, i: any) => sum + i.quantity, 0) || 0
            const saleDate = parseSaleDateTime(sale)
            const dateFormatted = format(saleDate, "M/d/yyyy")

            return (
              <div 
                key={sale.id}
                className={`bg-white rounded-xl border border-slate-200 p-4 shadow-sm transition-all relative ${
                  isSelected ? "ring-2 ring-indigo-500 bg-indigo-50/20" : ""
                }`}
              >
                {/* Top Header Row: Checkbox, Date & Status */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation()
                        toggleSelectSale(sale.id)
                      }}
                    />
                    <span className="text-xs font-medium text-slate-400">
                      {dateFormatted}
                    </span>
                  </div>
                  <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                    <DeliveryStatusSelect 
                      saleId={sale.id}
                      deviceId={deviceId || 0}
                      currentStatus={sale.delivery_status || "Pending"}
                      customerName={sale.customer_name}
                      customerPhone={sale.customer_phone}
                      trackingId={sale.tracking_id}
                      orderNumber={sale.id}
                      paymentStatus={sale.payment_status}
                      isJobCard={true}
                      userRole="staff"
                      onStatusChange={() => fetchSales()}
                    />
                  </div>
                </div>

                {/* Customer Info */}
                <div 
                  className="cursor-pointer"
                  onClick={() => toggleExpand(sale.id)}
                >
                  <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                    {sale.customer_name || "N/A"}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {sale.customer_phone ? formatPhoneNumber(sale.customer_phone) : (sale.tracking_id || `#${sale.id}`)}
                  </p>

                  {/* Product Badge */}
                  <div className="mt-3">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-100">
                      {itemQuantity} Products
                    </span>
                  </div>
                </div>

                {/* Bottom Amount & Actions Row */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                  <div className="font-extrabold text-xl text-slate-900">
                    {currency} {Number(sale.total_amount).toFixed(0)}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-full bg-[#00c853] text-white hover:bg-[#00b000] hover:text-white shadow-sm shrink-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleWhatsApp(sale)
                      }}
                      title="WhatsApp"
                    >
                      <MessageCircle className="h-4 w-4 fill-white text-transparent" />
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-full bg-slate-800 text-white hover:bg-slate-900 hover:text-white shadow-sm shrink-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        handlePrint(sale)
                      }}
                      title="Print"
                    >
                      <Printer className="h-4 w-4" />
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-full bg-blue-600 text-white hover:bg-blue-700 hover:text-white shadow-sm shrink-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleEdit(sale)
                      }}
                      title="Edit"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Expanded Line Items & Address for Mobile */}
                {isExpanded && (
                  <div className="mt-4 pt-3 border-t border-slate-200 space-y-3 text-xs">
                    <div className="bg-slate-50 p-3 rounded-lg space-y-1 text-slate-600">
                      {sale.tracking_id && <p className="font-mono"><span className="font-semibold text-slate-500">Tracking:</span> {sale.tracking_id}</p>}
                      {sale.courier_service_name && <p><span className="font-semibold text-slate-500">Courier:</span> {sale.courier_service_name}</p>}
                      {sale.shipping_street && <p><span className="font-semibold text-slate-500">Address:</span> {sale.shipping_street}, {sale.shipping_city} {sale.shipping_pincode}</p>}
                    </div>
                    
                    <div className="space-y-1.5">
                      <p className="font-bold text-slate-800">Items:</p>
                      {sale.items?.map((item: any) => (
                        <div key={item.id} className="flex justify-between items-center py-1 border-b border-slate-100">
                          <span className="text-slate-800 font-medium">{item.product_name} x {item.quantity}</span>
                          <span className="font-bold text-slate-900">{currency} {(Number(item.price) * item.quantity).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Desktop Table View (Visible on screens >= md) */}
      <div className="hidden md:block rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden w-full">
        <div className="overflow-x-auto w-full">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="border-b border-t border-slate-200 bg-white text-xs font-bold uppercase tracking-wider text-slate-500">
                <th className="w-12 whitespace-nowrap px-4 py-4 text-left">
                  <input 
                    type="checkbox" 
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                    checked={sales.length > 0 && selectedSales.length === sales.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="w-10 whitespace-nowrap px-2 py-4 text-left"></th>
                <th className="whitespace-nowrap px-4 py-4 text-left">Date</th>
                <th className="whitespace-nowrap px-4 py-4 text-left">Customer</th>
                <th className="whitespace-nowrap px-4 py-4 text-left">Tracking</th>
                <th className="whitespace-nowrap px-4 py-4 text-center">Products</th>
                <th className="whitespace-nowrap px-4 py-4 text-right">Total Paid</th>
                <th className="whitespace-nowrap px-4 py-4 text-center">Status</th>
                <th className="sticky right-0 z-20 min-w-[5.5rem] whitespace-nowrap border-l border-slate-200 bg-white px-4 py-4 text-center shadow-[-8px_0_12px_-8px_rgba(15,23,42,0.05)]">WA</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale, index) => {
                const isExpanded = expandedSaleId === sale.id
                const isSelected = selectedSales.includes(sale.id)
                const itemQuantity = sale.items?.reduce((sum: number, i: any) => sum + i.quantity, 0) || 0
                
                const saleDate = parseSaleDateTime(sale)
                const dateFormatted = format(saleDate, "dd MMM yyyy")
                const timeFormatted = format(saleDate, "hh:mm a")

                const statusLower = (sale.delivery_status || "Pending").toLowerCase()
                let rowBg = index % 2 === 0 ? "bg-white" : "bg-slate-50/60"

                if (statusLower === "pending" || statusLower === "pending delivery") {
                  rowBg = "bg-amber-50/80 border-l-4 border-l-amber-500 hover:bg-amber-100/80 text-amber-950"
                } else if (
                  statusLower.includes("paid") ||
                  statusLower.includes("pack") ||
                  statusLower.includes("sent") ||
                  statusLower.includes("ship") ||
                  statusLower.includes("transit") ||
                  statusLower.includes("out for delivery") ||
                  statusLower.includes("dispatch")
                ) {
                  rowBg = "bg-blue-50/80 border-l-4 border-l-blue-500 hover:bg-blue-100/80 text-blue-950"
                } else if (statusLower.includes("deliver") || statusLower.includes("complete")) {
                  rowBg = "bg-emerald-50/80 border-l-4 border-l-emerald-500 hover:bg-emerald-100/80 text-emerald-950"
                } else if (statusLower.includes("cancel") || statusLower.includes("return")) {
                  rowBg = "bg-rose-50/70 border-l-4 border-l-rose-400 hover:bg-rose-100/70 text-rose-950"
                }

                return (
                  <div key={sale.id} className="contents">
                    <tr 
                      className={`group cursor-pointer border-b border-slate-100 transition-colors ${rowBg} ${isSelected ? 'bg-indigo-50/30' : ''}`}
                      onClick={() => toggleExpand(sale.id)}
                    >
                      <td className="whitespace-nowrap px-4 py-4 text-left" onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                          checked={isSelected}
                          onChange={() => toggleSelectSale(sale.id)}
                        />
                      </td>
                      <td className="whitespace-nowrap px-2 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-600" onClick={() => toggleExpand(sale.id)}>
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <div className="flex flex-col text-slate-600 text-sm">
                          {dateFormatted}
                        </div>
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900">{sale.customer_name || "N/A"}</span>
                          <span className="text-xs text-slate-500 mt-0.5">{sale.customer_phone ? formatPhoneNumber(sale.customer_phone) : "N/A"}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4">
                        <div className="flex flex-col items-start gap-1">
                          <span className="text-sm font-mono text-slate-600 font-medium">
                            {sale.tracking_id || "—"}
                          </span>
                          {sale.courier_service_name && (
                            <span className="text-xs font-sans font-bold text-blue-600">
                              {sale.courier_service_name}
                            </span>
                          )}
                          <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">
                            #{sale.id}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-center">
                        <span className="inline-flex items-center justify-center bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full text-xs font-semibold">
                          {itemQuantity} Item{itemQuantity !== 1 ? 's' : ''}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-right">
                        <div className="font-bold text-slate-900 text-sm">
                          {currency} {Number(sale.total_amount).toFixed(2)}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <DeliveryStatusSelect 
                          saleId={sale.id}
                          deviceId={deviceId || 0}
                          currentStatus={sale.delivery_status || "Pending"}
                          customerName={sale.customer_name}
                          customerPhone={sale.customer_phone}
                          trackingId={sale.tracking_id}
                          orderNumber={sale.id}
                          paymentStatus={sale.payment_status}
                          isJobCard={true}
                          userRole="staff"
                          onStatusChange={() => fetchSales()}
                        />
                      </td>
                      <td 
                        className={`sticky right-0 z-10 min-w-[8rem] whitespace-nowrap border-l border-slate-100 bg-white px-4 py-4 text-center shadow-[-8px_0_12px_-8px_rgba(15,23,42,0.05)]`} 
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center gap-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-[#128C7E] text-white hover:bg-[#075E54] hover:text-white shadow-sm" onClick={() => handleWhatsApp(sale)} title="WhatsApp">
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-slate-700 text-white hover:bg-slate-800 hover:text-white shadow-sm" onClick={() => handlePrint(sale)} title="Print">
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-blue-500 text-white hover:bg-blue-600 hover:text-white shadow-sm" onClick={() => handleEdit(sale)} title="Edit">
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded Row */}
                    {isExpanded && (
                      <tr key={`expanded-${sale.id}`} className="bg-slate-50/50 border-b border-slate-200">
                        <td colSpan={9} className="p-6">
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                            
                            {/* Summary Card */}
                            <div className="col-span-1 lg:col-span-1 space-y-6 order-2 lg:order-2">
                              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b pb-2">
                                <User className="h-4 w-4 text-slate-500" /> Customer & Order Summary
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
                                      <th className="px-4 py-3 text-right">Selling Price</th>
                                      <th className="px-4 py-3 text-right">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {sale.items?.map((item: any) => (
                                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-4 py-3 font-medium text-slate-800">{item.product_name || "Unknown Product"}</td>
                                        <td className="px-4 py-3 text-slate-500 text-xs">{item.variant_name || "Default"}</td>
                                        <td className="px-4 py-3 text-center text-slate-700 font-medium">{item.quantity}</td>
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
    </div>
  )
}
