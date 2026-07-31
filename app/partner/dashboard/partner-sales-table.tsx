"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { useRouter } from "next/navigation"
import { DELIVERY_STATUSES } from "@/lib/sale-shipping"
import { updatePartnerDeliveryStatus, updatePartnerSaleDetails } from "@/app/actions/partner-actions"
import { notifySuccess, notifyError } from "@/lib/notifications"
import { useToast } from "@/components/ui/use-toast"
import { Loader2, Phone, RefreshCw } from "lucide-react"

export function PartnerSalesTable({ initialSales }: { initialSales: any[] }) {
  const router = useRouter()
  const [sales, setSales] = useState(initialSales)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [loadingMap, setLoadingMap] = useState<Record<number, boolean>>({})
  const { toast } = useToast()

  useEffect(() => {
    setSales(initialSales)
    setIsRefreshing(false)
  }, [initialSales])

  const handleRefresh = () => {
    setIsRefreshing(true)
    router.refresh()
  }

  const isOptionDisabled = (currentStatus: string, optionStatus: string) => {
    const statusLower = currentStatus?.toLowerCase() || 'pending';
    if (currentStatus === optionStatus) return false;
    
    // Only allow Sent -> Shipped, and Shipped -> Delivered
    if (statusLower === 'sent' && optionStatus === 'Shipped') return false;
    if (statusLower === 'shipped' && optionStatus === 'Delivered') return false;
    
    return true; // Disable everything else
  }

  const handleStatusChange = async (saleId: number, newStatus: string) => {
    let trackingId: string | undefined = undefined;
    
    if (newStatus === 'Shipped') {
      const input = window.prompt("Please enter the Tracking ID:");
      if (input === null) return; // User cancelled
      trackingId = input.trim();
    }

    setLoadingMap(prev => ({ ...prev, [saleId]: true }))
    try {
      const result = await updatePartnerDeliveryStatus(saleId, newStatus, trackingId)
      if (result.success) {
        setSales(prev => prev.map(s => {
          if (s.id === saleId) {
             return { 
               ...s, 
               delivery_status: newStatus, 
               ...(trackingId !== undefined && { tracking_id: trackingId })
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
              <th className="px-6 py-4 font-bold">Date</th>
              <th className="px-6 py-4 font-bold">Customer</th>
              <th className="px-6 py-4 font-bold">Tracking</th>
              <th className="px-6 py-4 font-bold text-center">Products</th>
              <th className="px-6 py-4 font-bold text-center">Unit / Wt</th>
              <th className="px-6 py-4 font-bold text-center">Courier Cost</th>
              <th className="px-6 py-4 font-bold text-center">Status</th>
              <th className="px-6 py-4 font-bold text-center">WA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sales.map((sale) => (
              <tr key={sale.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-6 py-4 text-gray-600 font-medium whitespace-nowrap">
                  {sale.sale_date ? format(new Date(sale.sale_date), "M/d/yyyy") : "-"}
                </td>
                <td className="px-6 py-4">
                  <div className="font-bold text-gray-900">{sale.customer_name || "Guest"}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{sale.customer_phone || "-"}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="font-bold text-gray-700">{sale.tracking_id || "-"}</div>
                  <div className="text-xs text-indigo-500 font-semibold mt-0.5">#{sale.id}</div>
                </td>
                <td className="px-6 py-4 text-center">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                    1 Items
                  </span>
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
    </div>
  )
}

