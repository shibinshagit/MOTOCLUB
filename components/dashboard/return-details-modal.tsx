"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
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
import {
  getEcommerceReturnRequestById,
  approveReturnRequest,
  rejectReturnRequest,
  updateReturnRequestStatus,
  deleteReturnRequest,
} from "@/app/actions/ecommerce-return-actions"
import { useToast } from "@/components/ui/use-toast"
import {
  Package,
  User,
  Phone,
  Mail,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  RotateCcw,
  History,
  Info,
  Camera,
  Trash2,
  Maximize2,
  X,
} from "lucide-react"
import { format } from "date-fns"

interface ReturnDetailsModalProps {
  returnId: number | null
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  currency?: string
  deviceId?: number
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

function getProductImage(rawImages: any): string | null {
  if (!rawImages) return null
  if (Array.isArray(rawImages) && rawImages.length > 0) {
    return rawImages[0]
  }
  if (typeof rawImages === "string") {
    try {
      const parsed = JSON.parse(rawImages)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed[0]
      if (rawImages.startsWith("http")) return rawImages
    } catch {
      if (rawImages.startsWith("http")) return rawImages
    }
  }
  return null
}

export default function ReturnDetailsModal({
  returnId,
  isOpen,
  onClose,
  onSuccess,
  currency = "QAR",
  deviceId = 1,
}: ReturnDetailsModalProps) {
  const { toast } = useToast()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  // Dialog & Lightbox states
  const [showApproveConfirm, setShowApproveConfirm] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState("")
  const [rejectionError, setRejectionError] = useState("")

  useEffect(() => {
    if (isOpen && returnId) {
      fetchReturnDetails(returnId)
    } else {
      setData(null)
      setShowApproveConfirm(false)
      setShowRejectModal(false)
      setShowDeleteConfirm(false)
      setPreviewImage(null)
      setRejectionReason("")
      setRejectionError("")
    }
  }, [isOpen, returnId])

  const fetchReturnDetails = async (id: number) => {
    setLoading(true)
    const res = await getEcommerceReturnRequestById(id)
    if (res.success && res.data) {
      // Parse images if stringified JSON
      let proofImages: string[] = []
      if (Array.isArray(res.data.images)) {
        proofImages = res.data.images
      } else if (typeof res.data.images === "string") {
        try {
          proofImages = JSON.parse(res.data.images)
        } catch {
          if (res.data.images) proofImages = [res.data.images]
        }
      }
      setData({ ...res.data, parsedImages: proofImages })
    } else {
      toast({
        title: "Error",
        description: res.message || "Failed to load return details.",
        variant: "destructive",
      })
    }
    setLoading(false)
  }

  const handleApprove = async () => {
    if (!returnId) return
    setActionLoading(true)
    const res = await approveReturnRequest(returnId, deviceId)
    setActionLoading(false)
    setShowApproveConfirm(false)

    if (res.success) {
      toast({
        title: "Return Approved",
        description: res.message,
      })
      if (onSuccess) onSuccess()
      fetchReturnDetails(returnId)
    } else {
      toast({
        title: "Approval Failed",
        description: res.message,
        variant: "destructive",
      })
    }
  }

  const handleReject = async () => {
    if (!returnId) return
    if (!rejectionReason.trim()) {
      setRejectionError("Rejection reason is required.")
      return
    }

    setActionLoading(true)
    const res = await rejectReturnRequest(returnId, rejectionReason.trim(), deviceId)
    setActionLoading(false)

    if (res.success) {
      toast({
        title: "Return Rejected",
        description: res.message,
      })
      setShowRejectModal(false)
      if (onSuccess) onSuccess()
      fetchReturnDetails(returnId)
    } else {
      toast({
        title: "Rejection Failed",
        description: res.message,
        variant: "destructive",
      })
    }
  }

  const handleDelete = async () => {
    if (!returnId) return
    setActionLoading(true)
    const res = await deleteReturnRequest(returnId, deviceId)
    setActionLoading(false)
    setShowDeleteConfirm(false)

    if (res.success) {
      toast({
        title: "Return Request Deleted",
        description: res.message,
      })
      if (onSuccess) onSuccess()
      onClose()
    } else {
      toast({
        title: "Delete Failed",
        description: res.message,
        variant: "destructive",
      })
    }
  }

  const handleStatusUpdate = async (newStatus: "received" | "completed") => {
    if (!returnId) return
    setActionLoading(true)
    const res = await updateReturnRequestStatus(returnId, newStatus, undefined, deviceId)
    setActionLoading(false)

    if (res.success) {
      toast({
        title: `Status Updated to ${newStatus}`,
        description: res.message,
      })
      if (onSuccess) onSuccess()
      fetchReturnDetails(returnId)
    } else {
      toast({
        title: "Update Failed",
        description: res.message,
        variant: "destructive",
      })
    }
  }

  const renderStatusBadge = (status: string) => {
    const s = (status || "").toLowerCase()
    switch (s) {
      case "pending":
        return <Badge className="bg-amber-100 text-amber-800 border-amber-300 gap-1"><Clock className="w-3 h-3" /> Pending Review</Badge>
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
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <DialogTitle className="text-xl font-bold flex items-center gap-2 text-gray-900">
                  <RotateCcw className="w-5 h-5 text-indigo-600" />
                  Return Request #{data?.ecommerce_return_request_id || (returnId ? `RET-${returnId}` : "")}
                </DialogTitle>
                <DialogDescription className="text-xs text-gray-500 mt-1">
                  Ecommerce Order #{data?.ecommerce_order_id || "N/A"}
                </DialogDescription>
              </div>
              <div>{data && renderStatusBadge(data.status)}</div>
            </div>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              <span className="ml-2 text-sm text-gray-500">Loading details...</span>
            </div>
          ) : data ? (
            <div className="space-y-6 text-sm">
              {/* Customer & Order Summary Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Customer Information */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                    <User className="w-4 h-4 text-indigo-600" />
                    Customer Details
                  </h4>
                  <div className="space-y-1 text-xs text-gray-700">
                    <div className="font-medium text-sm text-gray-900">{data.customer_name || "Guest Customer"}</div>
                    {data.customer_phone && (
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <Phone className="w-3.5 h-3.5 text-gray-400" />
                        <span>{data.customer_phone}</span>
                      </div>
                    )}
                    {data.customer_email && (
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <Mail className="w-3.5 h-3.5 text-gray-400" />
                        <span>{data.customer_email}</span>
                      </div>
                    )}
                    {data.customer_address && (
                      <div className="text-gray-500 pt-1 text-[11px] leading-snug">
                        {data.customer_address}
                      </div>
                    )}
                  </div>
                </div>

                {/* Order Information */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                    <Package className="w-4 h-4 text-indigo-600" />
                    Order Info
                  </h4>
                  <div className="space-y-1.5 text-xs text-gray-700">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Order Number:</span>
                      <span className="font-mono font-medium">{data.ecommerce_order_id}</span>
                    </div>
                    {data.sale_id && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Accounting Sale ID:</span>
                        <span className="font-semibold text-indigo-600">#{data.sale_id}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-500">Requested Date:</span>
                      <span>
                        {safeFormatDate(data.requested_at, "dd MMM yyyy, HH:mm")}
                      </span>
                    </div>
                    {data.sale_date && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Order Date:</span>
                        <span>{safeFormatDate(data.sale_date, "dd MMM yyyy")}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-500">Delivery Status:</span>
                      <span className="font-medium text-gray-800">{data.sale_delivery_status || "Delivered"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Payment Status:</span>
                      <span className="font-medium text-emerald-700">{data.sale_payment_status || "Paid"}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Returned Items Table */}
              <div className="space-y-2">
                <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-indigo-600" />
                  Returned Products
                </h4>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-gray-700 font-semibold">
                      <tr>
                        <th className="py-2.5 px-3">Product Name</th>
                        <th className="py-2.5 px-3 text-center">Returned Qty</th>
                        <th className="py-2.5 px-3 text-right">Original Unit Price</th>
                        <th className="py-2.5 px-3">Item Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {data.items && data.items.length > 0 ? (
                        data.items.map((item: any, idx: number) => {
                          const imgUrl = getProductImage(item.product_images)
                          return (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3 font-medium text-gray-900 flex items-center gap-2.5">
                                {imgUrl ? (
                                  <img
                                    src={imgUrl}
                                    alt={item.product_name || "Product"}
                                    className="w-9 h-9 rounded-md border border-gray-200 object-cover shrink-0 cursor-pointer"
                                    onClick={() => setPreviewImage(imgUrl)}
                                  />
                                ) : (
                                  <div className="w-9 h-9 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                                    <Package className="w-4 h-4 text-gray-400" />
                                  </div>
                                )}
                                <div>
                                  <div>{item.product_name || `Product #${item.product_id}`}</div>
                                  {item.variant_name && (
                                    <span className="block text-[11px] text-gray-500 font-normal">
                                      Variant: {item.variant_name}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-center font-bold text-gray-800">
                                {item.quantity}
                              </td>
                              <td className="py-2.5 px-3 text-right text-gray-700">
                                {currency} {Number(item.original_unit_price || 0).toFixed(2)}
                              </td>
                              <td className="py-2.5 px-3 text-gray-600 italic">
                                {item.reason || data.reason || "N/A"}
                              </td>
                            </tr>
                          )
                        })
                      ) : (
                        <tr>
                          <td colSpan={4} className="py-4 text-center text-gray-500">
                            No return items attached.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Proof Images Section (Uploaded by Ecommerce Customer) */}
              {data.parsedImages && data.parsedImages.length > 0 && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                    <Camera className="w-4 h-4 text-indigo-600" />
                    Customer Proof Images ({data.parsedImages.length})
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {data.parsedImages.map((imgUrl: string, idx: number) => (
                      <div
                        key={idx}
                        onClick={() => setPreviewImage(imgUrl)}
                        className="group relative aspect-square rounded-lg border border-gray-200 overflow-hidden bg-white cursor-pointer shadow-xs hover:shadow-md transition-all"
                      >
                        <img
                          src={imgUrl}
                          alt={`Customer proof image ${idx + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-semibold">
                          <Maximize2 className="w-4 h-4 mr-1" /> View Full
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Return Reason & Customer Notes */}
              <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200/80 space-y-2">
                <div className="font-semibold text-amber-900 flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-amber-600" />
                  Return Reason & Customer Notes
                </div>
                <div className="text-xs text-amber-800 space-y-1">
                  <div>
                    <span className="font-medium text-amber-900">Reason:</span>{" "}
                    {data.reason || "No reason specified"}
                  </div>
                  {data.notes && (
                    <div>
                      <span className="font-medium text-amber-900">Notes:</span> {data.notes}
                    </div>
                  )}
                  {data.rejection_reason && (
                    <div className="pt-2 text-rose-800 border-t border-rose-200/80 font-medium">
                      <span className="font-bold text-rose-900">Rejection Reason:</span> {data.rejection_reason}
                    </div>
                  )}
                </div>
              </div>

              {/* Audit Trail Timeline */}
              {data.auditLogs && data.auditLogs.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                    <History className="w-4 h-4 text-indigo-600" />
                    Audit Trail & History
                  </h4>
                  <div className="border border-gray-200 rounded-lg p-3 bg-white space-y-3">
                    {data.auditLogs.map((log: any, idx: number) => (
                      <div key={idx} className="flex items-start gap-2.5 text-xs">
                        <div className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-gray-800">
                              Status changed to <span className="uppercase text-indigo-600">{log.new_status}</span>
                            </span>
                            <span className="text-[11px] text-gray-400">
                              {safeFormatDate(log.created_at, "dd MMM yyyy, HH:mm")}
                            </span>
                          </div>
                          {log.staff_name && (
                            <div className="text-[11px] text-gray-500">By: {log.staff_name}</div>
                          )}
                          {log.rejection_reason && (
                            <div className="text-[11px] text-rose-600 font-medium mt-0.5">
                              Reason: {log.rejection_reason}
                            </div>
                          )}
                          {log.notes && (
                            <div className="text-[11px] text-gray-600 italic mt-0.5">{log.notes}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onClose} disabled={actionLoading}>
                Close
              </Button>
              {data && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={actionLoading}
                  className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                  title="Delete return request"
                >
                  <Trash2 className="w-4 h-4 mr-1.5" />
                  Delete Request
                </Button>
              )}
            </div>

            {data && (
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                {data.status === "pending" && (
                  <>
                    <Button
                      variant="destructive"
                      onClick={() => setShowRejectModal(true)}
                      disabled={actionLoading}
                      className="bg-rose-600 hover:bg-rose-700"
                    >
                      <XCircle className="w-4 h-4 mr-1.5" />
                      Reject Return
                    </Button>
                    <Button
                      onClick={() => setShowApproveConfirm(true)}
                      disabled={actionLoading}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1.5" />
                      Approve Return
                    </Button>
                  </>
                )}

                {data.status === "approved" && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => handleStatusUpdate("received")}
                      disabled={actionLoading}
                      className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                    >
                      <Package className="w-4 h-4 mr-1.5" />
                      Mark Received
                    </Button>
                    <Button
                      onClick={() => handleStatusUpdate("completed")}
                      disabled={actionLoading}
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1.5" />
                      Mark Completed
                    </Button>
                  </>
                )}

                {data.status === "received" && (
                  <Button
                    onClick={() => handleStatusUpdate("completed")}
                    disabled={actionLoading}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    Mark Completed
                  </Button>
                )}
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Proof Image Preview Lightbox */}
      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-4xl p-2 bg-black/95 border-gray-800">
          <div className="relative flex items-center justify-center min-h-[400px]">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/90 transition-colors z-10"
            >
              <X className="w-5 h-5" />
            </button>
            {previewImage && (
              <img
                src={previewImage}
                alt="Proof Preview"
                className="max-h-[80vh] w-auto max-w-full object-contain rounded"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Approval Confirmation Dialog */}
      <AlertDialog open={showApproveConfirm} onOpenChange={setShowApproveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="w-5 h-5" />
              Approve Return Request?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-gray-600 mt-2">
              Are you sure you want to approve this return request for Order #{data?.ecommerce_order_id}?
              <br />
              <br />
              <strong className="text-gray-800">Note:</strong> This marks the return request as officially approved by Accounting and notifies Ecommerce. Original sales and inventory records will remain untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApprove}
              disabled={actionLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Approve Return
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-rose-700">
              <Trash2 className="w-5 h-5" />
              Delete Return Request?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-gray-600 mt-2">
              Are you sure you want to permanently delete return request #{data?.ecommerce_return_request_id}?
              <br />
              <br />
              <strong className="text-rose-700">Warning:</strong> This action cannot be undone. All returned items and audit logs for this request will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={actionLoading}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Delete Return Request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rejection Modal (Reason Required) */}
      <Dialog open={showRejectModal} onOpenChange={setShowRejectModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700">
              <XCircle className="w-5 h-5" />
              Reject Return Request
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Please specify a reason for rejecting this return request. The rejection reason will be recorded and sent to Ecommerce.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label htmlFor="rejection_reason" className="text-xs font-semibold text-gray-700">
              Rejection Reason <span className="text-rose-500">*</span>
            </Label>
            <Textarea
              id="rejection_reason"
              rows={4}
              placeholder="Enter reason for rejection (e.g. Item returned past 30-day window, missing original tags...)"
              value={rejectionReason}
              onChange={(e) => {
                setRejectionReason(e.target.value)
                if (e.target.value.trim()) setRejectionError("")
              }}
              className="text-xs"
            />
            {rejectionError && (
              <p className="text-xs font-medium text-rose-600">{rejectionError}</p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowRejectModal(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={actionLoading}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Reject Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
