"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"
import { getStaffPurchaseDetails } from "@/app/actions/staff-request-actions"
import { reassignSaleOwnership } from "@/app/actions/sale-actions"
import {
  User,
  Phone,
  Mail,
  Briefcase,
  Calendar,
  Banknote,
  TrendingUp,
  Package,
  CreditCard,
  Search,
  Loader2,
  UserCheck,
  ArrowRightLeft,
  FileText,
} from "lucide-react"

interface StaffProfileModalProps {
  isOpen: boolean
  onClose: () => void
  staffMember: any
  deviceId: number
  allStaffList?: any[]
  currency?: string
  onOwnershipChanged?: () => void
}

export function StaffProfileModal({
  isOpen,
  onClose,
  staffMember,
  deviceId,
  allStaffList = [],
  currency = "INR",
  onOwnershipChanged,
}: StaffProfileModalProps) {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [purchaseData, setPurchaseData] = useState<any>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [reassigningSaleId, setReassigningSaleId] = useState<number | null>(null)

  const loadStaffDetails = useCallback(async () => {
    if (!staffMember?.id || !deviceId) return
    setIsLoading(true)
    try {
      const res = await getStaffPurchaseDetails(staffMember.id, deviceId)
      if (res.success) {
        setPurchaseData(res.data)
      } else {
        notifyError(toast, res.message || "Failed to load staff sales history")
      }
    } catch (err: any) {
      notifyError(toast, "Error fetching staff profile details")
    } finally {
      setIsLoading(false)
    }
  }, [staffMember, deviceId, toast])

  useEffect(() => {
    if (isOpen && staffMember) {
      loadStaffDetails()
    }
  }, [isOpen, staffMember, loadStaffDetails])

  const handleReassign = async (saleId: number, targetStaffIdStr: string) => {
    try {
      setReassigningSaleId(saleId)
      const targetStaffId = targetStaffIdStr === "" ? null : Number(targetStaffIdStr)
      const res = await reassignSaleOwnership(saleId, deviceId, targetStaffId)
      if (res.success) {
        notifySuccess(toast, "Job card / sale ownership reassigned successfully!")
        await loadStaffDetails()
        if (onOwnershipChanged) onOwnershipChanged()
      } else {
        notifyError(toast, res.message || "Failed to reassign ownership")
      }
    } catch (err: any) {
      notifyError(toast, err.message || "Error reassigning ownership")
    } finally {
      setReassigningSaleId(null)
    }
  }

  const formatDate = (val: any) => {
    if (!val) return "-"
    if (val instanceof Date) return isNaN(val.getTime()) ? "-" : val.toLocaleDateString()
    if (typeof val === "string") {
      const d = new Date(val)
      return isNaN(d.getTime()) ? val.split("T")[0] : d.toLocaleDateString()
    }
    return String(val)
  }

  const formatCurr = (val: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 0,
    })
      .format(val)
      .replace(/^[a-zA-Z]+/, (match) => match + " ")
  }

  const salesList = purchaseData?.sales || []
  const filteredSales = salesList.filter((s: any) => {
    const q = searchTerm.toLowerCase().trim()
    if (!q) return true
    return (
      String(s.id).includes(q) ||
      (s.customer_name || "").toLowerCase().includes(q) ||
      (s.customer_phone || "").toLowerCase().includes(q) ||
      (s.payment_method || "").toLowerCase().includes(q)
    )
  })

  if (!staffMember) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden bg-slate-50">
        {/* Header Profile Section */}
        <DialogHeader className="p-6 bg-white border-b shrink-0">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-bold text-xl shadow-md">
                {(staffMember.name || "S").slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-xl font-extrabold text-slate-900">
                    {staffMember.name}
                  </DialogTitle>
                  <Badge
                    variant="outline"
                    className={
                      staffMember.role === "partner"
                        ? "border-purple-300 bg-purple-100 text-purple-800 font-semibold"
                        : staffMember.role === "admin"
                        ? "border-amber-300 bg-amber-100 text-amber-800 font-semibold"
                        : "border-blue-300 bg-blue-100 text-blue-800 font-semibold"
                    }
                  >
                    {staffMember.role === "partner"
                      ? "Partner"
                      : staffMember.role === "admin"
                      ? "Admin"
                      : "Staff"}
                  </Badge>
                  {staffMember.is_active ? (
                    <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-slate-200 text-slate-700">
                      Inactive
                    </Badge>
                  )}
                </div>
                <p className="text-sm font-medium text-slate-500 mt-1 flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5 text-slate-400" />
                    {staffMember.position || "Staff"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5 text-slate-400" />
                    {staffMember.phone || "-"}
                  </span>
                  {staffMember.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5 text-slate-400" />
                      {staffMember.email}
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-lg border text-xs text-slate-700">
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-semibold">Base Salary</p>
                <p className="font-bold text-slate-900">{formatCurr(Number(staffMember.salary || 0))}</p>
              </div>
              <div className="h-6 w-px bg-slate-300 mx-1" />
              <div>
                <p className="text-slate-400 text-[10px] uppercase font-semibold">Joined On</p>
                <p className="font-semibold text-slate-800">{formatDate(staffMember.joined_on)}</p>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Summary Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200 shadow-sm">
              <CardContent className="p-3.5">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                      Revenue Handled
                    </p>
                    <h4 className="text-lg font-black text-slate-900 mt-0.5">
                      {formatCurr(purchaseData?.totalSalesAmount || 0)}
                    </h4>
                  </div>
                  <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                    <TrendingUp className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200 shadow-sm">
              <CardContent className="p-3.5">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                      Total Orders / Jobcards
                    </p>
                    <h4 className="text-lg font-black text-slate-900 mt-0.5">
                      {purchaseData?.totalOrdersCount || 0}
                    </h4>
                  </div>
                  <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
                    <Package className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200 shadow-sm">
              <CardContent className="p-3.5">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                      Advance Balance
                    </p>
                    <h4 className="text-lg font-black text-slate-900 mt-0.5">
                      {formatCurr(purchaseData?.totalAdvanceBalance || 0)}
                    </h4>
                  </div>
                  <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
                    <Banknote className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200 shadow-sm">
              <CardContent className="p-3.5">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">
                      Credit Limit
                    </p>
                    <h4 className="text-lg font-black text-slate-900 mt-0.5">
                      {formatCurr(purchaseData?.totalCreditLimit || 0)}
                    </h4>
                  </div>
                  <div className="p-2 bg-purple-100 text-purple-700 rounded-lg">
                    <CreditCard className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Individual Sales Table & Reassignment Controls */}
          <Card className="border bg-white shadow-sm overflow-hidden">
            <div className="p-4 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50/50">
              <div>
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-600" />
                  Individual Sales & Job Cards List
                </h3>
                <p className="text-xs text-slate-500">
                  View and change job card / sale ownership to any staff member or admin
                </p>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search by Order # or Customer..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-8 text-xs bg-white"
                />
              </div>
            </div>

            <div className="overflow-x-auto min-h-[220px]">
              {isLoading ? (
                <div className="flex items-center justify-center py-16 text-slate-500">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600 mr-2" />
                  <span className="text-sm font-medium">Loading sales activity...</span>
                </div>
              ) : filteredSales.length === 0 ? (
                <div className="text-center py-16 text-slate-500 text-sm">
                  {searchTerm ? "No sales found matching search query." : "No sales or job cards handled by this staff member yet."}
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/70 border-b text-[11px] uppercase text-slate-600 font-bold">
                      <th className="p-3">Order / Job Card #</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Customer</th>
                      <th className="p-3">Total Amount</th>
                      <th className="p-3">Payment Method</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Assigned Owner</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredSales.map((sale: any) => (
                      <tr key={sale.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 font-bold text-blue-700">
                          #{sale.id}
                          {sale.sale_type === "job_card" && (
                            <Badge variant="outline" className="ml-1.5 text-[9px] border-indigo-200 text-indigo-700 bg-indigo-50">
                              Job Card
                            </Badge>
                          )}
                        </td>
                        <td className="p-3 text-slate-600 font-medium">{formatDate(sale.sale_date)}</td>
                        <td className="p-3">
                          <p className="font-semibold text-slate-900">{sale.customer_name || "Walk-in Customer"}</p>
                          {sale.customer_phone && <p className="text-[10px] text-slate-400">{sale.customer_phone}</p>}
                        </td>
                        <td className="p-3 font-bold text-slate-900">{formatCurr(Number(sale.total_amount || 0))}</td>
                        <td className="p-3 text-slate-700 font-medium">{sale.payment_method || "Cash"}</td>
                        <td className="p-3">
                          {sale.payment_status === "Paid" || sale.status === "Completed" ? (
                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 text-[10px]">
                              Paid
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-[10px]">
                              {sale.payment_status || sale.status || "Pending"}
                            </Badge>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {reassigningSaleId === sale.id && (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                            )}
                            <select
                              value={String(sale.staff_id || "")}
                              disabled={reassigningSaleId === sale.id}
                              onChange={(e) => handleReassign(sale.id, e.target.value)}
                              className="h-7 text-xs bg-white border border-slate-300 rounded px-2 font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-xs max-w-[160px]"
                            >
                              <option value="">Store / Admin</option>
                              {allStaffList.map((s: any) => (
                                <option key={s.id} value={String(s.id)}>
                                  {s.name} ({s.position || "Staff"})
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  )
}
