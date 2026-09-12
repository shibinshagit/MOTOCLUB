"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { useRouter } from "next/navigation"
import { DELIVERY_STATUSES } from "@/lib/sale-shipping"
import { updatePartnerDeliveryStatus, updatePartnerSaleDetails, updatePartnerReplacementDeliveryStatus } from "@/app/actions/partner-actions"
import { notifySuccess, notifyError } from "@/lib/notifications"
import { useToast } from "@/components/ui/use-toast"
import { Loader2, Phone, RefreshCw, FileText, Printer, Package, Truck, Clock } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

import { TrackingDetailsModal } from "@/components/sales/tracking-details-modal"

export function PartnerSalesTable({
  initialSales,
  initialReplacements = [],
}: {
  initialSales: any[]
  initialReplacements?: any[]
}) {
  const router = useRouter()
  const [sales, setSales] = useState(initialSales)
  const [replacements, setReplacements] = useState(initialReplacements)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({})
  const [directConfirmSaleId, setDirectConfirmSaleId] = useState<number | null>(null)
  
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

  const { toast } = useToast()

  useEffect(() => {
    setSales(initialSales)
    setReplacements(initialReplacements)
    setIsRefreshing(false)
  }, [initialSales, initialReplacements])

  const handleRefresh = () => {
    setIsRefreshing(true)
    router.refresh()
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
      const currentSale = sales.find(s => s.id === saleId);
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
    setLoadingMap(prev => ({ ...prev, [saleId]: true }))
    try {
      const result = await updatePartnerDeliveryStatus(saleId, newStatus, trackingId, courierServiceName)
      if (result.success) {
        setSales(prev => prev.map(s => {
          if (s.id === saleId) {
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
    } catch (error) {
      notifyError(toast, "An error occurred while updating status")
    } finally {
      setLoadingMap(prev => ({ ...prev, [saleId]: false }))
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
      const currentRs = replacements.find((r) => r.id === replacementId)
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
        setReplacements((prev) =>
          prev.map((r) => {
            if (r.id === replacementId) {
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
    import("@/lib/receipt-utils").then(({ printJobCard }) => {
      if (sale.items && sale.items.length > 0) {
        printJobCard(sale, "INR")
      } else {
        import("@/app/actions/sale-actions").then(({ getSaleDetails }) => {
          getSaleDetails(sale.id).then((res) => {
            if (res.success && res.data) {
              const fullSale = { ...res.data.sale, items: res.data.items }
              printJobCard(fullSale, "INR")
            } else {
              toast({ title: "Error", description: "Failed to load order details", variant: "destructive" })
            }
          })
        })
      }
    })
  }

  const handleDetailsChange = async (saleId: number, field: 'weight_kg' | 'expense_courier', value: string) => {
    const sale = sales.find(s => s.id === saleId)
    if (!sale) return
    
    // Optimistic update
    setSales(prev => prev.map(s => s.id === saleId ? { ...s, [field]: value } : s))
    
    // Get both values for API call
    const weightKg = field === 'weight_kg' ? value : (sale.weight_kg?.toString() || "")
    const expenseCourier = field === 'expense_courier' ? value : (sale.expense_courier?.toString() || "")
    
    try {
      const result = await updatePartnerSaleDetails(saleId, weightKg, expenseCourier)
      if (!result.success) {
        notifyError(toast, result.message || "Failed to update details")
      }
    } catch (error) {
      notifyError(toast, "An error occurred while updating details")
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Replacement Shipments Section */}
      {replacements.length > 0 && (
        <div className="bg-gradient-to-r from-blue-900 to-indigo-900 rounded-xl p-5 shadow-md text-white space-y-4">
          <div className="flex items-center justify-between border-b border-blue-800/80 pb-3">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-blue-300" />
              <h3 className="text-base font-bold">Replacement Shipments ({replacements.length})</h3>
            </div>
            <span className="text-xs bg-blue-800/80 text-blue-200 px-3 py-1 rounded-full font-medium">
              Logistics Only &bull; ₹0 Payment
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {replacements.map((rs) => (
              <div key={rs.id} className="bg-white text-slate-800 rounded-lg p-4 shadow-sm border border-blue-200 space-y-2">
                <div className="flex items-center justify-between border-b pb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-blue-900 text-sm">{rs.replacement_number}</span>
                      <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                        🔄 Replacement
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Original Order: <span className="font-semibold text-slate-800">#{rs.sale_id}</span>
                    </p>
                  </div>
                  <span className="text-xs font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">
                    ₹0 (No Payment)
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs py-1">
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-semibold">Reason</span>
                    <p className="font-semibold text-slate-800">{rs.reason || "Missing Item"}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] uppercase font-semibold">Customer</span>
                    <p className="font-semibold text-slate-800">{rs.customer_name || "Customer"}</p>
                  </div>
                </div>

                <div className="bg-slate-50 p-2 rounded border text-xs space-y-1">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">Items:</span>
                  {(rs.items || []).map((item: any) => (
                    <div key={item.id} className="flex justify-between text-slate-800">
                      <span>{item.product_name}{item.variant_name ? ` (${item.variant_name})` : ""}</span>
                      <span className="font-mono font-bold">× {item.quantity}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2 border-t text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 font-medium">Status:</span>
                    <select
                      value={rs.delivery_status || rs.status || "Pending"}
                      onChange={(e) => handleReplacementStatusChange(rs.id, e.target.value)}
                      disabled={loadingMap[`rs-${rs.id}`]}
                      className="h-7 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-blue-900"
                    >
                      {DELIVERY_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                    {loadingMap[`rs-${rs.id}`] && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />}
                  </div>

                  {rs.tracking_id ? (
                    <span className="font-mono font-bold text-blue-900 bg-blue-50 px-2 py-1 rounded border border-blue-200">
                      {rs.tracking_id}
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">No Tracking</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {sales.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-500 font-medium">
          No orders assigned to you yet.
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden pt-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100">
            <tr>
              <th className="px-6 py-4 font-bold whitespace-nowrap">Order / Date</th>
              <th className="px-6 py-4 font-bold">Customer</th>
              <th className="px-6 py-4 font-bold whitespace-nowrap text-right">Amount</th>
              <th className="px-6 py-4 font-bold text-center">Status</th>
              <th className="px-6 py-4 font-bold text-center whitespace-nowrap">Actions</th>
              <th className="px-6 py-4 font-bold text-center whitespace-nowrap">Shipping Date</th>
              <th className="px-6 py-4 font-bold">Tracking</th>
              <th className="px-6 py-4 font-bold text-center">Unit / Wt</th>
              <th className="px-6 py-4 font-bold text-center">Courier Cost</th>
              <th className="px-6 py-4 font-bold text-center">WA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sales.map((sale) => (
              <tr key={sale.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-6 py-4 text-gray-600 font-medium whitespace-nowrap">
                  <div className="font-bold text-indigo-600">#{sale.id}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {sale.sale_date ? format(new Date(sale.sale_date), "dd/MM/yyyy") : "-"}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="font-bold text-gray-900">{sale.customer_name || "Guest"}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{sale.customer_phone || "-"}</div>
                </td>
                <td className="px-6 py-4 text-right whitespace-nowrap">
                  <div className="font-bold text-gray-900">₹{Number(sale.total_amount || 0).toFixed(2)}</div>
                </td>
                <td className="px-6 py-4 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <select
                      value={sale.delivery_status || "Pending"}
                      onChange={(e) => handleStatusChange(sale.id, e.target.value)}
                      disabled={loadingMap[sale.id]}
                      className="h-8 rounded-full border border-transparent bg-blue-100 text-blue-700 px-3 py-1 text-xs font-bold focus:border-blue-300 focus:ring-2 focus:ring-blue-200 disabled:opacity-50 appearance-none text-center cursor-pointer hover:bg-blue-200 transition-colors"
                      style={{ paddingRight: '1rem', backgroundImage: 'none' }}
                    >
                      {DELIVERY_STATUSES.map(status => (
                        <option 
                          key={status} 
                          value={status} 
                          disabled={isOptionDisabled(sale.delivery_status, status)}
                        >
                          {status}
                        </option>
                      ))}
                    </select>
                    {loadingMap[sale.id] && <Loader2 className="h-4 w-4 animate-spin text-gray-400 absolute ml-24" />}
                  </div>
                </td>
                <td className="px-6 py-4 text-center whitespace-nowrap">
                  {sale.delivery_status?.toLowerCase() === "direct" ? (
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => handlePrintInvoice(sale)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors shadow-2xs cursor-pointer"
                        title="Print Customer Invoice"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        <span>Invoice</span>
                      </button>
                      <button
                        onClick={() => handlePrintLabel(sale)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-200 text-slate-700 bg-slate-50 hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer"
                        title="Print Delivery Label"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        <span>Label</span>
                      </button>
                    </div>
                  ) : (
                    <span className="text-slate-400 font-medium">—</span>
                  )}
                </td>
                <td className="px-6 py-4 text-center whitespace-nowrap">
                  {sale.shipping_date ? (
                    <span 
                      className="font-semibold text-slate-700 text-xs" 
                      title={format(new Date(sale.shipping_date), "dd/MM/yyyy HH:mm:ss")}
                    >
                      {format(new Date(sale.shipping_date), "dd/MM/yyyy")}
                    </span>
                  ) : (
                    <span className="text-slate-400 font-medium">—</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="font-bold text-gray-700">{sale.tracking_id || "—"}</div>
                  {sale.courier_service_name && (
                    <div className="text-xs text-blue-600 font-semibold mt-0.5">{sale.courier_service_name}</div>
                  )}
                </td>
                <td className="px-6 py-4 text-center">
                  <input
                    type="text"
                    defaultValue={sale.weight_kg || ""}
                    placeholder="kg/unit"
                    onBlur={(e) => handleDetailsChange(sale.id, 'weight_kg', e.target.value)}
                    className="w-16 h-8 text-center text-xs font-medium border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </td>
                <td className="px-6 py-4 text-center">
                  <input
                    type="text"
                    defaultValue={sale.expense_courier || 0}
                    onBlur={(e) => handleDetailsChange(sale.id, 'expense_courier', e.target.value)}
                    className="w-16 h-8 text-center text-xs font-medium border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </td>
                <td className="px-6 py-4 text-center">
                  <div className="flex justify-center">
                    {sale.customer_phone ? (
                      <a 
                        href={`https://wa.me/${sale.customer_phone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-8 w-8 rounded-full bg-indigo-500 hover:bg-indigo-600 text-white flex items-center justify-center transition-colors shadow-sm"
                        title="Chat on WhatsApp"
                      >
                        <Phone className="h-3.5 w-3.5 fill-current" />
                      </a>
                    ) : (
                      <button 
                        disabled
                        className="h-8 w-8 rounded-full bg-gray-300 text-white flex items-center justify-center shadow-sm cursor-not-allowed"
                      >
                        <Phone className="h-3.5 w-3.5 fill-current" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
      )}

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
