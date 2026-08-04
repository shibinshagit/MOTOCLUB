"use client"

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { ArrowRightLeft, Calendar, Check, ChevronDown, ChevronUp, CreditCard, Eye, FilePenLine, History, Layers, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, Undo2, Wallet, X } from "lucide-react"
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
import { Card, CardContent } from "@/components/ui/card"
import { useDispatch, useSelector } from "react-redux"
import type { AppDispatch, RootState } from "@/store/store"
import PayWarehouseCreditModal from "@/components/transfers/pay-warehouse-credit-modal"
import EditWarehousePaymentModal from "@/components/transfers/edit-warehouse-payment-modal"
import {
  deleteWarehousePayment,
  listWarehousePaymentsForWarehouse,
  type WarehousePaymentListRow,
} from "@/app/actions/warehouse-payment-actions"
import {
  acceptWarehouseTransfer,
  cancelWarehouseTransfer,
  createWarehouseTransfer,
  getTransferFormData,
  getTransferDashboardStats,
  getWarehouseSettlementSummaries,
  getWarehouseTransferById,
  getWarehouseTransfers,
  rejectWarehouseTransfer,
  updateWarehouseTransfer,
  type WarehouseSettlementSummary,
} from "@/app/actions/transfer-actions"

interface TransferTabProps {
  userId: number
}

type TransferItemForm = {
  product_id: number
  quantity: number
  unit_cost: number
  product_variant_id?: number | null
  batch_id?: number | null
  variant_name?: string | null
  batch_number?: string | null
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
  const currency = useSelector((state: RootState) => state.device.currency) || "AED"
  const formatCurrency = (amount: number) => `${currency} ${Number(amount || 0).toFixed(2)}`
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
    qtyByVariantOrBatch: Map<string, number>
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
  const [products, setProducts] = useState<any[]>([])
  const [rowProductSearch, setRowProductSearch] = useState<string[]>([""])
  const [rowProductOpen, setRowProductOpen] = useState<boolean[]>([false])
  const [rowWarnings, setRowWarnings] = useState<Record<number, string>>({})
  const [settlements, setSettlements] = useState<WarehouseSettlementSummary[]>([])
  const [isLoadingSettlements, setIsLoadingSettlements] = useState(false)
  const [showPayWarehouseModal, setShowPayWarehouseModal] = useState(false)
  const [selectedWarehouseForPayment, setSelectedWarehouseForPayment] = useState<{
    warehouse_id: number
    warehouse_name: string
    we_owe: number
  } | null>(null)
  const [paymentHistoryWarehouse, setPaymentHistoryWarehouse] = useState<{
    warehouse_id: number
    warehouse_name: string
  } | null>(null)
  const [warehousePayments, setWarehousePayments] = useState<WarehousePaymentListRow[]>([])
  const [loadingWarehousePayments, setLoadingWarehousePayments] = useState(false)
  const [editWarehousePaymentId, setEditWarehousePaymentId] = useState<number | null>(null)
  const [undoingPaymentId, setUndoingPaymentId] = useState<number | null>(null)
  const [expandedTransferId, setExpandedTransferId] = useState<number | null>(null)
  const [loadingExpandedId, setLoadingExpandedId] = useState<number | null>(null)

  const toggleExpand = async (id: number, transferObj?: any) => {
    if (expandedTransferId === id) {
      setExpandedTransferId(null)
      return
    }
    setExpandedTransferId(id)

    if (transferObj && (!transferObj.items || transferObj.items.length === 0)) {
      try {
        setLoadingExpandedId(id)
        const res = await getWarehouseTransferById(id, userId)
        if (res.success && res.data && res.data.items) {
          setTransfers((prev) =>
            prev.map((t) => (t.id === id ? { ...t, items: res.data.items } : t))
          )
        }
      } catch (err) {
        console.error("Failed to load transfer items on expand:", err)
      } finally {
        setLoadingExpandedId(null)
      }
    }
  }

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

  const loadSettlements = useCallback(async () => {
    if (!userId) return
    try {
      setIsLoadingSettlements(true)
      const result = await getWarehouseSettlementSummaries(userId)
      if (result.success) {
        setSettlements(result.data || [])
      } else {
        notifyError(toast, result.message || "Failed to load warehouse balances")
      }
    } catch (error) {
      console.error("Load warehouse settlements error:", error)
      notifyError(toast, "Failed to load warehouse balances")
    } finally {
      setIsLoadingSettlements(false)
    }
  }, [userId, toast])

  const [datePreset, setDatePreset] = useState<string>("all")
  const [customStart, setCustomStart] = useState<string>("")
  const [customEnd, setCustomEnd] = useState<string>("")
  const [fromDeviceFilter, setFromDeviceFilter] = useState<number>(0)
  const [toDeviceFilter, setToDeviceFilter] = useState<number>(0)
  const [dashboardStats, setDashboardStats] = useState({ pendingApprovals: 0, approvedToday: 0, rejectedToday: 0, transferValueToday: 0 })
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false)
  const [viewReasonModal, setViewReasonModal] = useState<{ isOpen: boolean; reason: string; rejectedBy?: string; transferId: number | null }>({ isOpen: false, reason: "", transferId: null })

  const loadDashboardStats = useCallback(async () => {
    if (!userId) return
    try {
      const res = await getTransferDashboardStats(userId)
      if (res.success && res.data) {
        setDashboardStats(res.data)
      }
    } catch (err) {
      console.error("Load dashboard stats error:", err)
    }
  }, [userId])

  const loadTransfers = useCallback(async () => {
    if (!userId) return
    try {
      setIsLoading(true)
      const result = await getWarehouseTransfers(
        userId,
        searchTerm,
        statusFilter,
        datePreset,
        customStart,
        customEnd,
        fromDeviceFilter,
        toDeviceFilter,
      )
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
  }, [userId, searchTerm, statusFilter, datePreset, customStart, customEnd, fromDeviceFilter, toDeviceFilter, toast])

  const handleExportExcel = () => {
    if (transfers.length === 0) {
      notifyWarning(toast, "No transfer records to export")
      return
    }

    const headers = [
      "Transfer No",
      "Date",
      "From Device",
      "To Device",
      "Status",
      "Product Name",
      "Variant / Batch",
      "Quantity",
      "Unit Cost",
      "Line Total",
      "Transfer Total",
      "Created By",
    ]

    const rows: string[][] = []
    let grandTotal = 0
    let totalItemsCount = 0

    transfers.forEach((t) => {
      const transferTotal = Number(t.total_amount || 0)
      grandTotal += transferTotal

      if (t.items && t.items.length > 0) {
        t.items.forEach((item: any, idx: number) => {
          totalItemsCount += Number(item.quantity || 0)
          rows.push([
            `#${t.id}`,
            toDateInputValue(t.transfer_date) || t.transfer_date,
            t.from_device_name || "",
            t.to_device_name || "",
            (t.approval_status || t.status || "").toUpperCase(),
            item.product_name || `Product #${item.product_id}`,
            item.variant_name || item.batch_number || "-",
            String(item.quantity || 0),
            Number(item.unit_cost || 0).toFixed(2),
            Number(item.total_cost || 0).toFixed(2),
            idx === 0 ? transferTotal.toFixed(2) : "",
            t.created_by_name || `User #${t.created_by}`,
          ])
        })
      } else {
        rows.push([
          `#${t.id}`,
          toDateInputValue(t.transfer_date) || t.transfer_date,
          t.from_device_name || "",
          t.to_device_name || "",
          (t.approval_status || t.status || "").toUpperCase(),
          "No items listed",
          "-",
          String(t.total_quantity || 0),
          "0.00",
          "0.00",
          transferTotal.toFixed(2),
          t.created_by_name || `User #${t.created_by}`,
        ])
      }
    })

    const csvContent = [
      headers.join(","),
      ...rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
      "",
      `"Total Transfers","${transfers.length}"`,
      `"Total Items Transferred","${totalItemsCount}"`,
      `"Overall Total Amount","${grandTotal.toFixed(2)}"`,
    ].join("\n")

    const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    link.setAttribute("download", `transfer_summary_report_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    notifySuccess(toast, "Detailed transfer report exported to Excel/CSV successfully")
  }

  const handleExportPDF = () => {
    if (transfers.length === 0) {
      notifyWarning(toast, "No transfer records to export")
      return
    }

    const grandTotal = transfers.reduce((sum, t) => sum + Number(t.total_amount || 0), 0)
    const totalItemsCount = transfers.reduce((sum, t) => sum + Number(t.total_quantity || 0), 0)

    const printWindow = window.open("", "_blank")
    if (!printWindow) return

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Stock Transfers Detailed Summary</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; color: #1e293b; background: #fff; }
            .header { margin-bottom: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
            h2 { margin: 0 0 5px 0; color: #0f172a; font-size: 20px; }
            p { margin: 0; color: #64748b; font-size: 12px; }
            .transfer-card { margin-bottom: 20px; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; page-break-inside: avoid; }
            .transfer-header { background-color: #f8fafc; padding: 10px 12px; font-size: 12px; font-weight: bold; display: flex; justify-content: space-between; border-bottom: 1px solid #cbd5e1; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #e2e8f0; padding: 6px 8px; text-align: left; }
            th { background-color: #f1f5f9; color: #475569; font-weight: bold; }
            .text-right { text-align: right; }
            .badge { display: inline-block; padding: 2px 6px; font-size: 10px; font-weight: bold; border-radius: 4px; text-transform: uppercase; }
            .badge-approved { background: #dcfce7; color: #166534; }
            .badge-pending { background: #fef3c7; color: #92400e; }
            .badge-rejected { background: #ffe4e6; color: #9f1239; }
            .summary-box { margin-top: 25px; padding: 16px; background-color: #0f172a; color: #fff; border-radius: 8px; font-family: monospace; font-size: 14px; }
            .summary-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
            .summary-row:last-child { margin-bottom: 0; border-top: 1px solid #334155; padding-top: 8px; font-size: 16px; font-weight: bold; color: #34d399; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>Stock Transfers Detailed Summary Report</h2>
            <p>Generated Date: ${new Date().toLocaleString()} | Filter Range: ${datePreset.toUpperCase().replace("_", " ")}</p>
          </div>

          ${transfers
            .map(
              (t) => `
            <div class="transfer-card">
              <div class="transfer-header">
                <div>
                  <span style="color: #2563eb; font-weight: bold;">Transfer #${t.id}</span>
                  <span style="margin: 0 8px; color: #94a3b8;">|</span>
                  <span>Date: ${toDateInputValue(t.transfer_date) || t.transfer_date}</span>
                  <span style="margin: 0 8px; color: #94a3b8;">|</span>
                  <span>${t.from_device_name} &rarr; ${t.to_device_name}</span>
                </div>
                <div>
                  <span class="badge ${
                    (t.approval_status || t.status || "").toLowerCase() === "approved" || (t.approval_status || t.status || "").toLowerCase() === "completed"
                      ? "badge-approved"
                      : (t.approval_status || t.status || "").toLowerCase() === "rejected"
                      ? "badge-rejected"
                      : "badge-pending"
                  }">
                    ${(t.approval_status || t.status || "").toUpperCase()}
                  </span>
                  <span style="margin-left: 12px; font-weight: bold;">Total: ${formatCurrency(Number(t.total_amount || 0))}</span>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th style="width: 35%;">Product</th>
                    <th style="width: 25%;">Variant / Batch</th>
                    <th class="text-right" style="width: 12%;">Qty</th>
                    <th class="text-right" style="width: 14%;">Unit Cost</th>
                    <th class="text-right" style="width: 14%;">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${
                    t.items && t.items.length > 0
                      ? t.items
                          .map(
                            (item: any) => `
                        <tr>
                          <td>${item.product_name || `Product #${item.product_id}`}</td>
                          <td>${item.variant_name || item.batch_number || "-"}</td>
                          <td class="text-right">${item.quantity || 0}</td>
                          <td class="text-right">${formatCurrency(Number(item.unit_cost || 0))}</td>
                          <td class="text-right" style="font-weight: bold;">${formatCurrency(Number(item.total_cost || 0))}</td>
                        </tr>
                      `,
                          )
                          .join("")
                      : `<tr><td colSpan="5" style="text-align: center; color: #94a3b8;">No line items listed</td></tr>`
                  }
                </tbody>
              </table>
            </div>
          `,
            )
            .join("")}

          <div class="summary-box">
            <div class="summary-row">
              <span>Total Transfers:</span>
              <span style="color: #fbbf24;">${transfers.length}</span>
            </div>
            <div class="summary-row">
              <span>Total Items Transferred:</span>
              <span style="color: #fbbf24;">${totalItemsCount}</span>
            </div>
            <div class="summary-row">
              <span>Overall Filtered Amount:</span>
              <span>${formatCurrency(grandTotal)}</span>
            </div>
          </div>

          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `
    printWindow.document.write(html)
    printWindow.document.close()
  }

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
    loadFormData(userId)
    loadTransfers()
    loadSettlements()
  }, [loadFormData, loadTransfers, loadSettlements, userId])

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
      const originalQtyByVariantOrBatch = new Map<string, number>()
      for (const item of (detail.data.items as any[])) {
        const pid = Number(item.product_id)
        originalQtyByProduct.set(pid, (originalQtyByProduct.get(pid) || 0) + Number(item.quantity || 0))
        const key = item.batch_id ? `batch-${item.batch_id}` : (item.product_variant_id ? `variant-${item.product_variant_id}` : `prod-${pid}`)
        originalQtyByVariantOrBatch.set(key, (originalQtyByVariantOrBatch.get(key) || 0) + Number(item.quantity || 0))
      }
      setEditOriginal({
        fromDeviceId: Number(transfer.from_device_id),
        toDeviceId: Number(transfer.to_device_id),
        qtyByProduct: originalQtyByProduct,
        qtyByVariantOrBatch: originalQtyByVariantOrBatch,
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
                product_variant_id: item.product_variant_id ? Number(item.product_variant_id) : null,
                batch_id: item.batch_id ? Number(item.batch_id) : null,
                variant_name: item.variant_name || null,
                batch_number: item.batch_number || null,
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
    await loadSettlements()
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
    await loadSettlements()
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
    await loadSettlements()
    } finally {
      setIsRejecting(false)
    }
  }

  const setItem = (index: number, patch: Partial<TransferItemForm>) => {
    setFormData((prev) => {
      const items = [...prev.items]
      items[index] = { ...items[index], ...patch }
      const item = items[index]
      const p = products.find((x) => x.id === item.product_id)
      let sourceStock = Number(effectiveSourceStockMap.get(item.product_id) || 0)

      if (p) {
        if (p.has_variants) {
          if (!p.is_service) {
            const selectedBatch = p.batches?.find((b: any) => b.id === item.batch_id)
            let baseStock = Number(selectedBatch?.stock || 0)
            if (editOriginal && editOriginal.fromDeviceId === prev.fromDeviceId) {
              const originalQty = editOriginal.qtyByVariantOrBatch?.get(`batch-${item.batch_id}`) || 0
              baseStock += Number(originalQty)
            }
            sourceStock = baseStock
          } else {
            const selectedVar = p.variants?.find((v: any) => v.id === item.product_variant_id)
            let baseStock = Number(selectedVar?.stock || 0)
            if (editOriginal && editOriginal.fromDeviceId === prev.fromDeviceId) {
              const originalQty = editOriginal.qtyByVariantOrBatch?.get(`variant-${item.product_variant_id}`) || 0
              baseStock += Number(originalQty)
            }
            sourceStock = baseStock
          }
        }
      }

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

    const requestedByVariantOrBatch = new Map<string, number>()
    for (const item of validItems) {
      const key = item.batch_id ? `batch-${item.batch_id}` : (item.product_variant_id ? `variant-${item.product_variant_id}` : `prod-${item.product_id}`)
      requestedByVariantOrBatch.set(key, (requestedByVariantOrBatch.get(key) || 0) + Number(item.quantity))
    }

    for (const item of validItems) {
      const p = products.find((x) => x.id === item.product_id)
      if (!p) continue

      let maxAvailable = Number(effectiveSourceStockMap.get(item.product_id) || 0)
      let key = `prod-${item.product_id}`
      let label = p.name

      if (p.has_variants) {
        if (!p.is_service) {
          const selectedBatch = p.batches?.find((b: any) => b.id === item.batch_id)
          let baseStock = Number(selectedBatch?.stock || 0)
          if (editOriginal && editOriginal.fromDeviceId === formData.fromDeviceId) {
            const originalQty = editOriginal.qtyByVariantOrBatch?.get(`batch-${item.batch_id}`) || 0
            baseStock += Number(originalQty)
          }
          maxAvailable = baseStock
          key = `batch-${item.batch_id}`
          label = `${p.name} (Batch: ${item.batch_number || selectedBatch?.batch_number})`
        } else {
          const selectedVar = p.variants?.find((v: any) => v.id === item.product_variant_id)
          let baseStock = Number(selectedVar?.stock || 0)
          if (editOriginal && editOriginal.fromDeviceId === formData.fromDeviceId) {
            const originalQty = editOriginal.qtyByVariantOrBatch?.get(`variant-${item.product_variant_id}`) || 0
            baseStock += Number(originalQty)
          }
          maxAvailable = baseStock
          key = `variant-${item.product_variant_id}`
          label = `${p.name} (Variant: ${item.variant_name || selectedVar?.variant_name})`
        }
      }

      const totalRequested = requestedByVariantOrBatch.get(key) || 0
      if (totalRequested > maxAvailable) {
        notifyWarning(toast, `${label}: requested ${totalRequested}, available ${maxAvailable}`, "Validation")
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
    await loadSettlements()
    } finally {
      setIsSaving(false)
    }
  }

  const settlementTotals = useMemo(() => {
    return settlements.reduce(
      (acc, row) => ({
        weOwe: acc.weOwe + Number(row.we_owe || 0),
        theyOweUs: acc.theyOweUs + Number(row.they_owe_us || 0),
        paidOut: acc.paidOut + Number(row.paid_to_them || 0),
        collectedIn: acc.collectedIn + Number(row.collected_from_them || 0),
      }),
      { weOwe: 0, theyOweUs: 0, paidOut: 0, collectedIn: 0 },
    )
  }, [settlements])

  const handlePayWarehouse = (warehouse: WarehouseSettlementSummary) => {
    setSelectedWarehouseForPayment({
      warehouse_id: warehouse.warehouse_id,
      warehouse_name: warehouse.warehouse_name,
      we_owe: warehouse.we_owe,
    })
    setShowPayWarehouseModal(true)
  }

  const handlePaymentSuccess = () => {
    setShowPayWarehouseModal(false)
    setSelectedWarehouseForPayment(null)
    loadTransfers()
    loadSettlements()
    if (paymentHistoryWarehouse) {
      loadWarehousePayments(paymentHistoryWarehouse.warehouse_id)
    }
  }

  const loadWarehousePayments = useCallback(
    async (warehouseId: number) => {
      if (!userId || !warehouseId) return
      setLoadingWarehousePayments(true)
      try {
        const result = await listWarehousePaymentsForWarehouse(warehouseId, userId, userId)
        if (result.success) {
          setWarehousePayments(result.data)
        } else {
          notifyError(toast, result.message || "Failed to load payments")
        }
      } catch (error) {
        console.error(error)
        notifyError(toast, "Failed to load payments")
      } finally {
        setLoadingWarehousePayments(false)
      }
    },
    [userId, toast],
  )

  const handleOpenPaymentHistory = (warehouse: WarehouseSettlementSummary) => {
    setPaymentHistoryWarehouse({
      warehouse_id: warehouse.warehouse_id,
      warehouse_name: warehouse.warehouse_name,
    })
    loadWarehousePayments(warehouse.warehouse_id)
  }

  const handleUndoPayment = async (paymentId: number) => {
    const ok = await confirm(
      "Undo this payment? The money goes back to the transfer balance and the payment record is removed.",
    )
    if (!ok) return

    setUndoingPaymentId(paymentId)
    try {
      const result = await deleteWarehousePayment(paymentId, userId, userId)
      if (result.success) {
        notifySuccess(toast, result.message || "Payment undone")
        loadTransfers()
        loadSettlements()
        if (paymentHistoryWarehouse) {
          await loadWarehousePayments(paymentHistoryWarehouse.warehouse_id)
        }
      } else {
        notifyError(toast, result.message || "Failed to undo payment")
      }
    } catch (error) {
      console.error(error)
      notifyError(toast, "Failed to undo payment")
    } finally {
      setUndoingPaymentId(null)
    }
  }

  const refreshAll = () => {
    loadTransfers()
    loadSettlements()
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
            <Button variant="secondary" size="sm" onClick={() => { refreshAll(); loadDashboardStats(); }} disabled={isLoading || isLoadingSettlements}>
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

      {/* Dashboard Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="border border-amber-200 bg-amber-50/50 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Pending Approvals</p>
              <h3 className="text-2xl font-bold text-amber-900 mt-1">{dashboardStats.pendingApprovals}</h3>
            </div>
            <div className="relative p-2.5 bg-amber-100 rounded-xl text-amber-700">
              <RefreshCw className="h-5 w-5" />
              {dashboardStats.pendingApprovals > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white">
                  {dashboardStats.pendingApprovals}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border border-emerald-200 bg-emerald-50/50 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Approved Today</p>
              <h3 className="text-2xl font-bold text-emerald-900 mt-1">{dashboardStats.approvedToday}</h3>
            </div>
            <div className="p-2.5 bg-emerald-100 rounded-xl text-emerald-700">
              <Check className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-rose-200 bg-rose-50/50 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">Rejected Today</p>
              <h3 className="text-2xl font-bold text-rose-900 mt-1">{dashboardStats.rejectedToday}</h3>
            </div>
            <div className="p-2.5 bg-rose-100 rounded-xl text-rose-700">
              <X className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border border-indigo-200 bg-indigo-50/50 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Transfer Value Today</p>
              <h3 className="text-2xl font-bold text-indigo-900 mt-1">{formatCurrency(dashboardStats.transferValueToday)}</h3>
            </div>
            <div className="p-2.5 bg-indigo-100 rounded-xl text-indigo-700">
              <Wallet className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Date Filter & Control Bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1">Date Filter:</span>
            {[
              { id: "all", label: "All" },
              { id: "today", label: "Today" },
              { id: "yesterday", label: "Yesterday" },
              { id: "this_week", label: "This Week" },
              { id: "this_month", label: "This Month" },
              { id: "custom", label: "Custom Range" },
            ].map((p) => (
              <Button
                key={p.id}
                type="button"
                variant={datePreset === p.id ? "default" : "outline"}
                size="sm"
                className={`h-8 text-xs ${datePreset === p.id ? "bg-indigo-600 hover:bg-indigo-700 text-white" : "border-slate-200 text-slate-600"}`}
                onClick={() => setDatePreset(p.id)}
              >
                {p.label}
              </Button>
            ))}

            {datePreset === "custom" && (
              <div className="flex items-center gap-2 ml-1">
                <Input
                  type="date"
                  className="h-8 text-xs w-36 border-slate-200"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
                <span className="text-xs text-slate-400">to</span>
                <Input
                  type="date"
                  className="h-8 text-xs w-36 border-slate-200"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
              onClick={() => setIsSummaryModalOpen(true)}
            >
              <FilePenLine className="h-3.5 w-3.5" />
              <span>Transfer Summary</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-1">
          <div className="relative md:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search ID/warehouse..."
              className="pl-9 text-xs h-9"
            />
          </div>
          <select
            value={fromDeviceFilter}
            onChange={(e) => setFromDeviceFilter(Number(e.target.value))}
            className="h-9 rounded-md border border-gray-300 bg-white px-2 text-xs"
          >
            <option value={0}>All From Devices</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>From: {d.name}</option>
            ))}
          </select>
          <select
            value={toDeviceFilter}
            onChange={(e) => setToDeviceFilter(Number(e.target.value))}
            className="h-9 rounded-md border border-gray-300 bg-white px-2 text-xs"
          >
            <option value={0}>All To Devices</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>To: {d.name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "all" | "pending" | "completed" | "rejected" | "cancelled")
            }
            className="h-9 rounded-md border border-gray-300 bg-white px-3 text-xs"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending Approval</option>
            <option value="approved">Approved</option>
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
            <table className="w-full min-w-[900px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="w-10 p-3 text-center text-xs font-medium text-gray-500 uppercase"></th>
                  <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">ID</th>
                  <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">From</th>
                  <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">To</th>
                  <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Items</th>
                  <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Approval Status</th>
                  <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Approved By / Date</th>
                  <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {transfers.map((transfer) => {
                  const isExpanded = expandedTransferId === transfer.id
                  const statusStr = String(transfer.approval_status || transfer.status || "").toLowerCase()
                  const isPending = statusStr === "pending" || statusStr === "pending_approval"
                  const isApproved = statusStr === "approved" || statusStr === "completed"
                  const isRejected = statusStr === "rejected"
                  const isCancelled = statusStr === "cancelled"
                  const isRecipientDevice = Number(transfer.to_device_id) === Number(userId)
                  const busy = actioningId === Number(transfer.id)

                  return (
                    <Fragment key={transfer.id}>
                      <tr 
                        className={`hover:bg-violet-50/40 cursor-pointer transition-colors ${isExpanded ? "bg-slate-50/80 font-medium" : ""}`}
                        onClick={() => toggleExpand(transfer.id, transfer)}
                      >
                        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-400 hover:text-slate-600"
                            onClick={() => toggleExpand(transfer.id, transfer)}
                            title={isExpanded ? "Collapse details" : "Expand details"}
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4 text-indigo-600" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        </td>
                        <td className="p-3 text-sm font-semibold text-blue-600">#{transfer.id}</td>
                        <td className="p-3 text-sm text-gray-700">
                          {new Date(transfer.transfer_date || transfer.created_at).toLocaleDateString()}
                        </td>
                        <td className="p-3 text-sm text-gray-700">{transfer.from_device_name}</td>
                        <td className="p-3 text-sm text-gray-700">{transfer.to_device_name}</td>
                        <td className="p-3 text-sm text-gray-700">{transfer.item_count}</td>
                        <td className="p-3 text-sm text-gray-700">{transfer.total_quantity}</td>
                        <td className="p-3 text-sm font-semibold text-gray-800">
                          {Number(transfer.total_amount || 0).toFixed(2)}
                        </td>
                        <td className="p-3">
                          {getStatusBadge(transfer.approval_status || transfer.status)}
                        </td>
                        <td className="p-3 text-xs text-gray-600">
                          {isApproved && (
                            <div>
                              <div className="font-semibold text-slate-800">{transfer.approved_by_name || `User #${transfer.approved_by || ''}`}</div>
                              <div className="text-[11px] text-slate-400">{transfer.approved_at ? new Date(transfer.approved_at).toLocaleDateString() : ""}</div>
                            </div>
                          )}
                          {isRejected && (
                            <div>
                              <div className="font-semibold text-rose-700">{transfer.rejected_by_name || `User #${transfer.rejected_by || ''}`}</div>
                              <div className="text-[11px] text-rose-400">{transfer.rejected_at ? new Date(transfer.rejected_at).toLocaleDateString() : ""}</div>
                            </div>
                          )}
                          {isPending && (
                            <span className="text-amber-600 italic">
                              {isRecipientDevice ? "Awaiting your approval" : `Awaiting ${transfer.to_device_name}`}
                            </span>
                          )}
                          {isCancelled && (
                            <span className="text-slate-400">Cancelled</span>
                          )}
                        </td>
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-wrap gap-1.5">
                            <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => handleOpenView(Number(transfer.id))}>
                              <Eye className="h-3.5 w-3.5 mr-1 text-slate-500" />
                              View
                            </Button>

                            {isPending && isRecipientDevice ? (
                              <>
                                <Button
                                  size="sm"
                                  className="h-7 text-xs px-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                                  onClick={() => handleAcceptTransfer(Number(transfer.id))}
                                  disabled={busy}
                                >
                                  {busy ? (
                                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                  ) : (
                                    <Check className="h-3.5 w-3.5 mr-1" />
                                  )}
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs px-2 text-rose-600 hover:text-rose-700 border-rose-200 hover:border-rose-300"
                                  onClick={() => openRejectDialog(Number(transfer.id))}
                                  disabled={busy}
                                >
                                  <X className="h-3.5 w-3.5 mr-1" />
                                  Reject
                                </Button>
                              </>
                            ) : null}

                            {isRejected && transfer.rejection_reason ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs px-2 text-rose-700 border-rose-200 hover:bg-rose-50"
                                onClick={() => setViewReasonModal({
                                  isOpen: true,
                                  reason: transfer.rejection_reason,
                                  rejectedBy: transfer.rejected_by_name || `User #${transfer.rejected_by || ''}`,
                                  transferId: transfer.id
                                })}
                              >
                                View Reason
                              </Button>
                            ) : null}

                            {!isRejected && !isCancelled ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs px-2"
                                  onClick={() => handleOpenEdit(Number(transfer.id))}
                                >
                                  <Pencil className="h-3.5 w-3.5 mr-1 text-slate-500" />
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs px-2 text-rose-600 hover:text-rose-700 border-rose-200 hover:border-rose-300"
                                  onClick={() => handleCancelTransfer(Number(transfer.id))}
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-1 text-rose-500" />
                                  Delete
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>

                      {/* Dropdown / Expanded Products Details Row */}
                      {isExpanded && (
                        <tr key={`expanded-${transfer.id}`} className="bg-slate-50/70 border-b border-slate-200">
                          <td colSpan={11} className="p-4 sm:p-6">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                              {/* Product Line Items Table */}
                              <div className="col-span-1 lg:col-span-2 space-y-3">
                                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b pb-2">
                                  <Layers className="h-4 w-4 text-indigo-600" />
                                  Transfer Product Details ({transfer.items?.length || transfer.item_count || 0} item{transfer.items?.length !== 1 ? 's' : ''})
                                </h4>

                                {loadingExpandedId === transfer.id ? (
                                  <div className="flex items-center justify-center p-8 text-slate-500 text-sm">
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    Loading product details...
                                  </div>
                                ) : !transfer.items || transfer.items.length === 0 ? (
                                  <div className="p-6 text-center text-slate-500 text-sm border rounded-lg bg-slate-50">
                                    No product items found for this transfer.
                                  </div>
                                ) : (
                                  <div className="rounded-lg border border-slate-200 overflow-hidden text-sm shadow-sm">
                                    <table className="w-full">
                                      <thead className="bg-slate-100/90 text-slate-600 text-xs uppercase tracking-wider font-semibold border-b border-slate-200">
                                        <tr>
                                          <th className="px-3 py-2.5 text-left">#</th>
                                          <th className="px-3 py-2.5 text-left">Product Name</th>
                                          <th className="px-3 py-2.5 text-left">Variant / Batch</th>
                                          <th className="px-3 py-2.5 text-center">Qty</th>
                                          <th className="px-3 py-2.5 text-right">Unit Cost</th>
                                          <th className="px-3 py-2.5 text-right">Total Cost</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                                        {transfer.items.map((item: any, idx: number) => {
                                          const unitCost = Number(item.unit_cost || 0)
                                          const totalCost = Number(item.total_cost || unitCost * (item.quantity || 0))
                                          return (
                                            <tr key={item.id || idx} className="hover:bg-slate-50/60 transition-colors">
                                              <td className="px-3 py-2.5 text-slate-400 font-mono text-xs">{idx + 1}</td>
                                              <td className="px-3 py-2.5 font-medium text-slate-800">
                                                <div>{item.product_name || `Product #${item.product_id}`}</div>
                                                {item.barcode && <div className="text-[11px] font-mono text-slate-400">Barcode: {item.barcode}</div>}
                                              </td>
                                              <td className="px-3 py-2.5 text-slate-600 text-xs">
                                                {item.variant_name || item.batch_number ? (
                                                  <div className="flex flex-col gap-0.5">
                                                    {item.variant_name && <span className="font-medium text-slate-700">{item.variant_name}</span>}
                                                    {item.batch_number && <span className="text-[11px] text-slate-400">Batch: {item.batch_number}</span>}
                                                  </div>
                                                ) : (
                                                  <span className="text-slate-400 italic">Default</span>
                                                )}
                                              </td>
                                              <td className="px-3 py-2.5 text-center font-bold text-slate-700">{item.quantity}</td>
                                              <td className="px-3 py-2.5 text-right text-slate-600">{formatCurrency(unitCost)}</td>
                                              <td className="px-3 py-2.5 text-right font-semibold text-slate-900">{formatCurrency(totalCost)}</td>
                                            </tr>
                                          )
                                        })}
                                      </tbody>
                                      <tfoot className="bg-slate-50 border-t border-slate-200 text-xs font-medium text-slate-700">
                                        <tr>
                                          <td colSpan={3} className="px-3 py-2 text-right font-bold text-slate-600">Total:</td>
                                          <td className="px-3 py-2 text-center font-extrabold text-slate-900">{transfer.total_quantity || transfer.items.reduce((acc: number, i: any) => acc + (i.quantity || 0), 0)}</td>
                                          <td></td>
                                          <td className="px-3 py-2 text-right font-extrabold text-slate-900">{formatCurrency(transfer.total_amount)}</td>
                                        </tr>
                                      </tfoot>
                                    </table>
                                  </div>
                                )}
                              </div>

                              {/* Transfer Summary Card */}
                              <div className="col-span-1 space-y-4 border-l border-slate-100 pl-0 lg:pl-6">
                                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 border-b pb-2">
                                  <ArrowRightLeft className="h-4 w-4 text-indigo-600" />
                                  Transfer Summary
                                </h4>

                                <div className="space-y-3 text-xs sm:text-sm text-slate-600">
                                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex justify-between items-center">
                                    <div>
                                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">From Warehouse</span>
                                      <p className="font-semibold text-slate-800">{transfer.from_device_name}</p>
                                    </div>
                                    <span className="text-slate-400">➔</span>
                                    <div className="text-right">
                                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">To Warehouse</span>
                                      <p className="font-semibold text-slate-800">{transfer.to_device_name}</p>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                                      <span className="text-[10px] font-semibold uppercase text-slate-400 block">Transfer Date</span>
                                      <span className="font-medium text-slate-800">{new Date(transfer.transfer_date || transfer.created_at).toLocaleDateString()}</span>
                                    </div>
                                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                                      <span className="text-[10px] font-semibold uppercase text-slate-400 block">Status</span>
                                      <span className="font-semibold">{getStatusBadge(transfer.status)}</span>
                                    </div>
                                  </div>

                                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-1 text-xs">
                                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1 flex items-center gap-1">
                                      <Wallet className="h-3 w-3 text-slate-400" /> Payment Summary
                                    </span>
                                    <div className="flex justify-between py-0.5">
                                      <span className="text-slate-500">Status:</span>
                                      <span className="font-semibold text-slate-800 capitalize">{transfer.payment_status || "unpaid"}</span>
                                    </div>
                                    <div className="flex justify-between py-0.5">
                                      <span className="text-slate-500">Total Amount:</span>
                                      <span className="font-bold text-slate-800">{formatCurrency(transfer.total_amount)}</span>
                                    </div>
                                    <div className="flex justify-between py-0.5">
                                      <span className="text-slate-500">Paid Amount:</span>
                                      <span className="font-bold text-emerald-600">{formatCurrency(transfer.paid_amount)}</span>
                                    </div>
                                    <div className="flex justify-between py-0.5 pt-1 border-t border-slate-200">
                                      <span className="text-slate-500 font-medium">Balance Due:</span>
                                      <span className="font-bold text-rose-600">{formatCurrency(Math.max(0, Number(transfer.total_amount || 0) - Number(transfer.paid_amount || 0)))}</span>
                                    </div>
                                    {transfer.payment_method && (
                                      <div className="flex justify-between py-0.5 text-slate-500">
                                        <span>Payment Method:</span>
                                        <span>{transfer.payment_method}</span>
                                      </div>
                                    )}
                                  </div>

                                  {transfer.notes && (
                                    <div className="bg-amber-50/60 p-3 rounded-lg border border-amber-100 text-xs">
                                      <span className="font-semibold text-amber-800 block mb-0.5">Notes:</span>
                                      <p className="text-amber-900 whitespace-pre-wrap">{transfer.notes}</p>
                                    </div>
                                  )}

                                  {transfer.rejection_reason && (
                                    <div className="bg-rose-50 p-3 rounded-lg border border-rose-100 text-xs">
                                      <span className="font-semibold text-rose-800 block mb-0.5">Rejection Reason:</span>
                                      <p className="text-rose-900">{transfer.rejection_reason}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
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
                    <div className="col-span-5 relative">
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
                          className="w-[min(460px,calc(100vw-2rem))] p-0 bg-white"
                          align="start"
                          side="bottom"
                          sideOffset={4}
                          collisionPadding={16}
                          onOpenAutoFocus={(event) => event.preventDefault()}
                          onWheel={(e) => e.stopPropagation()}
                        >
                          <div className="border-b border-gray-200 bg-white p-2">
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
                            className="max-h-[260px] overflow-y-auto overscroll-contain bg-white p-1"
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
                                    const defaultVariant = p.variants?.[0]
                                    const variantId = defaultVariant?.id || null
                                    const variantName = defaultVariant?.variant_name || null

                                    const variantBatches = !p.is_service ? p.batches?.filter((b: any) => (b.product_variant_id || null) == (variantId || null)) || [] : []
                                    const defaultBatch = variantBatches?.[0]
                                    const batchId = defaultBatch?.id || null
                                    const batchNumber = defaultBatch?.batch_number || null

                                    let resolvedStock = Number(effectiveSourceStockMap.get(p.id) || 0)
                                    if (p.has_variants) {
                                      if (!p.is_service) {
                                        resolvedStock = Number(defaultBatch?.stock || 0)
                                      } else {
                                        resolvedStock = Number(defaultVariant?.stock || 0)
                                      }
                                    }

                                    const currentQty = Number(item.quantity || 1)
                                    const defaultUnitCost = Number(
                                      defaultBatch?.purchase_price ?? defaultVariant?.wholesale_price ?? p.default_unit_cost ?? 0
                                    )

                                    setItem(idx, {
                                      product_id: p.id,
                                      quantity: resolvedStock > 0 ? Math.min(currentQty, resolvedStock) : 1,
                                      unit_cost: defaultUnitCost,
                                      product_variant_id: variantId,
                                      variant_name: variantName,
                                      batch_id: batchId,
                                      batch_number: batchNumber,
                                    })
                                    setProductOpen(idx, false)
                                  }}
                                  className="w-full text-left px-2 py-2 rounded-md hover:bg-gray-100 flex items-center justify-between gap-3 bg-white"
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
                              <p className="py-6 text-center text-sm text-gray-500 bg-white">No product found.</p>
                            ) : null}
                          </div>
                        </PopoverContent>
                      </Popover>
                      {(() => {
                        const p = products.find((x) => x.id === item.product_id)
                        if (!p) return null
                        return (
                          <>
                            {p.has_variants && p.variants && p.variants.length > 0 && (
                              <div className="mt-1 flex items-center gap-1">
                                <span className="text-[10px] text-gray-500 font-semibold uppercase shrink-0">Var:</span>
                                <select
                                  value={item.product_variant_id || ""}
                                  onChange={(e) => {
                                    const variantId = Number(e.target.value)
                                    const selectedVar = p.variants?.find((v: any) => v.id === variantId)
                                    if (selectedVar) {
                                      const defaultUnitCost = Number(selectedVar.wholesale_price ?? p.default_unit_cost ?? 0)
                                      
                                      let resolvedBatchId = null
                                      let resolvedBatchNumber = null
                                      let resolvedStock = Number(selectedVar.stock || 0)
                                      if (editOriginal && editOriginal.fromDeviceId === formData.fromDeviceId) {
                                        const originalQty = editOriginal.qtyByVariantOrBatch?.get(`variant-${variantId}`) || 0
                                        resolvedStock += Number(originalQty)
                                      }

                                      if (!p.is_service && p.batches && p.batches.length > 0) {
                                        const variantBatches = p.batches.filter((b: any) => (b.product_variant_id || null) == (variantId || null))
                                        const firstBatch = variantBatches?.[0]
                                        resolvedBatchId = firstBatch?.id || null
                                        resolvedBatchNumber = firstBatch?.batch_number || null
                                        resolvedStock = firstBatch ? Number(firstBatch.stock || 0) : 0
                                        if (firstBatch && editOriginal && editOriginal.fromDeviceId === formData.fromDeviceId) {
                                          const originalQty = editOriginal.qtyByVariantOrBatch?.get(`batch-${firstBatch.id}`) || 0
                                          resolvedStock += Number(originalQty)
                                        }
                                      }

                                      setItem(idx, {
                                        product_variant_id: variantId,
                                        variant_name: selectedVar.variant_name,
                                        unit_cost: defaultUnitCost,
                                        batch_id: resolvedBatchId,
                                        batch_number: resolvedBatchNumber,
                                        quantity: resolvedStock > 0 ? Math.min(item.quantity || 1, resolvedStock) : 1,
                                      })
                                    }
                                  }}
                                  className="text-[10px] h-6 px-1 py-0.5 rounded border border-gray-300 bg-white text-gray-900 focus:outline-none w-full"
                                >
                                  {p.variants.map((v: any) => (
                                    <option key={v.id} value={v.id}>
                                      {v.variant_name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            {!p.is_service && p.batches && (
                              <div className="mt-1 flex items-center gap-1">
                                <span className="text-[10px] text-gray-500 font-semibold uppercase shrink-0">Batch:</span>
                                <select
                                  value={item.batch_id || ""}
                                  onChange={(e) => {
                                    const batchId = Number(e.target.value)
                                    const selectedBatch = p.batches?.find((b: any) => b.id === batchId)
                                    if (selectedBatch) {
                                      const defaultUnitCost = Number(selectedBatch.purchase_price ?? selectedBatch.selling_price ?? p.default_unit_cost ?? 0)
                                      let resolvedStock = Number(selectedBatch.stock || 0)
                                      if (editOriginal && editOriginal.fromDeviceId === formData.fromDeviceId) {
                                        const originalQty = editOriginal.qtyByVariantOrBatch?.get(`batch-${batchId}`) || 0
                                        resolvedStock += Number(originalQty)
                                      }

                                      setItem(idx, {
                                        batch_id: batchId,
                                        batch_number: selectedBatch.batch_number,
                                        unit_cost: defaultUnitCost,
                                        quantity: resolvedStock > 0 ? Math.min(item.quantity || 1, resolvedStock) : 1,
                                      })
                                    }
                                  }}
                                  className="text-[10px] h-6 px-1 py-0.5 rounded border border-gray-300 bg-white text-gray-900 focus:outline-none w-full"
                                >
                                  {(p.batches || [])
                                    .filter((b: any) => (b.product_variant_id || null) == (item.product_variant_id || null))
                                    .map((b: any) => (
                                      <option key={b.id} value={b.id}>
                                        {b.batch_number} (Stock: {(() => {
                                          let s = Number(b.stock || 0)
                                          if (editOriginal && editOriginal.fromDeviceId === formData.fromDeviceId) {
                                            const originalQty = editOriginal.qtyByVariantOrBatch?.get(`batch-${b.id}`) || 0
                                            s += Number(originalQty)
                                          }
                                          return s
                                        })()}) {b.expiry_date ? `| Exp: ${new Date(b.expiry_date).toISOString().slice(0, 10)}` : ""}
                                      </option>
                                    ))}
                                </select>
                              </div>
                            )}
                          </>
                        )
                      })()}
                      {item.product_id ? (
                        <p className="text-[11px] text-red-600 mt-1">
                          available stock: {(() => {
                            const p = products.find((x) => x.id === item.product_id)
                            if (p?.has_variants) {
                              if (!p.is_service) {
                                const b = p.batches?.find((x: any) => x.id === item.batch_id)
                                let s = Number(b ? b.stock : 0)
                                if (b && editOriginal && editOriginal.fromDeviceId === formData.fromDeviceId) {
                                  const originalQty = editOriginal.qtyByVariantOrBatch?.get(`batch-${b.id}`) || 0
                                  s += Number(originalQty)
                                }
                                return s
                              }
                              const v = p.variants?.find((x: any) => x.id === item.product_variant_id)
                              let s = Number(v ? v.stock : 0)
                              if (v && editOriginal && editOriginal.fromDeviceId === formData.fromDeviceId) {
                                  const originalQty = editOriginal.qtyByVariantOrBatch?.get(`variant-${v.id}`) || 0
                                  s += Number(originalQty)
                              }
                              return s
                            }
                            return effectiveSourceStockMap.get(item.product_id) ?? 0
                          })()}
                        </p>
                      ) : null}
                    </div>
                    <div className="col-span-3">
                      <Input
                        type="number"
                        min={1}
                        max={(() => {
                          const p = products.find((x) => x.id === item.product_id)
                          if (p?.has_variants) {
                            if (!p.is_service) {
                              const b = p.batches?.find((x: any) => x.id === item.batch_id)
                              let s = Number(b ? b.stock : 1)
                              if (b && editOriginal && editOriginal.fromDeviceId === formData.fromDeviceId) {
                                const originalQty = editOriginal.qtyByVariantOrBatch?.get(`batch-${b.id}`) || 0
                                s += Number(originalQty)
                              }
                              return s
                            }
                            const v = p.variants?.find((x: any) => x.id === item.product_variant_id)
                            let s = Number(v ? v.stock : 1)
                            if (v && editOriginal && editOriginal.fromDeviceId === formData.fromDeviceId) {
                              const originalQty = editOriginal.qtyByVariantOrBatch?.get(`variant-${v.id}`) || 0
                              s += Number(originalQty)
                            }
                            return s
                          }
                          return Number(effectiveSourceStockMap.get(item.product_id) || 1)
                        })()}
                        value={item.quantity || 1}
                        onChange={(e) => {
                          const p = products.find((x) => x.id === item.product_id)
                          let maxAllowed = Number(effectiveSourceStockMap.get(item.product_id) || 1)
                          if (p?.has_variants) {
                            if (!p.is_service) {
                              const b = p.batches?.find((x: any) => x.id === item.batch_id)
                              maxAllowed = b ? Number(b.stock) : 1
                              if (b && editOriginal && editOriginal.fromDeviceId === formData.fromDeviceId) {
                                const originalQty = editOriginal.qtyByVariantOrBatch?.get(`batch-${b.id}`) || 0
                                maxAllowed += Number(originalQty)
                              }
                            } else {
                              const v = p.variants?.find((x: any) => x.id === item.product_variant_id)
                              maxAllowed = v ? Number(v.stock) : 1
                              if (v && editOriginal && editOriginal.fromDeviceId === formData.fromDeviceId) {
                                const originalQty = editOriginal.qtyByVariantOrBatch?.get(`variant-${v.id}`) || 0
                                maxAllowed += Number(originalQty)
                              }
                            }
                          }
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

              <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3 text-xs space-y-2">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider border-b border-slate-200 pb-1 flex items-center gap-1">
                  <History className="h-3.5 w-3.5 text-indigo-600" /> Audit Log & Device Approval Details
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  <div>
                    <span className="text-slate-400 block font-medium">Created By:</span>
                    <span className="font-semibold text-slate-800">{viewTransferDetail.transfer.created_by_name || `User #${viewTransferDetail.transfer.created_by}`}</span>
                    <span className="text-[11px] text-slate-400 block">{new Date(viewTransferDetail.transfer.created_at).toLocaleString()}</span>
                  </div>
                  {viewTransferDetail.transfer.approved_by && (
                    <div>
                      <span className="text-emerald-600 block font-medium">Approved By:</span>
                      <span className="font-semibold text-slate-800">{viewTransferDetail.transfer.approved_by_name || `User #${viewTransferDetail.transfer.approved_by}`}</span>
                      <span className="text-[11px] text-slate-400 block">{viewTransferDetail.transfer.approved_at ? new Date(viewTransferDetail.transfer.approved_at).toLocaleString() : ''}</span>
                    </div>
                  )}
                  {viewTransferDetail.transfer.rejected_by && (
                    <div>
                      <span className="text-rose-600 block font-medium">Rejected By:</span>
                      <span className="font-semibold text-slate-800">{viewTransferDetail.transfer.rejected_by_name || `User #${viewTransferDetail.transfer.rejected_by}`}</span>
                      <span className="text-[11px] text-slate-400 block">{viewTransferDetail.transfer.rejected_at ? new Date(viewTransferDetail.transfer.rejected_at).toLocaleString() : ''}</span>
                    </div>
                  )}
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
      {selectedWarehouseForPayment && (
        <PayWarehouseCreditModal
          isOpen={showPayWarehouseModal}
          onClose={() => {
            setShowPayWarehouseModal(false)
            setSelectedWarehouseForPayment(null)
          }}
          onSuccess={handlePaymentSuccess}
          warehouse={selectedWarehouseForPayment}
          userId={userId}
          deviceId={userId}
        />
      )}

      <Dialog
        open={!!paymentHistoryWarehouse}
        onOpenChange={(open) => {
          if (!open) {
            setPaymentHistoryWarehouse(null)
            setWarehousePayments([])
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Payments{paymentHistoryWarehouse ? ` — ${paymentHistoryWarehouse.warehouse_name}` : ""}
            </DialogTitle>
          </DialogHeader>
          {loadingWarehousePayments ? (
            <div className="flex items-center justify-center py-10 text-gray-600">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading...
            </div>
          ) : warehousePayments.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              No bulk payments recorded for this warehouse yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {warehousePayments.map((payment) => (
                <li
                  key={payment.id}
                  className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900">{formatCurrency(payment.amount)}</div>
                      <div className="text-xs text-gray-500">
                        {payment.payment_method} · {new Date(payment.transaction_date).toLocaleDateString()}
                      </div>
                      {payment.user_notes ? (
                        <div className="text-xs text-gray-500 mt-1">{payment.user_notes}</div>
                      ) : null}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-amber-600"
                        onClick={() => setEditWarehousePaymentId(payment.id)}
                      >
                        <FilePenLine className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-rose-600"
                        onClick={() => handleUndoPayment(payment.id)}
                        disabled={undoingPaymentId === payment.id}
                      >
                        {undoingPaymentId === payment.id ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Undo2 className="h-4 w-4 mr-1" />
                        )}
                        Undo
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <EditWarehousePaymentModal
        isOpen={editWarehousePaymentId != null}
        onClose={() => setEditWarehousePaymentId(null)}
        onSuccess={() => {
          setEditWarehousePaymentId(null)
          loadTransfers()
          loadSettlements()
          if (paymentHistoryWarehouse) {
            loadWarehousePayments(paymentHistoryWarehouse.warehouse_id)
          }
        }}
        paymentId={editWarehousePaymentId}
        userId={userId}
        deviceId={userId}
      />

      {/* Transfer Summary Modal */}
      <Dialog open={isSummaryModalOpen} onOpenChange={setIsSummaryModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center justify-between border-b pb-3 gap-2">
              <span className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FilePenLine className="h-5 w-5 text-indigo-600" />
                Transfer Summary Report
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1 border-slate-300 hover:bg-slate-50" onClick={handleExportExcel}>
                  <ArrowRightLeft className="h-3.5 w-3.5 text-emerald-600" />
                  Export Excel / CSV
                </Button>
                <Button size="sm" className="h-8 text-xs gap-1 bg-indigo-600 hover:bg-indigo-700 text-white" onClick={handleExportPDF}>
                  Download PDF / Print
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Modal Interactive Date & Time Filter Bar */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2.5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider mr-1 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-indigo-600" /> Filter Time & Date:
                  </span>
                  {[
                    { id: "all", label: "All" },
                    { id: "today", label: "Today" },
                    { id: "yesterday", label: "Yesterday" },
                    { id: "this_week", label: "This Week" },
                    { id: "this_month", label: "This Month" },
                    { id: "custom", label: "Custom Range" },
                  ].map((p) => (
                    <Button
                      key={p.id}
                      type="button"
                      variant={datePreset === p.id ? "default" : "outline"}
                      size="sm"
                      className={`h-7 text-xs px-2.5 font-medium ${
                        datePreset === p.id
                          ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                          : "border-slate-200 text-slate-600 bg-white hover:bg-slate-50"
                      }`}
                      onClick={() => setDatePreset(p.id)}
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
                <div className="text-xs text-slate-500 font-medium bg-white px-2.5 py-1 rounded-md border border-slate-200">
                  Total Transfers: <strong className="text-slate-900 font-bold ml-1">{transfers.length}</strong>
                </div>
              </div>

              {/* From & To Device Filter Row */}
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-200 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-700">From Device:</span>
                  <select
                    value={fromDeviceFilter}
                    onChange={(e) => setFromDeviceFilter(Number(e.target.value))}
                    className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value={0}>All From Devices</option>
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-700">To Device:</span>
                  <select
                    value={toDeviceFilter}
                    onChange={(e) => setToDeviceFilter(Number(e.target.value))}
                    className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value={0}>All To Devices</option>
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                {datePreset === "custom" && (
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="font-semibold text-slate-600">From Date:</span>
                    <Input
                      type="date"
                      className="h-8 text-xs w-36 border-slate-300 bg-white"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                    />
                    <span className="font-semibold text-slate-600">To Date:</span>
                    <Input
                      type="date"
                      className="h-8 text-xs w-36 border-slate-300 bg-white"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>

            {transfers.length === 0 ? (
              <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
                No transfer records found for the selected date filter.
              </div>
            ) : (
              <div className="space-y-4">
                {transfers.map((t) => (
                  <div key={t.id} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
                    <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-blue-600 text-sm">#{t.id}</span>
                        <span className="text-slate-400">•</span>
                        <span className="text-slate-600">{new Date(t.transfer_date || t.created_at).toLocaleDateString()}</span>
                        <span className="text-slate-400">•</span>
                        <span className="font-semibold text-slate-800">{t.from_device_name} &rarr; {t.to_device_name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {getStatusBadge(t.approval_status || t.status)}
                        <span className="font-bold text-slate-900 text-sm">{formatCurrency(t.total_amount)}</span>
                      </div>
                    </div>

                    {/* Detailed Line Items */}
                    <div className="p-3">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-100 text-slate-400 font-semibold text-[11px]">
                            <th className="py-1 px-2">Product</th>
                            <th className="py-1 px-2">Variant / Batch</th>
                            <th className="py-1 px-2 text-right">Qty</th>
                            <th className="py-1 px-2 text-right">Unit Cost</th>
                            <th className="py-1 px-2 text-right">Line Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {t.items && t.items.length > 0 ? (
                            t.items.map((item: any, idx: number) => (
                              <tr key={item.id || idx} className="hover:bg-slate-50/50 text-slate-700">
                                <td className="py-1.5 px-2 font-medium">{item.product_name || `Product #${item.product_id}`}</td>
                                <td className="py-1.5 px-2 text-slate-500">{item.variant_name || item.batch_number || "-"}</td>
                                <td className="py-1.5 px-2 text-right font-medium">{item.quantity || 0}</td>
                                <td className="py-1.5 px-2 text-right text-slate-500">{formatCurrency(item.unit_cost)}</td>
                                <td className="py-1.5 px-2 text-right font-semibold text-slate-900">{formatCurrency(item.total_cost)}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={5} className="py-2 text-center text-slate-400 italic">No line items listed</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Bottom Overall Summary Footer */}
            <div className="bg-slate-900 text-white p-4 rounded-xl space-y-2 font-mono text-sm shadow-md">
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span>Total Transfers Count:</span>
                <span className="font-bold text-amber-400">{transfers.length}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span>Total Items Transferred:</span>
                <span className="font-bold text-amber-400">
                  {transfers.reduce((sum, t) => sum + Number(t.total_quantity || 0), 0)}
                </span>
              </div>
              <div className="flex justify-between text-base pt-1">
                <span>Overall Total Amount (Filtered):</span>
                <span className="font-extrabold text-emerald-400">
                  {formatCurrency(transfers.reduce((sum, t) => sum + Number(t.total_amount || 0), 0))}
                </span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Rejection Reason Modal */}
      <Dialog open={viewReasonModal.isOpen} onOpenChange={(open) => setViewReasonModal((prev) => ({ ...prev, isOpen: open }))}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-rose-700 flex items-center gap-2">
              <X className="h-5 w-5 text-rose-600" />
              Transfer #{viewReasonModal.transferId} Rejected
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs space-y-2">
              <div>
                <span className="text-slate-500 block font-semibold">Rejected By:</span>
                <span className="text-slate-800 font-medium">{viewReasonModal.rejectedBy || "System"}</span>
              </div>
              <div>
                <span className="text-slate-500 block font-semibold">Rejection Reason:</span>
                <p className="text-rose-900 font-semibold text-sm mt-1">{viewReasonModal.reason}</p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setViewReasonModal((prev) => ({ ...prev, isOpen: false }))}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {ConfirmDialog}
    </div>
  )
}
