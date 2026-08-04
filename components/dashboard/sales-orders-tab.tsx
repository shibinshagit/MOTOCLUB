"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getAllJobCards } from "@/app/actions/job-card-actions"
import { deleteSale } from "@/app/actions/sale-actions"
import { DeliveryStatusSelect } from "@/components/sales/delivery-status-select"
import { TrackingCell } from "@/components/sales/tracking-cell"
import { useDispatch, useSelector } from "react-redux"
import { selectDeviceCurrency, selectDeviceId } from "@/store/slices/deviceSlice"
import { markInventoryStale } from "@/lib/inventory-sync"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronDown, ChevronUp, MapPin, Phone, User, Calendar, Layers, Printer, Edit, Trash2, Search, PlayCircle, Eye, Plus, Loader2 } from "lucide-react"
import { formatPhoneNumber } from "@/lib/utils"
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
import { printJobCard, printBatchJobCards } from "@/lib/receipt-utils"
import { JobCardModal } from "@/components/shared/job-card/job-card-modal"
import ViewSaleModal from "@/components/sales/view-sale-modal"
import { format } from "date-fns"

export default function SalesOrdersTab() {
  const router = useRouter()
  const dispatch = useDispatch()
  const currency = useSelector(selectDeviceCurrency)
  const deviceId = useSelector(selectDeviceId)
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
  }, [deviceId])

  const fetchSales = async () => {
    setLoading(true)
    const res = await getAllJobCards(deviceId || 0)
    if (res.success && res.data) {
      setSales(res.data)
    }
    setLoading(false)
  }

  const toggleExpand = (id: number) => {
    setExpandedSaleId(expandedSaleId === id ? null : id)
  }

  const handlePrint = (sale: any) => {
    printJobCard(sale, currency)
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

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Order List</h2>
          <p className="text-sm text-gray-500">Manage and process all pending orders</p>
        </div>
        
        <div className="flex w-full md:w-auto items-center gap-2">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
            <Input
              type="text"
              placeholder="Search orders..."
              className="pl-9 h-9 w-full"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button variant="outline" size="sm" onClick={fetchSales} className="h-9">
            Refresh
          </Button>
          <Button size="sm" onClick={() => setIsCreateModalOpen(true)} className="h-9 gap-2">
            <Plus className="h-4 w-4" /> Create Job Card
          </Button>
          {selectedSales.length > 0 && (
            <Button variant="default" size="sm" onClick={handleBatchPrint} className="h-9 bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
              <Printer className="h-4 w-4" />
              Print ({selectedSales.length})
            </Button>
          )}
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
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-[#F1F4F9] text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <th className="w-12 whitespace-nowrap px-4 py-2.5 text-left">
                    <input 
                      type="checkbox" 
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                      checked={filteredSales.length > 0 && selectedSales.length === filteredSales.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="w-12 whitespace-nowrap px-4 py-2.5 text-left"></th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-left">Order #</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-left">Date & Time</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-left">Customer</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-left">Phone</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-left">Tracking ID</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-center">Items</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-right">Total</th>
                  <th className="whitespace-nowrap px-4 py-2.5 text-center">Delivery Status</th>
                  <th className="sticky right-0 z-20 min-w-[7rem] whitespace-nowrap border-l border-slate-200 bg-[#F1F4F9] px-4 py-2.5 text-right shadow-[-8px_0_12px_-8px_rgba(15,23,42,0.12)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((sale, index) => {
                  const isExpanded = expandedSaleId === sale.id
                  const isSelected = selectedSales.includes(sale.id)
                  const itemQuantity = sale.items?.reduce((sum: number, i: any) => sum + i.quantity, 0) || 0
                  
                  const saleDate = new Date(sale.created_at || sale.sale_date)
                  const dateFormatted = format(saleDate, "dd MMM yyyy")
                  const timeFormatted = format(saleDate, "hh:mm a")
  
                  const rowBg = index % 2 === 0 ? "bg-white" : "bg-slate-50/60"
  
                  return (
                    <div key={sale.id} className="contents">
                      <tr 
                        className={`group cursor-pointer border-b border-slate-200 transition-colors hover:bg-violet-50/50 ${rowBg} ${isSelected ? 'bg-indigo-50/50' : ''}`}
                        onClick={() => toggleExpand(sale.id)}
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox" 
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                            checked={isSelected}
                            onChange={() => toggleSelectSale(sale.id)}
                          />
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-600" onClick={() => toggleExpand(sale.id)}>
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-700">#{sale.id}</td>
                        <td className="whitespace-nowrap px-4 py-2.5">
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-800">{dateFormatted}</span>
                            <span className="text-xs text-slate-500">{timeFormatted}</span>
                          </div>
                        </td>
                        <td className="max-w-[180px] truncate px-4 py-2.5 font-medium text-slate-700">{sale.customer_name || "N/A"}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{sale.customer_phone ? formatPhoneNumber(sale.customer_phone) : "N/A"}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-slate-600">
                          <div className="flex flex-col gap-0.5">
                            <TrackingCell 
                              saleId={sale.id}
                              deviceId={deviceId || 0}
                              trackingId={sale.tracking_id}
                              deliveryStatus={sale.delivery_status}
                              onUpdate={fetchSales}
                            />
                            {sale.courier_service_name && (
                              <span className="text-[10px] font-sans font-medium text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded w-fit">
                                {sale.courier_service_name}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-center font-medium text-slate-700">{itemQuantity}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right font-bold text-slate-800">
                          {currency} {Number(sale.total_amount).toFixed(2)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
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
                          className={`sticky right-0 z-10 min-w-[12rem] whitespace-nowrap border-l border-slate-200 px-4 py-2.5 text-right shadow-[-8px_0_12px_-8px_rgba(15,23,42,0.12)] group-hover:bg-violet-50/50 ${rowBg}`} 
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={() => handleView(sale)} title="View Details">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => handleOpenInPOS(sale.id)} title="Open in POS">
                              <PlayCircle className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600 hover:text-slate-700 hover:bg-slate-100" onClick={() => handlePrint(sale)} title="Print">
                              <Printer className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-violet-600 hover:text-violet-700 hover:bg-violet-50" onClick={() => handleEdit(sale)} title="Edit">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50" onClick={() => handleDelete(sale.id)} title="Delete Order">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
  
                      {/* Expanded Row */}
                      {isExpanded && (
                        <tr key={`expanded-${sale.id}`} className="bg-slate-50/50 border-b border-slate-200">
                          <td colSpan={10} className="p-6">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                              
                              {/* Summary Card */}
                              <div className="col-span-1 lg:col-span-1 space-y-6 order-2 lg:order-2">
                                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b pb-2">
                                  <User className="h-4 w-4 text-slate-500" /> Customer Information
                                </h4>
                                
                                <div className="space-y-3 text-sm text-slate-600">
                                  {sale.job_card_number && (
                                    <div className="mb-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">Job Card #</span>
                                      <p className="font-mono text-slate-800 text-sm font-bold">{sale.job_card_number}</p>
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
