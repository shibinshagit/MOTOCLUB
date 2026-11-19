"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Calendar, CreditCard, Package, Wallet, Clock, AlertCircle, Receipt, User, Phone } from "lucide-react"
import { format } from "date-fns"
import { getCustomerSales, type CustomerSettlementSummary } from "@/app/actions/customer-actions"
import { formatCurrency as formatMoney } from "@/lib/utils"
import { useSelector } from "react-redux"
import { selectDeviceCurrency } from "@/store/slices/deviceSlice"

interface CustomerPendingSalesModalProps {
  isOpen: boolean
  onClose: () => void
  customer: CustomerSettlementSummary | null
  companyId?: number
  deviceId?: number
  onCollect?: (customer: CustomerSettlementSummary) => void
}

interface PendingSale {
  id: number
  sale_date: string
  total_amount: number
  received_amount: number
  payment_method: string | null
  status: string
  item_count?: number
}

export default function CustomerPendingSalesModal({
  isOpen,
  onClose,
  customer,
  companyId,
  deviceId,
  onCollect,
}: CustomerPendingSalesModalProps) {
  const [sales, setSales] = useState<PendingSale[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const currency = useSelector(selectDeviceCurrency) || "INR"

  const formatCurrency = (amount: number) => formatMoney(Number(amount || 0), currency)

  useEffect(() => {
    if (isOpen && customer?.customer_id) {
      fetchPendingSales()
    } else {
      setSales([])
      setError(null)
    }
  }, [isOpen, customer?.customer_id])

  const fetchPendingSales = async () => {
    if (!customer?.customer_id) return
    setLoading(true)
    setError(null)

    try {
      const result = await getCustomerSales(customer.customer_id, companyId, deviceId)
      if (result.success && Array.isArray(result.data)) {
        // Strictly filter to ONLY orders where total_amount - received_amount > 0.01 (unsettled / pending credit orders)
        const pendingOnly = result.data.filter((sale: any) => {
          const total = Number(sale.total_amount || 0)
          const received = Number(sale.received_amount || 0)
          return total - received > 0.01
        })
        setSales(pendingOnly)
      } else {
        setError(result.message || "Failed to load sales history")
      }
    } catch (err) {
      console.error("Error fetching pending sales:", err)
      setError("An unexpected error occurred while loading pending sales.")
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const s = (status || "").toLowerCase()
    if (s === "completed") return "bg-green-100 text-green-800 border-green-200"
    if (s === "pending") return "bg-amber-100 text-amber-800 border-amber-200"
    if (s === "delivered") return "bg-blue-100 text-blue-800 border-blue-200"
    return "bg-gray-100 text-gray-800 border-gray-200"
  }

  // Calculate totals of pending orders
  const totalPendingBalance = sales.reduce((sum, s) => {
    const total = Number(s.total_amount || 0)
    const received = Number(s.received_amount || 0)
    return sum + Math.max(0, total - received)
  }, 0)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex-shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-blue-400" />
                <DialogTitle className="text-base sm:text-lg font-bold text-white">
                  Pending Orders · {customer?.customer_name || "Customer"}
                </DialogTitle>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300 mt-1">
                {customer?.customer_phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3 text-slate-400" />
                    {customer.customer_phone}
                  </span>
                )}
                <span>Customer ID: #{customer?.customer_id}</span>
              </div>
            </div>

            {customer && customer.still_to_collect > 0.01 && onCollect && (
              <Button
                size="sm"
                onClick={() => onCollect(customer)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs px-3 py-1.5 h-8 rounded-lg shadow-sm flex items-center gap-1.5 self-start sm:self-auto"
              >
                <CreditCard className="h-3.5 w-3.5" />
                <span>Collect Payment</span>
              </Button>
            )}
          </div>

          {/* Pending Summary Banner */}
          <div className="mt-3 pt-3 border-t border-slate-700/60 flex items-center justify-between text-xs">
            <span className="text-slate-300">Total Pending Balance</span>
            <span className="text-sm font-bold text-amber-400">
              {formatCurrency(customer?.still_to_collect ?? totalPendingBalance)}
            </span>
          </div>
        </DialogHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-2" />
              <p className="text-sm">Loading pending orders...</p>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 p-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          ) : sales.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200 p-6">
              <Receipt className="h-10 w-10 text-gray-300 mx-auto mb-2" />
              <h4 className="text-sm font-semibold text-gray-800">No pending orders</h4>
              <p className="text-xs text-gray-500 mt-1">
                All sales orders for this customer are completely paid.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-xs font-medium text-gray-500 flex items-center justify-between px-1">
                <span>{sales.length} pending order{sales.length === 1 ? "" : "s"} with balance due</span>
                <span className="text-gray-400">Oldest first to newest</span>
              </div>

              {sales.map((sale) => {
                const total = Number(sale.total_amount || 0)
                const received = Number(sale.received_amount || 0)
                const balanceLeft = Math.max(0, total - received)
                const hasPartialPayment = received > 0

                return (
                  <div
                    key={sale.id}
                    className="p-3.5 sm:p-4 bg-white rounded-xl border border-gray-200 shadow-xs hover:border-gray-300 transition-all space-y-3"
                  >
                    {/* Top Row: Sale ID, Status, Date */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900 text-sm sm:text-base">
                          Sale #{sale.id}
                        </span>
                        <Badge variant="outline" className={`text-[11px] font-medium ${getStatusBadge(sale.status)}`}>
                          {sale.status || "Pending"}
                        </Badge>
                        <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[11px] font-medium">
                          {hasPartialPayment ? "Partially Paid" : "Unpaid Credit"}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Calendar className="h-3.5 w-3.5 text-gray-400" />
                        <span>
                          {sale.sale_date ? format(new Date(sale.sale_date), "dd MMM yyyy, h:mm a") : "N/A"}
                        </span>
                      </div>
                    </div>

                    {/* Middle Row: Financial Breakdown Grid */}
                    <div className="grid grid-cols-3 gap-2 p-2.5 bg-gray-50/80 rounded-lg border border-gray-100 text-center">
                      <div>
                        <div className="text-[11px] font-medium text-gray-500">Total Amount</div>
                        <div className="text-sm font-semibold text-gray-900 mt-0.5">
                          {formatCurrency(total)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-medium text-gray-500">Paid</div>
                        <div className="text-sm font-semibold text-emerald-600 mt-0.5">
                          {formatCurrency(received)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-medium text-amber-800">Amount Left</div>
                        <div className="text-sm font-bold text-amber-700 mt-0.5">
                          {formatCurrency(balanceLeft)}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Row: Additional Details */}
                    <div className="flex items-center justify-between text-xs text-gray-500 pt-0.5">
                      <div className="flex items-center gap-3">
                        {sale.item_count ? (
                          <span className="flex items-center gap-1">
                            <Package className="h-3 w-3 text-gray-400" />
                            {sale.item_count} {sale.item_count === 1 ? "item" : "items"}
                          </span>
                        ) : null}
                        {sale.payment_method ? (
                          <span className="flex items-center gap-1">
                            <Wallet className="h-3 w-3 text-gray-400" />
                            Method: {sale.payment_method}
                          </span>
                        ) : null}
                      </div>

                      <span className="text-xs font-semibold text-amber-700">
                        Pending: {formatCurrency(balanceLeft)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="p-3 sm:p-4 bg-gray-50 border-t border-gray-200 flex-row items-center justify-between">
          <div className="text-xs text-gray-500">
            {sales.length > 0 ? (
              <span>Showing <strong>{sales.length}</strong> pending order{sales.length === 1 ? "" : "s"}</span>
            ) : null}
          </div>
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

