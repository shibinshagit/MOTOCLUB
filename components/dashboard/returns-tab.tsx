"use client"

import { useState, useEffect } from "react"
import { useSelector } from "react-redux"
import { selectDeviceCurrency, selectDeviceId } from "@/store/slices/deviceSlice"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  RotateCcw,
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  Package,
  Eye,
  RefreshCw,
  Trash2,
  Loader2,
} from "lucide-react"
import {
  getEcommerceReturnRequests,
  approveReturnRequest,
  rejectReturnRequest,
  deleteReturnRequest,
} from "@/app/actions/ecommerce-return-actions"
import ReturnDetailsModal from "./return-details-modal"
import { format } from "date-fns"
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

function safeParseItems(raw: any): any[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function safeFormatDate(rawDate: any, formatStr = "dd MMM yyyy, HH:mm"): string {
  if (!rawDate) return "N/A"
  try {
    const d = new Date(rawDate)
    if (isNaN(d.getTime())) return "N/A"
    return format(d, formatStr)
  } catch {
    return "N/A"
  }
}

export default function ReturnsTab() {
  const currency = useSelector(selectDeviceCurrency) || "QAR"
  const deviceId = useSelector(selectDeviceId) || 1
  const { toast } = useToast()

  const [returns, setReturns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("all")

  // Summary counts
  const [summary, setSummary] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
    received: 0,
    completed: 0,
    total: 0,
  })

  // Modal states
  const [selectedReturnId, setSelectedReturnId] = useState<number | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)

  // Quick Action states
  const [quickApproveId, setQuickApproveId] = useState<number | null>(null)
  const [quickApproveOrder, setQuickApproveOrder] = useState<string>("")
  const [quickRejectId, setQuickRejectId] = useState<number | null>(null)
  const [quickRejectionReason, setQuickRejectionReason] = useState("")
  const [quickRejectionError, setQuickRejectionError] = useState("")
  const [quickDeleteId, setQuickDeleteId] = useState<number | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    fetchReturnRequests()
  }, [statusFilter, dateFilter])

  const fetchReturnRequests = async (isRef = false) => {
    if (isRef) setRefreshing(true)
    else setLoading(true)

    const res = await getEcommerceReturnRequests({
      status: statusFilter,
      search: searchTerm,
      dateFilter: dateFilter,
    })

    if (res.success) {
      setReturns(res.data || [])
      setSummary(res.summary)
    } else {
      toast({
        title: "Error",
        description: res.message || "Failed to load return requests.",
        variant: "destructive",
      })
    }

    setLoading(false)
    setRefreshing(false)
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    fetchReturnRequests()
  }

  const handleQuickApprove = async () => {
    if (!quickApproveId) return
    setActionLoading(true)
    const res = await approveReturnRequest(quickApproveId, deviceId)
    setActionLoading(false)
    setQuickApproveId(null)

    if (res.success) {
      toast({ title: "Approved", description: res.message })
      fetchReturnRequests(true)
    } else {
      toast({ title: "Approval Failed", description: res.message, variant: "destructive" })
    }
  }

  const handleQuickReject = async () => {
    if (!quickRejectId) return
    if (!quickRejectionReason.trim()) {
      setQuickRejectionError("Rejection reason is required.")
      return
    }

    setActionLoading(true)
    const res = await rejectReturnRequest(quickRejectId, quickRejectionReason.trim(), deviceId)
    setActionLoading(false)
    setQuickRejectId(null)
    setQuickRejectionReason("")

    if (res.success) {
      toast({ title: "Rejected", description: res.message })
      fetchReturnRequests(true)
    } else {
      toast({ title: "Rejection Failed", description: res.message, variant: "destructive" })
    }
  }

  const handleQuickDelete = async () => {
    if (!quickDeleteId) return
    setActionLoading(true)
    const res = await deleteReturnRequest(quickDeleteId, deviceId)
    setActionLoading(false)
    setQuickDeleteId(null)

    if (res.success) {
      toast({ title: "Deleted", description: res.message })
      fetchReturnRequests(true)
    } else {
      toast({ title: "Delete Failed", description: res.message, variant: "destructive" })
    }
  }

  const renderStatusBadge = (status: string) => {
    const s = (status || "").toLowerCase()
    switch (s) {
      case "pending":
        return <Badge className="bg-amber-100 text-amber-800 border-amber-300 gap-1"><Clock className="w-3 h-3" /> Pending</Badge>
      case "approved":
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 gap-1"><CheckCircle2 className="w-3 h-3" /> Approved</Badge>
      case "rejected":
        return <Badge className="bg-rose-100 text-rose-800 border-rose-300 gap-1"><XCircle className="w-3 h-3" /> Rejected</Badge>
      case "received":
        return <Badge className="bg-blue-100 text-blue-800 border-blue-300 gap-1"><Package className="w-3 h-3" /> Received</Badge>
      case "completed":
        return <Badge className="bg-purple-100 text-purple-800 border-purple-300 gap-1"><CheckCircle2 className="w-3 h-3" /> Completed</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <RotateCcw className="w-6 h-6 text-indigo-600" />
            Ecommerce Return Requests
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Review, approve, reject, or manage customer return requests synced from Ecommerce.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchReturnRequests(true)}
          disabled={refreshing || loading}
          className="gap-2 border-gray-200 hover:bg-gray-50"
        >
          <RefreshCw className={`w-4 h-4 text-gray-600 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          onClick={() => setStatusFilter("pending")}
          className={`cursor-pointer transition-all hover:shadow-md border-l-4 ${
            statusFilter === "pending" ? "ring-2 ring-amber-400 border-l-amber-500" : "border-l-amber-500"
          }`}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Pending Review</p>
              <h3 className="text-2xl font-bold text-amber-700 mt-1">{summary.pending}</h3>
            </div>
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <Clock className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card
          onClick={() => setStatusFilter("approved")}
          className={`cursor-pointer transition-all hover:shadow-md border-l-4 ${
            statusFilter === "approved" ? "ring-2 ring-emerald-400 border-l-emerald-500" : "border-l-emerald-500"
          }`}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Approved Returns</p>
              <h3 className="text-2xl font-bold text-emerald-700 mt-1">{summary.approved}</h3>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card
          onClick={() => setStatusFilter("rejected")}
          className={`cursor-pointer transition-all hover:shadow-md border-l-4 ${
            statusFilter === "rejected" ? "ring-2 ring-rose-400 border-l-rose-500" : "border-l-rose-500"
          }`}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Rejected Returns</p>
              <h3 className="text-2xl font-bold text-rose-700 mt-1">{summary.rejected}</h3>
            </div>
            <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
              <XCircle className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card
          onClick={() => setStatusFilter("completed")}
          className={`cursor-pointer transition-all hover:shadow-md border-l-4 ${
            statusFilter === "completed" ? "ring-2 ring-purple-400 border-l-purple-500" : "border-l-purple-500"
          }`}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Completed Returns</p>
              <h3 className="text-2xl font-bold text-purple-700 mt-1">{summary.completed}</h3>
            </div>
            <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
              <Package className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Status Filter Buttons */}
        <div className="flex items-center gap-1 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
          {[
            { id: "all", label: "All Requests" },
            { id: "pending", label: "Pending" },
            { id: "approved", label: "Approved" },
            { id: "rejected", label: "Rejected" },
            { id: "received", label: "Received" },
            { id: "completed", label: "Completed" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                statusFilter === tab.id
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & Date Filter Inputs */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as any)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Dates</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>

          <form onSubmit={handleSearchSubmit} className="relative flex-1 md:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              type="text"
              placeholder="Search Return ID, Order #, Customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 text-xs py-2"
            />
          </form>
        </div>
      </div>

      {/* Main Returns Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-500 flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-2" />
            <p className="text-sm font-medium">Loading return requests...</p>
          </div>
        ) : returns.length === 0 ? (
          <div className="py-16 text-center text-gray-500 flex flex-col items-center justify-center">
            <RotateCcw className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-base font-semibold text-gray-800">No Return Requests Found</p>
            <p className="text-xs text-gray-500 mt-1 max-w-sm">
              {statusFilter !== "all" || searchTerm
                ? "Try clearing filters or search query."
                : "Ecommerce customer return requests will automatically appear here."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-gray-700 font-semibold border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">Return ID</th>
                  <th className="py-3 px-4">Ecommerce Order</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Returned Product(s)</th>
                  <th className="py-3 px-4">Reason</th>
                  <th className="py-3 px-4">Requested Date</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {returns.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-gray-900">
                      #{req.ecommerce_return_request_id}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-indigo-600">{req.ecommerce_order_id}</div>
                      {req.sale_id && (
                        <div className="text-[10px] text-gray-400">Sale #{req.sale_id}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-gray-900">{req.customer_name || "Guest Customer"}</div>
                      {req.customer_phone && (
                        <div className="text-[11px] text-gray-500">{req.customer_phone}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {(() => {
                        const parsedItems = safeParseItems(req.items)
                        return parsedItems.length > 0 ? (
                          <div className="space-y-0.5">
                            {parsedItems.map((item: any, idx: number) => (
                              <div key={idx} className="font-medium text-gray-800">
                                {item.productName || `Product #${item.productId}`}
                                <span className="ml-1.5 px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-bold text-[10px]">
                                  × {item.quantity}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">No item data</span>
                        )
                      })()}
                    </td>
                    <td className="py-3.5 px-4 text-gray-600 max-w-xs truncate">
                      {req.reason || "N/A"}
                    </td>
                    <td className="py-3.5 px-4 text-gray-500 whitespace-nowrap">
                      {safeFormatDate(req.requested_at || req.created_at, "dd MMM yyyy, HH:mm")}
                    </td>
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      {renderStatusBadge(req.status)}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedReturnId(req.id)
                            setIsDetailsOpen(true)
                          }}
                          className="h-8 px-2 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          View
                        </Button>

                        {req.status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => {
                                setQuickApproveId(req.id)
                                setQuickApproveOrder(req.ecommerce_order_id)
                              }}
                              className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              Approve
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                setQuickRejectId(req.id)
                                setQuickRejectionReason("")
                                setQuickRejectionError("")
                              }}
                              className="h-8 px-2.5 bg-rose-600 hover:bg-rose-700"
                            >
                              <XCircle className="w-3.5 h-3.5 mr-1" />
                              Reject
                            </Button>
                          </>
                        )}

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setQuickDeleteId(req.id)}
                          className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                          title="Delete Return Request"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Return Request Details Modal */}
      <ReturnDetailsModal
        returnId={selectedReturnId}
        isOpen={isDetailsOpen}
        onClose={() => {
          setIsDetailsOpen(false)
          setSelectedReturnId(null)
        }}
        onSuccess={() => fetchReturnRequests(true)}
        currency={currency}
        deviceId={deviceId}
      />

      {/* Quick Approve Confirmation */}
      <AlertDialog open={!!quickApproveId} onOpenChange={(open) => !open && setQuickApproveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="w-5 h-5" />
              Approve Return Request?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-gray-600 mt-2">
              Are you sure you want to approve this return request for Order #{quickApproveOrder}?
              <br />
              <br />
              <strong className="text-gray-800">Note:</strong> Approval indicates Accounting has accepted the customer&apos;s return request. Original sales and inventory records will remain unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleQuickApprove}
              disabled={actionLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Approve Return
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Quick Delete Confirmation */}
      <AlertDialog open={!!quickDeleteId} onOpenChange={(open) => !open && setQuickDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-rose-700">
              <Trash2 className="w-5 h-5" />
              Delete Return Request?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-gray-600 mt-2">
              Are you sure you want to permanently delete this return request?
              <br />
              <br />
              <strong className="text-rose-700">Warning:</strong> This action cannot be undone. All returned items and audit logs for this request will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleQuickDelete}
              disabled={actionLoading}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Delete Return Request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Quick Reject Modal */}
      <Dialog open={!!quickRejectId} onOpenChange={(open) => !open && setQuickRejectId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700">
              <XCircle className="w-5 h-5" />
              Reject Return Request
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              A rejection reason is required before rejecting this return request.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label htmlFor="quick_rejection_reason" className="text-xs font-semibold text-gray-700">
              Rejection Reason <span className="text-rose-500">*</span>
            </Label>
            <Textarea
              id="quick_rejection_reason"
              rows={4}
              placeholder="Enter reason for rejection..."
              value={quickRejectionReason}
              onChange={(e) => {
                setQuickRejectionReason(e.target.value)
                if (e.target.value.trim()) setQuickRejectionError("")
              }}
              className="text-xs"
            />
            {quickRejectionError && (
              <p className="text-xs font-medium text-rose-600">{quickRejectionError}</p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setQuickRejectId(null)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleQuickReject}
              disabled={actionLoading}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Reject Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
