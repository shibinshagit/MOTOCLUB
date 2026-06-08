"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowRightLeft, Check, ChevronDown, Eye, Loader2, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useToast } from "@/components/ui/use-toast"
import {
  cancelWarehouseTransfer,
  createWarehouseTransfer,
  getTransferFormData,
  getWarehouseTransferById,
  getWarehouseTransfers,
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
  const getTodayDate = () => new Date().toISOString().slice(0, 10)
  const { toast } = useToast()
  const [transfers, setTransfers] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isPreparingModal, setIsPreparingModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "cancelled">("all")
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [isViewLoading, setIsViewLoading] = useState(false)
  const [viewTransferDetail, setViewTransferDetail] = useState<any | null>(null)
  const [editingTransferId, setEditingTransferId] = useState<number | null>(null)
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
        toast({
          title: "Error",
          description: result.message || "Failed to load transfers",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Load transfers error:", error)
      toast({
        title: "Error",
        description: "Failed to load transfers",
        variant: "destructive",
      })
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
        toast({
          title: "Error",
          description: result.message || "Failed to load transfer form data",
          variant: "destructive",
        })
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
        toast({
          title: "Error",
          description: detail.message || "Failed to load transfer details",
          variant: "destructive",
        })
        return
      }

      const transfer = detail.data.transfer
      setIsModalOpen(true)
      setIsPreparingModal(true)
      await loadFormData(Number(transfer.from_device_id))

      setEditingTransferId(transferId)
      const rowCount = detail.data.items.length > 0 ? detail.data.items.length : 1
      setRowProductSearch(Array(rowCount).fill(""))
      setRowProductOpen(Array(rowCount).fill(false))
      setRowWarnings({})
      setFormData({
        fromDeviceId: Number(transfer.from_device_id),
        toDeviceId: Number(transfer.to_device_id),
        transferDate: String(transfer.transfer_date || transfer.created_at || "").slice(0, 10) || getTodayDate(),
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
        toast({
          title: "Error",
          description: detail.message || "Failed to load transfer details",
          variant: "destructive",
        })
        return
      }
      setViewTransferDetail(detail.data)
      setIsViewModalOpen(true)
    } finally {
      setIsViewLoading(false)
    }
  }

  const handleCancelTransfer = async (transferId: number) => {
    if (!confirm("Cancel this transfer? Stocks will be moved back automatically.")) return
    const result = await cancelWarehouseTransfer(transferId, userId)
    if (!result.success) {
      toast({
        title: "Error",
        description: result.message || "Failed to cancel transfer",
        variant: "destructive",
      })
      return
    }
    toast({ title: "Success", description: result.message || "Transfer cancelled" })
    await loadTransfers()
  }

  const setItem = (index: number, patch: Partial<TransferItemForm>) => {
    setFormData((prev) => {
      const items = [...prev.items]
      items[index] = { ...items[index], ...patch }
      const sourceStock = Number(selectedSourceStockMap.get(items[index].product_id) || 0)
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
      toast({ title: "Validation", description: "Please select source and destination warehouses", variant: "destructive" })
      return
    }
    if (formData.fromDeviceId === formData.toDeviceId) {
      toast({ title: "Validation", description: "Source and destination must be different", variant: "destructive" })
      return
    }
    if (validItems.length === 0) {
      toast({ title: "Validation", description: "Add at least one valid product row", variant: "destructive" })
      return
    }
    if (!Number.isFinite(formData.paidAmount) || Number(formData.paidAmount) < 0) {
      toast({ title: "Validation", description: "Paid amount must be a non-negative number", variant: "destructive" })
      return
    }
    if (Number(formData.paidAmount) > transferTotalAmount) {
      toast({ title: "Validation", description: "Paid amount cannot exceed transfer amount", variant: "destructive" })
      return
    }

    const requestedByProduct = new Map<number, number>()
    for (const item of validItems) {
      requestedByProduct.set(item.product_id, (requestedByProduct.get(item.product_id) || 0) + Number(item.quantity))
    }
    for (const [productId, totalRequested] of requestedByProduct.entries()) {
      const available = Number(selectedSourceStockMap.get(productId) || 0)
      if (totalRequested > available) {
        const productName = products.find((p) => p.id === productId)?.name || `Product #${productId}`
        toast({
          title: "Validation",
          description: `${productName}: requested ${totalRequested}, available ${available}`,
          variant: "destructive",
        })
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
        toast({
          title: "Error",
          description: result.message || "Failed to save transfer",
          variant: "destructive",
        })
        return
      }

      toast({ title: "Success", description: result.message || "Transfer saved" })
      setIsModalOpen(false)
      resetForm()
      await loadTransfers()
    } finally {
      setIsSaving(false)
    }
  }

  const getStatusBadge = (status: string) => {
    if (String(status).toLowerCase() === "cancelled") {
      return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">CANCELLED</Badge>
    }
    return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">DONE</Badge>
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

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
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
            onChange={(e) => setStatusFilter(e.target.value as "all" | "completed" | "cancelled")}
            className="h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 text-sm"
          >
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
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
              <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
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
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {transfers.map((transfer) => (
                  <tr key={transfer.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="p-3 text-sm font-medium text-blue-600 dark:text-blue-300">#{transfer.id}</td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-300">
                      {new Date(transfer.transfer_date || transfer.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-300">{transfer.from_device_name}</td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-300">{transfer.to_device_name}</td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-300">{transfer.item_count}</td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-300">{transfer.total_quantity}</td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-300">
                      {Number(transfer.total_amount || 0).toFixed(2)}
                    </td>
                    <td className="p-3 text-sm text-gray-700 dark:text-gray-300">
                      <div className="flex flex-col">
                        <span className="capitalize">{String(transfer.payment_status || "unpaid")}</span>
                        <span className="text-xs text-gray-500">
                          {Number(transfer.paid_amount || 0).toFixed(2)}
                          {transfer.payment_method ? ` • ${transfer.payment_method}` : ""}
                        </span>
                      </div>
                    </td>
                    <td className="p-3">{getStatusBadge(transfer.status)}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenView(Number(transfer.id))}
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenEdit(Number(transfer.id))}
                          disabled={String(transfer.status).toLowerCase() === "cancelled"}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
                          onClick={() => handleCancelTransfer(Number(transfer.id))}
                          disabled={String(transfer.status).toLowerCase() === "cancelled"}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Cancel
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
                  className="w-full h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 text-sm"
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
                  className="w-full h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 text-sm"
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

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Payment Status</label>
              <select
                value={formData.paymentStatus}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, paymentStatus: e.target.value as "unpaid" | "partial" | "paid" }))
                }
                className="w-full h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 text-sm"
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
                  className="w-full h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 text-sm"
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
                <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200">Products</h4>
                <Button type="button" size="sm" variant="outline" onClick={addItemRow}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Row
                </Button>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 px-1 text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
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
                            className="w-full justify-between h-10 border-indigo-300 dark:border-indigo-600"
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
                          <div className="border-b border-gray-200 dark:border-gray-700 p-2">
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
                                    const available = Number(selectedSourceStockMap.get(p.id) || 0)
                                    const currentQty = Number(item.quantity || 1)
                              const defaultUnitCost = Number(products.find((x) => x.id === p.id)?.default_unit_cost || 0)
                                    setItem(idx, {
                                      product_id: p.id,
                                      quantity: available > 0 ? Math.min(currentQty, available) : 1,
                                unit_cost: Number(item.unit_cost || defaultUnitCost || 0),
                                    })
                                    setProductOpen(idx, false)
                                  }}
                                  className="w-full text-left px-2 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-between gap-3"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{p.name}</p>
                                    <p className="truncate text-xs text-gray-500">{p.barcode || "No barcode"}</p>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-xs rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 dark:bg-blue-900/30 dark:text-blue-300">
                                      Avl {Number(p.source_stock || 0)}
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
                        <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">
                        available stock: {selectedSourceStockMap.get(item.product_id) ?? 0}
                        </p>
                      ) : null}
                    </div>
                    <div className="col-span-3">
                      <Input
                        type="number"
                        min={1}
                        max={Number(selectedSourceStockMap.get(item.product_id) || 1)}
                        value={item.quantity || 1}
                        onChange={(e) => {
                          const maxAllowed = Number(selectedSourceStockMap.get(item.product_id) || 1)
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
                        <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">{rowWarnings[idx]}</p>
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
                    <div className="col-span-1 h-10 flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">
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
              <div className="mr-auto text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
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
                <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
                  <p className="text-xs text-gray-500 mb-1">From</p>
                  <p className="font-medium">{viewTransferDetail.transfer.from_device_name}</p>
                </div>
                <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
                  <p className="text-xs text-gray-500 mb-1">To</p>
                  <p className="font-medium">{viewTransferDetail.transfer.to_device_name}</p>
                </div>
                <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
                  <p className="text-xs text-gray-500 mb-1">Transfer Date</p>
                  <p className="font-medium">
                    {new Date(
                      viewTransferDetail.transfer.transfer_date || viewTransferDetail.transfer.created_at,
                    ).toLocaleDateString()}
                  </p>
                </div>
                <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
                  <p className="text-xs text-gray-500 mb-1">Status</p>
                  <p className="font-medium capitalize">{String(viewTransferDetail.transfer.status || "completed")}</p>
                </div>
                <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
                  <p className="text-xs text-gray-500 mb-1">Payment</p>
                  <p className="font-medium capitalize">
                    {String(viewTransferDetail.transfer.payment_status || "unpaid")}
                    {viewTransferDetail.transfer.payment_method
                      ? ` • ${viewTransferDetail.transfer.payment_method}`
                      : ""}
                  </p>
                </div>
                <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
                  <p className="text-xs text-gray-500 mb-1">Amount</p>
                  <p className="font-medium">
                    {Number(viewTransferDetail.transfer.total_amount || 0).toFixed(2)}
                    {" / paid "}
                    {Number(viewTransferDetail.transfer.paid_amount || 0).toFixed(2)}
                  </p>
                </div>
              </div>

              {(viewTransferDetail.transfer.notes || viewTransferDetail.transfer.payment_notes) && (
                <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3 text-sm space-y-2">
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

              <div className="rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      <th className="text-left p-2">Product</th>
                      <th className="text-left p-2">Qty</th>
                      <th className="text-left p-2">Unit Cost</th>
                      <th className="text-left p-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewTransferDetail.items || []).map((item: any) => (
                      <tr key={item.id} className="border-t border-gray-200 dark:border-gray-700">
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
    </div>
  )
}
