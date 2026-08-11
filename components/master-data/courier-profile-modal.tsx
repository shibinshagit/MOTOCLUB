"use client"

import React, { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Truck, Phone, Mail, Globe, ExternalLink, Loader2, ShoppingBag, DollarSign, Package, Calendar } from "lucide-react"
import { getCourierProfileDetails } from "@/app/actions/master-data-actions"
import { formatPhoneNumber } from "@/lib/utils"

interface CourierProfileModalProps {
  courierId: number | null
  isOpen: boolean
  onClose: () => void
  currency?: string
}

export function CourierProfileModal({ courierId, isOpen, onClose, currency = "INR" }: CourierProfileModalProps) {
  const [loading, setLoading] = useState(true)
  const [details, setDetails] = useState<any>(null)

  useEffect(() => {
    if (isOpen && courierId) {
      fetchCourierDetails()
    } else {
      setDetails(null)
    }
  }, [isOpen, courierId])

  const fetchCourierDetails = async () => {
    if (!courierId) return
    setLoading(true)
    try {
      const res = await getCourierProfileDetails(courierId)
      if (res.success && res.data) {
        setDetails(res.data)
      }
    } catch (err) {
      console.error("Failed to load courier profile:", err)
    } finally {
      setLoading(false)
    }
  }

  const courier = details?.courier

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="border-b pb-4">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center font-bold text-xl">
              <Truck className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-slate-900">
                {courier?.name || "Courier Service Profile"}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 flex items-center gap-3 mt-1">
                {courier?.code && <span className="font-mono">Code: #{courier.code}</span>}
                {courier?.contact_phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {formatPhoneNumber(courier.contact_phone)}
                  </span>
                )}
                {courier?.contact_email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" /> {courier.contact_email}
                  </span>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="mr-2 h-6 w-6 animate-spin text-violet-600" />
            Loading partner profile & earnings...
          </div>
        ) : !details ? (
          <div className="py-12 text-center text-slate-500">No profile details available.</div>
        ) : (
          <div className="space-y-6 py-2">
            {/* Stat Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                  <span>Total Orders</span>
                  <Package className="h-4 w-4 text-blue-600" />
                </div>
                <div className="text-2xl font-bold text-slate-900 mt-2">
                  {details.totalOrders} <span className="text-xs font-normal text-slate-500">orders</span>
                </div>
              </div>

              <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
                <div className="flex items-center justify-between text-emerald-700 text-xs font-semibold">
                  <span>Courier Earnings</span>
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-bold text-emerald-900 mt-2">
                  {currency} {Number(details.totalEarnings || 0).toFixed(2)}
                </div>
              </div>

              <div className="bg-violet-50 p-4 rounded-xl border border-violet-200">
                <div className="flex items-center justify-between text-violet-700 text-xs font-semibold">
                  <span>Total Order Volume</span>
                  <ShoppingBag className="h-4 w-4 text-violet-600" />
                </div>
                <div className="text-2xl font-bold text-violet-900 mt-2">
                  {currency} {Number(details.totalRevenue || 0).toFixed(2)}
                </div>
              </div>
            </div>

            {/* Courier Info Links */}
            {(courier?.website || courier?.tracking_url_template || courier?.notes) && (
              <div className="bg-slate-50 p-3 rounded-xl border text-xs space-y-1">
                {courier?.website && (
                  <div className="flex items-center gap-1.5 text-blue-600 font-medium">
                    <Globe className="h-3.5 w-3.5" />
                    <a href={courier.website} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1">
                      {courier.website} <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
                {courier?.notes && (
                  <div className="text-slate-600 mt-1">
                    <span className="font-semibold text-slate-700">Notes:</span> {courier.notes}
                  </div>
                )}
              </div>
            )}

            {/* Recent Orders Handled */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center justify-between">
                <span>Handled Orders History ({details.recentOrders?.length || 0})</span>
              </h3>

              {details.recentOrders?.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs border border-dashed rounded-xl bg-slate-50">
                  No orders processed by this courier yet.
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-500 uppercase border-b">
                      <tr>
                        <th className="px-3 py-2.5 font-semibold">Order / Tracking</th>
                        <th className="px-3 py-2.5 font-semibold">Customer</th>
                        <th className="px-3 py-2.5 font-semibold text-center">Status</th>
                        <th className="px-3 py-2.5 font-semibold text-right">Courier Fee</th>
                        <th className="px-3 py-2.5 font-semibold text-right">Order Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {details.recentOrders.map((order: any) => (
                        <tr key={order.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2.5 font-bold text-blue-700">
                            #{order.tracking_id || order.id}
                            <div className="text-[10px] text-slate-400 font-normal">
                              {new Date(order.created_at).toLocaleDateString()}
                            </div>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="font-semibold text-slate-800">{order.customer_name || "N/A"}</div>
                            <div className="text-[10px] text-slate-500">{order.customer_phone ? formatPhoneNumber(order.customer_phone) : ""}</div>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                              {order.delivery_status || order.status || "Shipped"}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-emerald-700">
                            {currency} {Number(order.expense_courier || order.courier_paid_extra || 0).toFixed(2)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold text-slate-900">
                            {currency} {Number(order.total_amount || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
