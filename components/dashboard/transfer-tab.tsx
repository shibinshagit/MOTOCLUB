"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowRightLeft, Check, ChevronDown, Eye, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess, notifyWarning } from "@/lib/notifications"
import { markInventoryStale } from "@/lib/inventory-sync"
import { useConfirm } from "@/hooks/use-confirm"
import { useDispatch } from "react-redux"
import type { AppDispatch } from "@/store/store"
import {
  acceptWarehouseTransfer,
  cancelWarehouseTransfer,
  createWarehouseTransfer,
  getTransferFormData,
  getWarehouseTransferById,
  getWarehouseTransfers,
  rejectWarehouseTransfer,
  updateWarehouseTransfer,
} from "@/app/actions/transfer-actions"

interface TransferTabProps {
  userId: number
}

type TransferItemForm = {
  product_id: number
  quantity: number
  unit_cost: number
}

type TransferFormData = {
  fromDeviceId: number
  toDeviceId: number
  transferDate: string
  paymentStatus: "unpaid" | "partial" | "paid"
  paymentMethod: string
  paidAmount: number
  paymentNotes: string
  notes: string
  items: TransferItemForm[]
}

export default function TransferTab({ userId }: TransferTabProps) {
  const dispatch = useDispatch<AppDispatch>()
  const getTodayDate = () => new Date().toISOString().slice(0, 10)
  const toDateInputValue = (value: unknown): string => {
    if (!value) return ""
    const raw = String(value)
    const isoMatch = raw.match(/^\d{4}-\d{2}-\d{2}/)
    if (isoMatch) return isoMatch[0]
    const parsed = new Date(raw)
    if (!Number.isNaN(parsed.getTime())) {
      const year = parsed.getFullYear()
      const month = String(parsed.getMonth() + 1).padStart(2, "0")
      const day = String(parsed.getDate()).padStart(2, "0")
      return `${year}-${month}-${day}`
    }
    return ""
  }
  const { toast } = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [transfers, setTransfers] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isPreparingModal, setIsPreparingModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "completed" | "rejected" | "cancelled">("all")
  const [rejectTransferId, setRejectTransferId] = useState<number | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [isRejecting, setIsRejecting] = useState(false)
  const [actioningId, setActioningId] = useState<number | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [isViewLoading, setIsViewLoading] = useState(false)
  const [viewTransferDetail, setViewTransferDetail] = useState<any | null>(null)
  const [editingTransferId, setEditingTransferId] = useState<number | null>(null)
  const [editOriginal, setEditOriginal] = useState<{
    fromDeviceId: number
    toDeviceId: number
    qtyByProduct: Map<number, number>
  } | null>(null)
  const [formData, setFormData] = useState<TransferFormData>({
    fromDeviceId: userId || 0,
    toDeviceId: 0,
    transferDate: getTodayDate(),
    paymentStatus: "unpaid",
    paymentMethod: "",
    paidAmount: 0,
    paymentNotes: "",
    notes: "",
    items: [{ product_id: 0, quantity: 1, unit_cost: 0 }],
  })

  const [devices, setDevices] = useState<Array<{ id: number; name: string }>>([])
  const [products, setProducts] = useState<
    Array<{ id: number; name: string; barcode: string; source_stock: number; default_unit_cost: number }>
  >([])
  const [rowProductSearch, setRowProductSearch] = useState<string[]>([""])
  const [rowProductOpen, setRowProductOpen] = useState<boolean[]>([false])
  const [rowWarnings, setRowWarnings] = useState<Record<number, string>>({})

  const selectedSourceStockMap = useMemo(() => {
    return new Map(products.map((p) => [p.id, p.source_stock]))
  }, [products])

  // When editing, the stock this transfer already moved out of the source is
  // reversible, so it must be added back to the "available" pool. Otherwise a
  // transfer that fully emptied the source can never be saved again (even when
  // only changing payment details), because the source now shows 0 stock.
  const effectiveSourceStockMap = useMemo(() => {
    const map = new Map(selectedSourceStockMap)
    if (editOriginal && editOriginal.fromDeviceId === formData.fromDeviceId) {
      for (const [productId, qty] of editOriginal.qtyByProduct.entries()) {
        map.set(productId, Number(map.get(productId) || 0) + Number(qty || 0))
      }
    }
    return map
  }, [selectedSourceStockMap, editOriginal, formData.fromDeviceId])

  const transferTotalAmount = useMemo(() => {
    return Number(
      formData.items
        .filter((i) => i.product_id > 0 && i.quantity > 0)
        .reduce((sum, i) => sum + Number(i.quantity || 0) * Number(i.unit_cost || 0), 0)
        .toFixed(2),
    )
  }, [formData.items])

  const loadTransfers = useCallback(async () => {
    if (!userId) return
    try {
      setIsLoading(true)
      const result = await getWarehouseTransfers(userId, searchTerm, statusFilter)
      if (result.success) {
        setTransfers((result.data || []) as any[])
      } else {
        notifyError(toast, result.message || "Failed to load transfers")
      }
    } catch (error) {
      console.error("Load transfers error:", error)
      notifyError(toast, "Failed to load transfers")
    } finally {
      setIsLoading(false)
    }
  }, [userId, searchTerm, statusFilter, toast])

  const loadFormData = useCallback(
    async (fromDeviceId: number) => {
      const result = await getTransferFormData(userId, fromDeviceId || userId)
      if (result.success) {
        setDevices(result.data.devices || [])
        setProducts(result.data.products || [])
      } else {
        notifyError(toast, result.message || "Failed to load transfer form data")
      }
    },
    [userId, toast],
  )

  useEffect(() => {
    loadTransfers()
  }, [loadTransfers])

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadTransfers()
    }, 300)
    return () => clearTimeout(timeout)
  }, [searchTerm, statusFilter, loadTransfers])

  const resetForm = () => {
    setEditingTransferId(null)
    setEditOriginal(null)
    setRowProductSearch([""])
    setRowProductOpen([false])
    setRowWarnings({})
    setFormData({
      fromDeviceId: userId || devices[0]?.id || 0,
      toDeviceId: 0,
      transferDate: getTodayDate(),
      paymentStatus: "unpaid",
      paymentMethod: "",
      paidAmount: 0,
      paymentNotes: "",
      notes: "",
      items: [{ product_id: 0, quantity: 1, unit_cost: 0 }],
    })
  }

  const handleOpenCreate = async () => {
    resetForm()
    const sourceId = userId || 0
    setIsModalOpen(true)
    setIsPreparingModal(true)
    try {
      await loadFormData(sourceId)
      setFormData((prev) => ({ ...prev, fromDeviceId: sourceId }))
    } finally {
      setIsPreparingModal(false)
    }
  }

  const handleOpenEdit = async (transferId: number) => {
    try {
      setIsLoading(true)
      const detail = await getWarehouseTransferById(transferId, userId)
      if (!detail.success || !detail.data) {
        notifyError(toast, detail.message || "Failed to load transfer details")
        return
      }

      const transfer = detail.data.transfer
      setIsModalOpen(true)
      setIsPreparingModal(true)
      await loadFormData(Number(transfer.from_device_id))

      setEditingTransferId(transferId)
      const originalQtyByProduct = new Map<number, number>()
      for (const item of detail.data.items) {
        const pid = Number(item.product_id)
        originalQtyByProduct.set(pid, (originalQtyByProduct.get(pid) || 0) + Number(item.quantity || 0))
      }
      setEditOriginal({
        fromDeviceId: Number(transfer.from_device_id),
        toDeviceId: Number(transfer.to_device_id),
        qtyByProduct: originalQtyByProduct,
      })
      const rowCount = detail.data.items.length > 0 ? detail.data.items.length : 1
      setRowProductSearch(Array(rowCount).fill(""))
      setRowProductOpen(Array(rowCount).fill(false))
      setRowWarnings({})
      setFormData({
        fromDeviceId: Number(transfer.from_device_id),
        toDeviceId: Number(transfer.to_device_id),
        transferDate: toDateInputValue(transfer.transfer_date || transfer.created_at) || getTodayDate(),
        paymentStatus: (String(transfer.payment_status || "unpaid").toLowerCase() as "unpaid" | "partial" | "paid"),
        paymentMethod: String(transfer.payment_method || ""),
        paidAmount: Number(transfer.paid_amount || 0),
        paymentNotes: String(transfer.payment_notes || ""),
        notes: transfer.notes || "",
        items:
          detail.data.items.length > 0
            ? detail.data.items.map((item: any) => ({
                product_id: Number(item.product_id),
                quantity: Number(item.quantity),
                unit_cost: Number(item.unit_cost || 0),
              }))
            : [{ product_id: 0, quantity: 1, unit_cost: 0 }],
      })

    } finally {
      setIsPreparingModal(false)
      setIsLoading(false)
    }
  }

  const handleOpenView = async (transferId: number) => {
    try {
      setIsViewLoading(true)
      setViewTransferDetail(null)
      const detail = await getWarehouseTransferById(transferId, userId)
      if (!detail.success || !detail.data) {
        notifyError(toast, detail.message || "Failed to load transfer details")
        return
      }
      setViewTransferDetail(detail.data)
      setIsViewModalOpen(true)
    } finally {
      setIsViewLoading(false)
    }
  }

  const handleCancelTransfer = async (transferId: number) => {
    if (!(await confirm("Cancel this transfer? Stocks will be moved back automatically."))) return
    const result = await cancelWarehouseTransfer(transferId, userId)
    if (!result.success) {
      notifyError(toast, result.message || "Failed to cancel transfer")
      return
    }
    markInventoryStale(dispatch)
    notifySuccess(toast, result.message || "Transfer cancelled" )
    await loadTransfers()
  }

  const handleAcceptTransfer = async (transferId: number) => {
    if (!(await confirm("Accept this transfer request? Stock will be moved now."))) return
    try {
      setActioningId(transferId)
      const result = await acceptWarehouseTransfer(transferId, userId)
      if (!result.success) {
        notifyError(toast, result.message || "Failed to accept request")
        return
      }
      markInventoryStale(dispatch)
      notifySuccess(toast, result.message || "Transfer request accepted" , "Accepted")
      await loadTransfers()
    } finally {
      setActioningId(null)
    }
  }

  const openRejectDialog = (transferId: number) => {
    setRejectTransferId(transferId)
    setRejectReason("")
  }

  const handleConfirmReject = async () => {
    if (rejectTransferId == null) return
    if (!rejectReason.trim()) {
      notifyWarning(toast, "Please provide a reason for rejection", "Validation")
      return
    }
    try {
      setIsRejecting(true)
      const result = await rejectWarehouseTransfer(rejectTransferId, userId, rejectReason.trim())
      if (!result.success) {
        notifyError(toast, result.message || "Failed to reject request")
        return
      }
      markInventoryStale(dispatch)
      notifySuccess(toast, result.message || "Transfer request rejected" , "Rejected")
      setRejectTransferId(null)
      setRejectReason("")
      await loadTransfers()
    } finally {
      setIsRejecting(false)
    }
  }

  const setItem = (index: number, patch: Partial<TransferItemForm>) => {
    setFormData((prev) => {
      const items = [...prev.items]
      items[index] = { ...items[index], ...patch }
      const sourceStock = Number(effectiveSourceStockMap.get(items[index].product_id) || 0)
      if (items[index].quantity > sourceStock) {
        items[index].quantity = sourceStock > 0 ? sourceStock : 1
        setRowWarnings((prevWarnings) => ({
          ...prevWarnings,
          [index]:
            sourceStock > 0
              ? `Max available stock is ${sourceStock}`
              : "No stock available in selected source warehouse",
        }))
      } else {
        setRowWarnings((prevWarnings) => {
          const next = { ...prevWarnings }
          delete next[index]
          return next
        })
      }
      return { ...prev, items }
    })
  }

  const setProductSearchTerm = (index: number, value: string) => {
    setRowProductSearch((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  const setProductOpen = (index: number, isOpen: boolean) => {
    setRowProductOpen((prev) => {
      const next = [...prev]
      next[index] = isOpen
      return next
    })
  }

  const addItemRow = () => {
    setFormData((prev) => ({ ...prev, items: [...prev.items, { product_id: 0, quantity: 1, unit_cost: 0 }] }))
    setRowProductSearch((prev) => [...prev, ""])
    setRowProductOpen((prev) => [...prev, false])
  }

  const removeItemRow = (index: number) => {
    setFormData((prev) => {
      const items = prev.items.filter((_, i) => i !== index)
      return { ...prev, items: items.length > 0 ? items : [{ product_id: 0, quantity: 1, unit_cost: 0 }] }
    })
    setRowProductSearch((prev) => {
      const terms = prev.filter((_, i) => i !== index)
      return terms.length > 0 ? terms : [""]
    })
    setRowProductOpen((prev) => {
      const open = prev.filter((_, i) => i !== index)
      return open.length > 0 ? open : [false]
    })
    setRowWarnings((prev) => {
      const next: Record<number, string> = {}
      Object.entries(prev).forEach(([key, value]) => {
        const idx = Number(key)
        if (idx < index) next[idx] = value
        if (idx > index) next[idx - 1] = value
      })
      return next
    })
  }

  const handleSourceChange = async (fromDeviceId: number) => {
    setFormData((prev) => ({ ...prev, fromDeviceId }))
    setRowWarnings({})
    await loadFormData(fromDeviceId)
  }

  const handleSave = async () => {
    const validItems = formData.items.filter((i) => i.product_id > 0 && i.quantity > 0)
    if (!formData.fromDeviceId || !formData.toDeviceId) {
      notifyWarning(toast, "Please select source and destination warehouses", "Validation")
      return
    }
    if (formData.fromDeviceId === formData.toDeviceId) {
      notifyWarning(toast, "Source and destination must be different", "Validation")
      return
    }
    if (validItems.length === 0) {
      notifyWarning(toast, "Add at least one valid product row", "Validation")
      return
    }
    if (!Number.isFinite(formData.paidAmount) || Number(formData.paidAmount) < 0) {
      notifyWarning(toast, "Paid amount must be a non-negative number", "Validation")
      return
    }
    if (Number(formData.paidAmount) > transferTotalAmount) {
      notifyWarning(toast, "Paid amount cannot exceed transfer amount", "Validation")
      return
    }

    const requestedByProduct = new Map<number, number>()
    for (const item of validItems) {
      requestedByProduct.set(item.product_id, (requestedByProduct.get(item.product_id) || 0) + Number(item.quantity))
    }
    for (const [productId, totalRequested] of requestedByProduct.entries()) {
      const available = Number(effectiveSourceStockMap.get(productId) || 0)
      if (totalRequested > available) {
        const productName = products.find((p) => p.id === productId)?.name || `Product #${productId}`
        notifyWarning(toast, `${productName}: requested ${totalRequested}, available ${available}`, "Validation")
        return
      }
    }

    const payload = new FormData()
    payload.append("user_id", String(userId))
    payload.append("from_device_id", String(formData.fromDeviceId))
    payload.append("to_device_id", String(formData.toDeviceId))
    payload.append("transfer_date", String(formData.transferDate || ""))
    payload.append("payment_status", String(formData.paymentStatus))
    payload.append("payment_method", String(formData.paymentMethod || ""))
    payload.append("paid_amount", String(formData.paidAmount || 0))
    payload.append("payment_notes", String(formData.paymentNotes || ""))
    payload.append("notes", formData.notes || "")
    payload.append("items", JSON.stringify(validItems))
    if (editingTransferId) payload.append("transfer_id", String(editingTransferId))

    try {
      setIsSaving(true)
      const result = editingTransferId ? await updateWarehouseTransfer(payload) : await createWarehouseTransfer(payload)
      if (!result.success) {
        notifyError(toast, result.message || "Failed to save transfer")
        return
      }

      markInventoryStale(dispatch)
      notifySuccess(toast, result.message || "Transfer saved" )
      setIsModalOpen(false)
      resetForm()
      await loadTransfers()
    } finally {
      setIsSaving(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const value = String(status).toLowerCase()
    if (value === "cancelled") {
      return <Badge className="bg-red-100 text-red-700">CANCELLED</Badge>
    }
    if (value === "rejected") {
      return <Badge className="bg-rose-100 text-rose-700">REJECTED</Badge>
    }
    if (value === "pending") {
      return <Badge className="bg-amber-100 text-amber-700">PENDING</Badge>
    }
    return <Badge className="bg-emerald-100 text-emerald-700">DONE</Badge>
  }

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-indigo-600 to-blue-700 rounded-xl p-4 text-white shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            <h1 className="text-lg font-semibold">Warehouse Transfers</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={loadTransfers} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="secondary" size="sm" onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-1" />
              New Transfer
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by ID, warehouse, or notes..."
              className="pl-9"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "all" | "pending" | "completed" | "rejected" | "cancelled")
            }
            className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-10 text-center text-gray-500">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            Loading transfers...
          </div>
        ) : transfers.length === 0 ? (
          <div className="p-10 text-center text-gray-500">No transfers found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">ID</th>
                  <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">From</th>
                  <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">To</th>
                  <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Items</th>
                  <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Payment</th>
                  <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {transfers.map((transfer) => (
                  <tr key={transfer.id} className="hover:bg-gray-50">
                    <td className="p-3 text-sm font-medium text-blue-600">#{transfer.id}</td>
                    <td className="p-3 text-sm text-gray-700">
                      {new Date(transfer.transfer_date || transfer.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-3 text-sm text-gray-700">{transfer.from_device_name}</td>
                    <td className="p-3 text-sm text-gray-700">{transfer.to_device_name}</td>
                    <td className="p-3 text-sm text-gray-700">{transfer.item_count}</td>
                    <td className="p-3 text-sm text-gray-700">{transfer.total_quantity}</td>
                    <td className="p-3 text-sm text-gray-700">
                      {Number(transfer.total_amount || 0).toFixed(2)}
                    </td>
                    <td className="p-3 text-sm text-gray-700">
                      <div className="flex flex-col">
                        <span className="capitalize">{String(transfer.payment_status || "unpaid")}</span>
                        <span className="text-xs text-gray-500">
                          {Number(transfer.paid_amount || 0).toFixed(2)}
                          {transfer.payment_method ? ` • ${transfer.payment_method}` : ""}
                        </span>
                      </div>
                    </td>
                    <td className="p-3">
                      {getStatusBadge(transfer.status)}
                      {String(transfer.status).toLowerCase() === "rejected" && transfer.rejection_reason ? (
                        <div className="text-xs text-rose-600 mt-1 max-w-[180px]">
                          Reason: {transfer.rejection_reason}
                        </div>
                      ) : null}
                    </td>
                    <td className="p-3">
                      {(() => {
                        const status = String(transfer.status).toLowerCase()
                        const isTerminal = status === "cancelled" || status === "rejected"
                        const isPending = status === "pending"
                        const isSender = Number(transfer.from_device_id) === userId
                        const busy = actioningId === Number(transfer.id)
                        return (
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleOpenView(Number(transfer.id))}>
                              <Eye className="h-3.5 w-3.5 mr-1" />
                              View
                            </Button>
                            {isPending && isSender ? (
                              <>
                                <Button
                                  size="sm"
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                  onClick={() => handleAcceptTransfer(Number(transfer.id))}
                                  disabled={busy}
                                >
                                  {busy ? (
                                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                  ) : (
                                    <Check className="h-3.5 w-3.5 mr-1" />
                                  )}
                                  Accept
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-rose-600 hover:text-rose-700 border-rose-200 hover:border-rose-300"
                                  onClick={() => openRejectDialog(Number(transfer.id))}
                                  disabled={busy}
                                >
                                  <X className="h-3.5 w-3.5 mr-1" />
                                  Reject
                                </Button>
                              </>
                            ) : null}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenEdit(Number(transfer.id))}
                              disabled={isTerminal}
                            >
                              <Pencil className="h-3.5 w-3.5 mr-1" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
                              onClick={() => handleCancelTransfer(Number(transfer.id))}
                              disabled={isTerminal}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                              Cancel
                            </Button>
                          </div>
                        )
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTransferId ? `Edit Transfer #${editingTransferId}` : "Create Transfer"}</DialogTitle>
          </DialogHeader>

          {isPreparingModal ? (
            <div className="py-10 text-center text-gray-500">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              Loading transfer form...
            </div>
          ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Transfer Date</label>
                <Input
                  type="date"
                  value={formData.transferDate}
                  onChange={(e) => setFormData((prev) => ({ ...prev, transferDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">From Warehouse</label>
                <select
                  value={formData.fromDeviceId || ""}
                  onChange={(e) => handleSourceChange(Number(e.target.value))}
                  className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
                >
                  <option value="">Select source</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">To Warehouse</label>
                <select
                  value={formData.toDeviceId || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, toDeviceId: Number(e.target.value) }))}
                  className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
                >
                  <option value="">Select destination</option>
                  {devices
                    .filter((d) => d.id !== formData.fromDeviceId)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {!editingTransferId && formData.fromDeviceId && formData.fromDeviceId !== userId ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                You are requesting stock from another warehouse. This will be sent as a <strong>pending request</strong>,
                and the source warehouse must accept it before any stock or payment is recorded.
              </div>
            ) : null}

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Payment Status</label>
              <select
                value={formData.paymentStatus}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, paymentStatus: e.target.value as "unpaid" | "partial" | "paid" }))
                }
                className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
              >
                <option value="unpaid">Unpaid</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Payment Method</label>
                <select
                  value={formData.paymentMethod || ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, paymentMethod: e.target.value }))}
                  className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm"
                >
                  <option value="">Select method</option>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="bank">Bank Transfer</option>
                  <option value="upi">UPI</option>
                  <option value="credit">Credit</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Paid Amount</label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={formData.paidAmount}
                  onChange={(e) => setFormData((prev) => ({ ...prev, paidAmount: Number(e.target.value || 0) }))}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Payment Notes</label>
              <Textarea
                value={formData.paymentNotes}
                onChange={(e) => setFormData((prev) => ({ ...prev, paymentNotes: e.target.value }))}
                rows={2}
                placeholder="Optional payment note"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                rows={2}
                placeholder="Optional transfer note"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-800">Products</h4>
                <Button type="button" size="sm" variant="outline" onClick={addItemRow}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Row
                </Button>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 px-1 text-[11px] uppercase tracking-wide text-gray-500">
                  <div className="col-span-5">Product</div>
                  <div className="col-span-3">Qty</div>
                  <div className="col-span-2">Unit Cost</div>
                  <div className="col-span-1">Total</div>
                  <div className="col-span-1">Action</div>
                </div>
                {formData.items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                    <div className="col-span-5">
                      <Popover open={Boolean(rowProductOpen[idx])} onOpenChange={(open) => setProductOpen(idx, open)}>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full justify-between h-10 border-indigo-300"
                          >
                            <span className="truncate text-left">
                              {item.product_id
                                ? (() => {
                                    const p = products.find((x) => x.id === item.product_id)
                                    return p ? `${p.name}${p.barcode ? ` (${p.barcode})` : ""}` : "Select product"
                                  })()
                                : "Select product"}
                            </span>
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-[460px] p-0 z-[80]"
                          align="start"
                          onWheel={(e) => e.stopPropagation()}
                        >
                          <div className="border-b border-gray-200 p-2">
                            <div className="relative">
                              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                              <Input
                                value={rowProductSearch[idx] || ""}
                                onChange={(e) => setProductSearchTerm(idx, e.target.value)}
                                placeholder="Search product name or barcode..."
                                className="h-9 pl-8"
                              />
                            </div>
                          </div>

                          <div
                            className="max-h-[260px] overflow-y-auto overscroll-contain p-1"
                            onWheel={(e) => e.stopPropagation()}
                          >
                            {products
                              .filter((p) => {
                                const q = (rowProductSearch[idx] || "").trim().toLowerCase()
                                if (!q) return true
                                return p.name.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q)
                              })
                              .map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => {
                                    const available = Number(effectiveSourceStockMap.get(p.id) || 0)
                                    const currentQty = Number(item.quantity || 1)
                              const defaultUnitCost = Number(products.find((x) => x.id === p.id)?.default_unit_cost || 0)
                                    setItem(idx, {
                                      product_id: p.id,
                                      quantity: available > 0 ? Math.min(currentQty, available) : 1,
                                unit_cost: Number(item.unit_cost || defaultUnitCost || 0),
                                    })
                                    setProductOpen(idx, false)
                                  }}
                                  className="w-full text-left px-2 py-2 rounded-md hover:bg-gray-100 flex items-center justify-between gap-3"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-gray-900">{p.name}</p>
                                    <p className="truncate text-xs text-gray-500">{p.barcode || "No barcode"}</p>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-xs rounded-full bg-blue-100 text-blue-700 px-2 py-0.5">
                                      Avl {Number(effectiveSourceStockMap.get(p.id) ?? p.source_stock ?? 0)}
                                    </span>
                                    {item.product_id === p.id ? <Check className="h-4 w-4 text-blue-600" /> : null}
                                  </div>
                                </button>
                              ))}
                            {products.filter((p) => {
                              const q = (rowProductSearch[idx] || "").trim().toLowerCase()
                              if (!q) return true
                              return p.name.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q)
                            }).length === 0 ? (
                              <p className="py-6 text-center text-sm text-gray-500">No product found.</p>
                            ) : null}
                          </div>
                        </PopoverContent>
                      </Popover>
                      {item.product_id ? (
                        <p className="text-[11px] text-red-600 mt-1">
                        available stock: {effectiveSourceStockMap.get(item.product_id) ?? 0}
                        </p>
                      ) : null}
                    </div>
                    <div className="col-span-3">
                      <Input
                        type="number"
                        min={1}
                        max={Number(effectiveSourceStockMap.get(item.product_id) || 1)}
                        value={item.quantity || 1}
                        onChange={(e) => {
                          const maxAllowed = Number(effectiveSourceStockMap.get(item.product_id) || 1)
                          const nextValue = Number(e.target.value || 1)
                          if (nextValue > maxAllowed) {
                            setRowWarnings((prev) => ({
                              ...prev,
                              [idx]: `Only ${maxAllowed} available in source warehouse`,
                            }))
                          } else {
                            setRowWarnings((prev) => {
                              const next = { ...prev }
                              delete next[idx]
                              return next
                            })
                          }
                          setItem(idx, { quantity: Math.min(Math.max(nextValue, 1), Math.max(maxAllowed, 1)) })
                        }}
                      />
                      {rowWarnings[idx] ? (
                        <p className="text-[11px] text-red-600 mt-1">{rowWarnings[idx]}</p>
                      ) : null}
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.unit_cost || 0}
                        onChange={(e) => {
                          const nextUnitCost = Number(e.target.value || 0)
                          setItem(idx, { unit_cost: Math.max(0, nextUnitCost) })
                        }}
                        placeholder="Unit cost"
                      />
                    </div>
                    <div className="col-span-1 h-10 flex items-center text-sm font-medium text-gray-700">
                      {(Number(item.quantity || 0) * Number(item.unit_cost || 0)).toFixed(2)}
                    </div>
                    <div className="col-span-1">
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => removeItemRow(idx)}
                        disabled={formData.items.length === 1}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <div className="mr-auto text-sm font-medium text-gray-700 flex items-center">
                Transfer Amount: {transferTotalAmount.toFixed(2)}
              </div>
              <Button variant="outline" onClick={() => setIsModalOpen(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {editingTransferId ? "Update Transfer" : "Create Transfer"}
              </Button>
            </div>
          </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {viewTransferDetail?.transfer?.id ? `Transfer #${viewTransferDetail.transfer.id}` : "Transfer Details"}
            </DialogTitle>
          </DialogHeader>

          {isViewLoading ? (
            <div className="py-8 text-center text-gray-500">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              Loading transfer details...
            </div>
          ) : !viewTransferDetail?.transfer ? (
            <div className="py-6 text-center text-gray-500">No details found.</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border border-gray-200 p-3">
                  <p className="text-xs text-gray-500 mb-1">From</p>
                  <p className="font-medium">{viewTransferDetail.transfer.from_device_name}</p>
                </div>
                <div className="rounded-md border border-gray-200 p-3">
                  <p className="text-xs text-gray-500 mb-1">To</p>
                  <p className="font-medium">{viewTransferDetail.transfer.to_device_name}</p>
                </div>
                <div className="rounded-md border border-gray-200 p-3">
                  <p className="text-xs text-gray-500 mb-1">Transfer Date</p>
                  <p className="font-medium">
                    {new Date(
                      viewTransferDetail.transfer.transfer_date || viewTransferDetail.transfer.created_at,
                    ).toLocaleDateString()}
                  </p>
                </div>
                <div className="rounded-md border border-gray-200 p-3">
                  <p className="text-xs text-gray-500 mb-1">Status</p>
                  <p className="font-medium capitalize">{String(viewTransferDetail.transfer.status || "completed")}</p>
                </div>
                <div className="rounded-md border border-gray-200 p-3">
                  <p className="text-xs text-gray-500 mb-1">Payment</p>
                  <p className="font-medium capitalize">
                    {String(viewTransferDetail.transfer.payment_status || "unpaid")}
                    {viewTransferDetail.transfer.payment_method
                      ? ` • ${viewTransferDetail.transfer.payment_method}`
                      : ""}
                  </p>
                </div>
                <div className="rounded-md border border-gray-200 p-3">
                  <p className="text-xs text-gray-500 mb-1">Amount</p>
                  <p className="font-medium">
                    {Number(viewTransferDetail.transfer.total_amount || 0).toFixed(2)}
                    {" / paid "}
                    {Number(viewTransferDetail.transfer.paid_amount || 0).toFixed(2)}
                  </p>
                </div>
              </div>

              {String(viewTransferDetail.transfer.status || "").toLowerCase() === "rejected" &&
              viewTransferDetail.transfer.rejection_reason ? (
                <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm">
                  <p className="text-xs text-rose-500 mb-1">Rejection Reason</p>
                  <p className="text-rose-700">{viewTransferDetail.transfer.rejection_reason}</p>
                </div>
              ) : null}

              {(viewTransferDetail.transfer.notes || viewTransferDetail.transfer.payment_notes) && (
                <div className="rounded-md border border-gray-200 p-3 text-sm space-y-2">
                  {viewTransferDetail.transfer.notes ? (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Notes</p>
                      <p>{viewTransferDetail.transfer.notes}</p>
                    </div>
                  ) : null}
                  {viewTransferDetail.transfer.payment_notes ? (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Payment Notes</p>
                      <p>{viewTransferDetail.transfer.payment_notes}</p>
                    </div>
                  ) : null}
                </div>
              )}

              <div className="rounded-md border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-2">Product</th>
                      <th className="text-left p-2">Qty</th>
                      <th className="text-left p-2">Unit Cost</th>
                      <th className="text-left p-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewTransferDetail.items || []).map((item: any) => (
                      <tr key={item.id} className="border-t border-gray-200">
                        <td className="p-2">{item.product_name || `Product #${item.product_id}`}</td>
                        <td className="p-2">{Number(item.quantity || 0)}</td>
                        <td className="p-2">{Number(item.unit_cost || 0).toFixed(2)}</td>
                        <td className="p-2">{Number(item.total_cost || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={rejectTransferId != null}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTransferId(null)
            setRejectReason("")
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Transfer Request #{rejectTransferId}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Let the requester know why this transfer is being rejected. No stock or payment will be recorded.
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Reason</label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Not enough stock available, price needs revision..."
                rows={4}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setRejectTransferId(null)
                  setRejectReason("")
                }}
                disabled={isRejecting}
              >
                Cancel
              </Button>
              <Button
                className="bg-rose-600 hover:bg-rose-700 text-white"
                onClick={handleConfirmReject}
                disabled={isRejecting || !rejectReason.trim()}
              >
                {isRejecting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <X className="h-4 w-4 mr-1" />}
                Reject Request
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {ConfirmDialog}
    </div>
  )
}
