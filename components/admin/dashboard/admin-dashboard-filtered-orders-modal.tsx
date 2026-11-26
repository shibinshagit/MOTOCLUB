"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Loader2, ShoppingBag } from "lucide-react"
import {
  getAdminDashboardFilteredOrders,
  type AdminDashboardFilteredOrder,
  type AdminDashboardQuery,
} from "@/app/actions/admin-dashboard-actions"

interface AdminDashboardFilteredOrdersModalProps {
  isOpen: boolean
  onClose: () => void
  query: AdminDashboardQuery
  periodLabel: string
  currency: string
}

function formatMoney(amount: number, currency: string) {
  const sym = currency === "INR" || !currency ? "₹" : `${currency} `
  return `${sym}${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`
}

export default function AdminDashboardFilteredOrdersModal({
  isOpen,
  onClose,
  query,
  periodLabel,
  currency,
}: AdminDashboardFilteredOrdersModalProps) {
  const [orders, setOrders] = useState<AdminDashboardFilteredOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false

    const loadOrders = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await getAdminDashboardFilteredOrders(query)
        if (cancelled) return
        if (res.success) {
          setOrders(res.data || [])
        } else {
          setError(res.message || "Failed to load orders.")
        }
      } catch {
        if (!cancelled) setError("Failed to load orders.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadOrders()
    return () => {
      cancelled = true
    }
  }, [isOpen, query])

  const totalBill = orders.reduce((s, o) => s + o.total_amount, 0)
  const totalReceived = orders.reduce((s, o) => s + o.received_amount, 0)
  const totalBalance = orders.reduce((s, o) => s + o.balance_due, 0)

  const activeFiltersList: string[] = []
  if (query.status && query.status !== "all") activeFiltersList.push(`Status: ${query.status}`)
  if (query.paymentMethod && query.paymentMethod !== "all") activeFiltersList.push(`Payment: ${query.paymentMethod}`)
  if (query.courierServiceName && query.courierServiceName !== "all") activeFiltersList.push(`Service: ${query.courierServiceName}`)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85dvh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700">
              <ShoppingBag className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900">
                Filtered Sales & Orders ({orders.length})
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                {periodLabel}
                {activeFiltersList.length > 0 ? ` · ${activeFiltersList.join(" · ")}` : " · All valid orders"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Summary Strip */}
        <div className="grid grid-cols-3 gap-3 px-6 py-3 bg-white border-b shrink-0">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-[11px] font-medium text-slate-500">Total Bill Amount</div>
            <div className="text-sm font-bold text-slate-900">{formatMoney(totalBill, currency)}</div>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
            <div className="text-[11px] font-medium text-blue-700">Total Received</div>
            <div className="text-sm font-bold text-blue-800">{formatMoney(totalReceived, currency)}</div>
          </div>
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
            <div className="text-[11px] font-medium text-orange-700">Balance to Receive</div>
            <div className="text-sm font-bold text-orange-800">{formatMoney(totalBalance, currency)}</div>
          </div>
        </div>

        {/* Orders Table */}
        <div className="flex-1 overflow-auto min-h-0 p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-500 text-xs gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
              Loading matching orders...
            </div>
          ) : error ? (
            <div className="text-center py-12 text-rose-600 text-xs font-medium">{error}</div>
          ) : orders.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              No orders match the selected filters in this period.
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Order #</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Date</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Customer</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Staff</th>
                    <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Status</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-slate-600">Total Bill</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-slate-600">Received</th>
                    <th className="px-3 py-2.5 text-right font-semibold text-slate-600">Balance Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {orders.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50/80">
                      <td className="px-3 py-2 font-semibold text-slate-900">#{o.id}</td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                        {o.sale_date ? format(new Date(o.sale_date), "dd MMM yyyy") : "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-800">{o.customer_name}</td>
                      <td className="px-3 py-2 text-slate-600">{o.staff_name}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-[10px] font-medium">
                          {o.status || o.payment_status || "Completed"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-slate-900 whitespace-nowrap">
                        {formatMoney(o.total_amount, currency)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-blue-700 whitespace-nowrap">
                        {formatMoney(o.received_amount, currency)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-orange-700 whitespace-nowrap">
                        {o.balance_due > 0 ? formatMoney(o.balance_due, currency) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

