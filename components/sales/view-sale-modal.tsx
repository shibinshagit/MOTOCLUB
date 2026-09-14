"use client"

import { useState, useEffect, type ReactNode } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Edit, Loader2, Package, Printer, RefreshCw, RotateCcw, Trash2, Wrench } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"
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
import { FormAlert } from "@/components/ui/form-alert"
import { format } from "date-fns"
import { useSelector } from "react-redux"
import { selectDeviceCurrency, selectDeviceId } from "@/store/slices/deviceSlice"
import { printSalesReceipt } from "@/lib/receipt-utils"
import { getSaleDetails, updateSale, updateSaleDeliveryStatus } from "@/app/actions/sale-actions"
import { getProductById } from "@/app/actions/product-actions"
import { ProductDetailSlider } from "@/components/products/product-detail-slider"
import ReturnSaleModal from "@/components/sales/return-sale-modal"
import { CreateReplacementModal } from "@/components/sales/create-replacement-modal"
import { ReplacementShipmentCard } from "@/components/sales/replacement-shipment-card"
import { buildTrackingUrl, mapSaleShippingFromRecord } from "@/lib/sale-shipping"
import { StaffOwnerSelect } from "@/components/sales/staff-owner-select"
import { cn } from "@/lib/utils"

interface ViewSaleModalProps {
  isOpen: boolean
  onClose: () => void
  saleId: number | null
  currency?: string
  onEdit?: (saleData: any) => void
  onDelete?: (saleId: number) => void | Promise<void>
  onPrintInvoice?: (saleId: number) => void
  isDeleting?: boolean
}

function SaleStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Credit: "bg-amber-50 text-amber-700 border-amber-200",
    Cancelled: "bg-rose-50 text-rose-700 border-rose-200",
    Returned: "bg-purple-50 text-purple-700 border-purple-200",
    Pending: "bg-amber-50 text-amber-700 border-amber-200",
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        styles[status] || "border-border bg-muted text-muted-foreground"
      }`}
    >
      {status}
    </span>
  )
}

function DeliveryStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Pending: "bg-amber-50 text-amber-700 border-amber-200",
    Packed: "bg-blue-50 text-blue-700 border-blue-200",
    Shipped: "bg-violet-50 text-violet-700 border-violet-200",
    "In transit": "bg-indigo-50 text-indigo-700 border-indigo-200",
    Delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Returned: "bg-rose-50 text-rose-700 border-rose-200",
    Failed: "bg-rose-50 text-rose-700 border-rose-200",
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        styles[status] || "border-border bg-muted text-muted-foreground"
      }`}
    >
      {status}
    </span>
  )
}

function InfoCell({ label, value, className = "" }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={`border-b border-slate-200 px-4 py-3 ${className}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1 text-sm font-medium text-slate-800">{value}</div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "violet" | "emerald" | "amber" | "blue" | "slate"
}) {
  const tones = {
    violet: "border-violet-100 bg-violet-50 text-violet-700",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    slate: "border-border bg-muted/40 text-foreground",
  }

  return (
    <div className={`rounded-lg border px-3 py-2 ${tones[tone]}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  )
}

export default function ViewSaleModal({
  isOpen,
  onClose,
  saleId,
  currency,
  onEdit,
  onDelete,
  onPrintInvoice,
  isDeleting = false,
}: ViewSaleModalProps) {
  const [saleData, setSaleData] = useState<any>(null)
  const [saleItems, setSaleItems] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isDeletingLocal, setIsDeletingLocal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailProduct, setDetailProduct] = useState<any>(null)
  const [selectedServiceItem, setSelectedServiceItem] = useState<any>(null)
  const [isServiceViewOpen, setIsServiceViewOpen] = useState(false)
  const [isItemLoading, setIsItemLoading] = useState(false)
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false)
  const [isReplacementModalOpen, setIsReplacementModalOpen] = useState(false)
  const [isUpdatingDelivery, setIsUpdatingDelivery] = useState(false)
  const { toast } = useToast()

  const closeDetailProduct = () => setDetailProduct(null)

  const reloadSaleDetails = async () => {
    if (!saleId) return
    try {
      setIsLoading(true)
      const refreshResult = await getSaleDetails(saleId)
      if (refreshResult.success && refreshResult.data) {
        setSaleData(refreshResult.data.sale)
        setSaleItems(refreshResult.data.items || [])
      }
    } catch {
      notifyError(toast, "Failed to refresh sale details")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    return () => {
      document.body.style.pointerEvents = ""
    }
  }, [])

  const deviceCurrency = useSelector(selectDeviceCurrency) || currency || "AED"
  const deviceId = useSelector(selectDeviceId)

  const formatCurrency = (amount: number | string) => {
    const numAmount = typeof amount === "string" ? Number.parseFloat(amount) : amount
    if (isNaN(numAmount)) return `${deviceCurrency} 0.00`
    return `${deviceCurrency} ${numAmount.toFixed(2)}`
  }

  useEffect(() => {
    const fetchSaleData = async () => {
      if (!isOpen || !saleId) {
        setSaleData(null)
        setSaleItems([])
        setError(null)
        setDetailProduct(null)
        return
      }

      try {
        setIsLoading(true)
        setError(null)

        const result = await getSaleDetails(saleId)

        if (result.success && result.data) {
          setSaleData(result.data.sale)
          setSaleItems(result.data.items || [])
        } else {
          setError(result.message || "Failed to load sale details")
        }
      } catch {
        setError("An error occurred while loading sale details")
      } finally {
        setIsLoading(false)
      }
    }

    fetchSaleData()
  }, [isOpen, saleId])

  const calculateTotals = () => {
    if (!saleData) {
      return { subtotal: 0, total: 0, remaining: 0 }
    }

    // Use the DB-stored total_amount as the authoritative total (it already includes courier_paid_extra)
    const total = Number.parseFloat(saleData.total_amount) || 0
    const discount = Number.parseFloat(saleData.discount) || 0
    const courierPaidExtra = saleData.fulfillment_type === "ship" ? Number(saleData.courier_paid_extra) || 0 : 0

    // Subtotal = items sum (without courier or discount adjustments)
    let subtotal = 0
    if (saleItems && saleItems.length > 0) {
      subtotal = saleItems.reduce((sum: number, item: any) => {
        const price = Number.parseFloat(item.price) || 0
        const quantity = Number.parseInt(item.quantity) || 0
        return sum + price * quantity
      }, 0)
    } else {
      // Fallback: derive from stored total
      subtotal = total - courierPaidExtra + discount
    }

    const receivedAmount = Number.parseFloat(saleData.received_amount) || 0
    const remaining = Math.max(0, total - receivedAmount)

    return { subtotal, total, remaining }
  }

  const { subtotal, total, remaining } = calculateTotals()


  const getDisplayValue = (value: any, fallback = "—") => {
    if (value === null || value === undefined || value === "") return fallback
    return value
  }

  const getStatusDisplay = (sale: any) => {
    if (!sale) return "Pending"
    if (sale.status === "Cancelled") return "Cancelled"
    if (sale.status === "Returned") return "Returned"
    const pStatus = sale.payment_status?.toLowerCase()
    if (pStatus === "paid" || pStatus === "completed") return "Completed"
    if (pStatus === "credit" || pStatus === "partial") return "Credit"
    return "Pending"
  }

  const getPaymentMethodDisplay = (paymentMethod: any) => {
    if (saleData && Array.isArray(saleData.payments) && saleData.payments.length > 1) {
      return saleData.payments.map((p: any) => `${p.paymentMethod} (${formatCurrency(p.amount)})`).join(" + ")
    }
    if (!paymentMethod) return "Cash"
    return paymentMethod
  }

  const getReceivedAmount = () => {
    if (!saleData) return 0
    return Number.parseFloat(saleData.received_amount) || 0
  }

  const getRemainingAmount = () => {
    if (!saleData) return 0

    if (saleData.payment_status === "Paid" || saleData.payment_status === "Completed") {
      return 0
    }

    if (saleData.balance_amount !== undefined && saleData.balance_amount !== null) {
      const balance = Number(saleData.balance_amount)
      if (balance > 0) return balance
    }

    if (saleData.outstanding_amount !== undefined && saleData.outstanding_amount !== null) {
      return Number.parseFloat(saleData.outstanding_amount) || 0
    }

    const saleTotal = Number.parseFloat(saleData.total_amount) || 0
    const received = getReceivedAmount()
    return Math.max(0, saleTotal - received)
  }

  const refreshSaleData = async () => {
    if (!saleId) return
    const result = await getSaleDetails(saleId)
    if (result.success && result.data) {
      setSaleData(result.data.sale)
      setSaleItems(result.data.items || [])
    }
  }

  const handleDeliveryStatusUpdate = async (deliveryStatus: string) => {
    if (!saleId || !deviceId) return

    setIsUpdatingDelivery(true)
    try {
      const result = await updateSaleDeliveryStatus(saleId, deviceId, deliveryStatus)
      if (result.success) {
        notifySuccess(toast, result.message || "Delivery status updated")
        await refreshSaleData()
      } else {
        notifyError(toast, result.message || "Failed to update delivery status")
      }
    } catch {
      notifyError(toast, "Failed to update delivery status")
    } finally {
      setIsUpdatingDelivery(false)
    }
  }

  const handleEdit = () => {
    if (onEdit && saleData) {
      onEdit(saleData)
    }
  }

  const handleDelete = async () => {
    if (!onDelete || !saleId || isDeleting || isDeletingLocal) return
    try {
      setIsDeletingLocal(true)
      await onDelete(saleId)
    } catch (err) {
      console.error("Delete sale error:", err)
      notifyError(toast, "Failed to delete sale")
    } finally {
      setIsDeletingLocal(false)
    }
  }

  const handleReturn = () => {
    if (!saleData || !saleId) return

    if (saleData.status === "Cancelled") {
      notifyError(toast, "Cannot return items for a cancelled sale", "Cannot Return Sale")
      return
    }

    const hasReturnableItems = saleItems.some(
      (item: any) => (Number(item.quantity) || 0) - (Number(item.returned_quantity) || 0) > 0
    )

    if (!hasReturnableItems) {
      notifyError(toast, "All items in this sale have already been fully returned", "No Returnable Items")
      return
    }

    setIsReturnModalOpen(true)
  }

  const handlePrintInvoice = () => {
    if (saleData && saleItems.length > 0) {
      printSalesReceipt(saleData, saleItems, deviceCurrency, {}, false)
    } else {
      notifyError(toast, "Cannot print invoice - sale data not loaded")
    }
  }

  const handleItemRowClick = async (item: any) => {
    const isService = item.item_type === "service" || !!item.service_name

    if (isService) {
      setSelectedServiceItem(item)
      setIsServiceViewOpen(true)
      return
    }

    if (!item.product_id) {
      notifyError(toast, "Product details are not available for this line item")
      return
    }

    try {
      setIsItemLoading(true)
      const result = await getProductById(item.product_id, deviceId || undefined)
      if (result.success && result.data) {
        setDetailProduct(result.data)
      } else {
        notifyError(toast, result.message || "Failed to load product details")
      }
    } catch {
      notifyError(toast, "An error occurred while loading product details")
    } finally {
      setIsItemLoading(false)
    }
  }

  const formatSaleDate = (dateValue: string | null | undefined) => {
    if (!dateValue) return "—"
    try {
      return format(new Date(dateValue), "yyyy-MM-dd")
    } catch {
      return "Invalid date"
    }
  }

  const SaleDetailsSkeleton = () => (
    <div className="space-y-3 p-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-56 rounded-xl" />
    </div>
  )

  const status = saleData ? getStatusDisplay(saleData) : "Pending"
  const received = saleData ? getReceivedAmount() : 0
  const balance = saleData ? getRemainingAmount() : 0
  const deleteInProgress = isDeleting || isDeletingLocal

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && !deleteInProgress && onClose()}>
        <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-5xl gap-0 overflow-hidden border-slate-200 p-0 duration-0 data-[state=open]:animate-none data-[state=closed]:animate-none [&>button]:top-3 [&>button]:right-3">
          <DialogHeader className="space-y-0 border-b border-slate-200 bg-[#F1F4F9] px-4 py-3 text-left">
            <DialogTitle className="sr-only">Sale {saleId ? `#${saleId}` : "details"}</DialogTitle>
            <div className="flex flex-wrap items-center gap-2 pr-10">
              <Button
                variant="outline"
                size="sm"
                onClick={handleEdit}
                disabled={isLoading || !saleData}
                className="h-8 border-slate-200 bg-white px-3 text-xs"
              >
                <Edit className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleReturn}
                disabled={isLoading || !saleData || saleData.status !== "Completed"}
                className="h-8 border-amber-200 bg-white px-3 text-xs text-amber-700 hover:bg-amber-50"
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Return
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsReplacementModalOpen(true)}
                disabled={isLoading || !saleData || saleData.status === "Cancelled"}
                className="h-8 border-blue-200 bg-white px-3 text-xs text-blue-700 hover:bg-blue-50"
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5 text-blue-600" />
                Create Replacement
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrintInvoice}
                disabled={isLoading || !saleData || !saleItems.length}
                className="h-8 border-slate-200 bg-white px-3 text-xs"
              >
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                Print
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={isLoading || deleteInProgress}
                className="h-8 border-rose-200 bg-white px-3 text-xs text-rose-700 hover:bg-rose-50"
              >
                {deleteInProgress ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                )}
                Delete
              </Button>
            </div>
          </DialogHeader>

          <div className="relative min-h-0 max-h-[calc(90vh-5.5rem)] overflow-hidden">
          {isLoading ? (
            <SaleDetailsSkeleton />
          ) : error ? (
            <div className="space-y-4 p-4">
              <FormAlert type="error" message={error} />
              <div className="flex justify-end">
                <Button onClick={onClose} variant="outline" size="sm">
                  Close
                </Button>
              </div>
            </div>
          ) : !saleData ? (
            <div className="space-y-4 p-8 text-center">
              <p className="text-sm text-muted-foreground">Sale not found</p>
              <Button onClick={onClose} variant="outline" size="sm">
                Close
              </Button>
            </div>
          ) : (
            <div className="h-full space-y-3 overflow-y-auto p-4">
              <div className={`grid grid-cols-2 gap-2 ${saleData.total_refund_paid > 0 ? "md:grid-cols-5" : "md:grid-cols-4"}`}>
                <SummaryCard label="Total" value={formatCurrency(total)} tone="violet" />
                <SummaryCard label="Received" value={formatCurrency(received)} tone="emerald" />
                <SummaryCard
                  label="Balance"
                  value={balance > 0 ? formatCurrency(balance) : "—"}
                  tone="amber"
                />
                <SummaryCard label="Discount" value={formatCurrency(saleData.discount || 0)} tone="slate" />
                {saleData.total_refund_paid > 0 ? (
                  <SummaryCard label="Refund Paid" value={formatCurrency(saleData.total_refund_paid)} tone="amber" />
                ) : null}
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-card">
                <div className="border-b border-slate-200 bg-[#F1F4F9] px-4 py-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Sale information</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                  <InfoCell label="Sale #" value={`#${saleData.id}`} />
                  <InfoCell label="Date" value={formatSaleDate(saleData.sale_date)} />
                  <InfoCell label="Status" value={<SaleStatusBadge status={status} />} />
                  <InfoCell
                    label="Fulfillment"
                    value={
                      saleData.fulfillment_type === "ship" ? (
                        <DeliveryStatusBadge status={saleData.delivery_status || "Pending"} />
                      ) : (
                        "Pickup"
                      )
                    }
                  />
                  <InfoCell label="Payment" value={getPaymentMethodDisplay(saleData.payment_method)} />
                  <InfoCell label="Customer" value={saleData.customer_name || "Walk-in Customer"} />
                  <div className="border-b border-slate-200 px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Staff / Assigned Owner</p>
                    <div className="mt-1">
                      <StaffOwnerSelect
                        saleId={saleData.id}
                        deviceId={saleData.device_id || deviceId || 0}
                        currentStaffId={saleData.staff_id}
                        currentStaffName={saleData.staff_name}
                        onUpdate={() => {
                          reloadSaleDetails()
                        }}
                      />
                    </div>
                  </div>
                  <InfoCell label="Phone" value={getDisplayValue(saleData.customer_phone)} />
                  <InfoCell label="Email" value={getDisplayValue(saleData.customer_email)} />
                  {saleData.customer_address ? (
                    <InfoCell
                      label="Address"
                      value={saleData.customer_address}
                      className="sm:col-span-2 lg:col-span-4"
                    />
                  ) : null}
                </div>
              </div>

              {Array.isArray(saleData.payments) && saleData.payments.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-card mb-4">
                  <div className="border-b border-slate-200 bg-[#F1F4F9] px-4 py-2 flex justify-between items-center">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Payment Breakdown</h3>
                    <span className="text-xs text-slate-500 font-medium">{saleData.payments.length} payment method{saleData.payments.length > 1 ? "s" : ""}</span>
                  </div>
                  <div className="p-3 divide-y divide-slate-100">
                    {saleData.payments.map((p: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center py-1.5 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-800">{p.paymentMethod}</span>
                          {p.referenceNumber ? <span className="text-slate-400 font-mono text-[11px]">(Ref: {p.referenceNumber})</span> : null}
                          {p.notes ? <span className="text-slate-400 italic text-[11px]">- {p.notes}</span> : null}
                        </div>
                        <span className="font-semibold text-slate-900">{formatCurrency(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-card">
                <div className="flex items-center justify-between border-b border-slate-200 bg-[#F1F4F9] px-4 py-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Line items</h3>
                  <span className="text-xs text-slate-500">
                    {saleItems.length} item{saleItems.length === 1 ? "" : "s"} · click row for details
                  </span>
                </div>

                {saleItems.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No line items available · Total {formatCurrency(saleData.total_amount || 0)}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-separate border-spacing-0 text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-[#F1F4F9] text-xs font-semibold uppercase tracking-wide text-slate-600">
                          <th className="whitespace-nowrap px-4 py-2.5 text-left">#</th>
                          <th className="whitespace-nowrap px-4 py-2.5 text-left">Item</th>
                          <th className="whitespace-nowrap px-4 py-2.5 text-left">Variant/Batch</th>
                          <th className="whitespace-nowrap px-4 py-2.5 text-center">Qty</th>
                          <th className="whitespace-nowrap px-4 py-2.5 text-right">Unit price</th>
                          <th className="whitespace-nowrap px-4 py-2.5 text-right">Cost</th>
                          <th className="whitespace-nowrap px-4 py-2.5 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {saleItems.map((item: any, index: number) => {
                          const isService = item.item_type === "service" || !!item.service_name
                          const itemName = isService ? item.service_name : item.product_name
                          const lineTotal =
                            (Number.parseFloat(item.price) || 0) * (Number.parseInt(item.quantity) || 0)

                          return (
                            <tr
                              key={item.id ?? index}
                              onClick={() => handleItemRowClick(item)}
                              className={`cursor-pointer border-b border-slate-200 transition-colors hover:bg-violet-50/50 ${
                                index % 2 === 0 ? "bg-white" : "bg-slate-50/60"
                              } ${isItemLoading ? "pointer-events-none opacity-70" : ""}`}
                            >
                              <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                                {index + 1}
                              </td>
                              <td className="max-w-[240px] px-4 py-2.5">
                                <div className="flex items-start gap-2">
                                  {isService ? (
                                    <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                                  ) : (
                                    <Package className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                                  )}
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-slate-800">
                                      {getDisplayValue(itemName)}
                                    </p>
                                    <p className="text-[11px] text-slate-500">
                                      {isService ? "Service" : "Product"}
                                    </p>
                                    {item.notes ? (
                                      <p className="mt-0.5 truncate text-[11px] italic text-slate-500">
                                        {item.notes}
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-4 py-2.5 text-left">
                                <div className="text-xs font-medium text-slate-700 flex flex-col gap-0.5">
                                  {item.variant_name ? (
                                    <>
                                      <span>{item.variant_name}</span>
                                      {item.allocations && item.allocations.length > 0 ? (
                                        <div className="text-[10px] text-slate-500 font-normal">
                                          {item.allocations.map((a: any, idx: number) => (
                                            <div key={idx}>{a.batchNumber || 'Unknown'} (x{a.quantity})</div>
                                          ))}
                                        </div>
                                      ) : item.batch_number ? (
                                        <span className="text-[10px] text-slate-500 font-normal">{item.batch_number}</span>
                                      ) : null}
                                    </>
                                  ) : (
                                    "—"
                                  )}
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-4 py-2.5 text-center text-slate-800">
                                {Number(item.returned_quantity) > 0 ? (
                                  <div className="flex flex-col items-center gap-0.5 text-xs">
                                    <span className="font-semibold text-slate-900">Sold: {item.quantity}</span>
                                    <span className="text-[10px] text-amber-700 font-medium bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                      Ret: {item.returned_quantity}
                                    </span>
                                    <span className="text-[10px] text-emerald-700 font-medium">
                                      Rem: {item.remaining_quantity ?? Math.max(0, Number(item.quantity) - Number(item.returned_quantity))}
                                    </span>
                                  </div>
                                ) : (
                                  getDisplayValue(item.quantity, "0")
                                )}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2.5 text-right text-slate-800">
                                {formatCurrency(item.price || 0)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2.5 text-right text-slate-600">
                                {formatCurrency(item.actual_cost || item.cost || 0)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-slate-800">
                                {formatCurrency(lineTotal)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-slate-200 bg-[#F1F4F9]">
                          <td colSpan={5} className="px-4 py-2.5 text-right text-xs font-semibold uppercase text-slate-600">
                            Subtotal
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right text-sm font-semibold text-slate-900">
                            {formatCurrency(subtotal)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {saleData.fulfillment_type === "ship" ? (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-card">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-[#F1F4F9] px-4 py-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                      Shipping & delivery
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                    <InfoCell
                      label="Delivery status"
                      value={<DeliveryStatusBadge status={saleData.delivery_status || "Pending"} />}
                    />
                    <InfoCell label="Courier" value={saleData.courier_service_name || "—"} />
                    <InfoCell label="Packaging" value={saleData.packaging_type_name || "—"} />
                    <InfoCell
                      label="Tracking ID"
                      value={
                        saleData.tracking_id ? (
                          (() => {
                            const shipping = mapSaleShippingFromRecord(saleData)
                            const trackingUrl = buildTrackingUrl(
                              saleData.tracking_url_template,
                              shipping.trackingId,
                            )
                            return trackingUrl ? (
                              <a
                                href={trackingUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-violet-700 underline"
                              >
                                {saleData.tracking_id}
                              </a>
                            ) : (
                              saleData.tracking_id
                            )
                          })()
                        ) : (
                          "—"
                        )
                      }
                    />
                    <InfoCell
                      label="Package"
                      value={
                        saleData.weight_kg
                          ? `${saleData.weight_kg} kg${
                              saleData.length_cm
                                ? ` · ${saleData.length_cm}×${saleData.width_cm}×${saleData.height_cm} cm`
                                : ""
                            }`
                          : saleData.packaging_type_name || "—"
                      }
                    />
                    <InfoCell
                      label="Shipping address"
                      value={saleData.shipping_address || saleData.customer_address || "—"}
                      className="sm:col-span-2 lg:col-span-4"
                    />
                    <InfoCell
                      label="Courier paid (extra)"
                      value={formatCurrency(saleData.courier_paid_extra || 0)}
                    />
                    <InfoCell label="Expense: courier" value={formatCurrency(saleData.expense_courier || 0)} />
                    <InfoCell label="Expense: packing" value={formatCurrency(saleData.expense_packing || 0)} />
                    {saleData.shipping_notes ? (
                      <InfoCell
                        label="Shipping notes"
                        value={saleData.shipping_notes}
                        className="sm:col-span-2 lg:col-span-4"
                      />
                    ) : null}
                  </div>
                </div>
              ) : null}

              {saleData.replacements && saleData.replacements.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-blue-200 bg-card mb-4">
                  <div className="border-b border-blue-200 bg-blue-50/80 px-4 py-2 flex justify-between items-center">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-900 flex items-center gap-1.5">
                      <RefreshCw className="h-3.5 w-3.5 text-blue-600" />
                      Replacement Shipments History
                    </h3>
                    <span className="text-xs text-blue-700 font-semibold">
                      {saleData.replacements.length} replacement shipment{saleData.replacements.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="p-4 space-y-3">
                    {saleData.replacements.map((rep: any) => (
                      <ReplacementShipmentCard
                        key={rep.id}
                        replacement={rep}
                        originalSaleId={saleData.id}
                        customerName={saleData.customer_name}
                        customerPhone={saleData.customer_phone}
                        shippingAddress={saleData.shipping_address || saleData.customer_address}
                        trackingUrlTemplate={saleData.tracking_url_template}
                        onRefresh={reloadSaleDetails}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {saleData.returns && saleData.returns.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-card mb-4">
                  <div className="border-b border-slate-200 bg-[#F1F4F9] px-4 py-2 flex justify-between items-center">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Return History</h3>
                    <span className="text-xs text-amber-700 font-semibold">{saleData.returns.length} return transaction{saleData.returns.length > 1 ? "s" : ""}</span>
                  </div>
                  <div className="p-4 space-y-3">
                    {saleData.returns.map((ret: any) => (
                      <div key={ret.id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{ret.returnNumber}</span>
                            <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                              {ret.status}
                            </span>
                          </div>
                          <span className="text-slate-500">
                            {formatSaleDate(ret.createdAt)} · By {ret.createdByName}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-1 text-slate-700">
                          <div>
                            <span className="text-slate-500 font-normal">Calculated Value: </span>
                            <span className="font-semibold">{formatCurrency(ret.calculatedReturnValue)}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 font-normal">Refund Paid: </span>
                            <span className="font-bold text-amber-800">{formatCurrency(ret.refundAmount)}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 font-normal">Payment Method: </span>
                            <span className="font-semibold">{ret.refundPaymentMethod}</span>
                          </div>
                        </div>

                        {ret.items && ret.items.length > 0 ? (
                          <div className="rounded border border-slate-200 bg-white p-2 text-[11px] text-slate-700">
                            <span className="font-semibold text-slate-600 block mb-1">Returned Items:</span>
                            <div className="flex flex-wrap gap-x-4 gap-y-1">
                              {ret.items.map((ri: any) => (
                                <span key={ri.id}>
                                  • {ri.productName}{ri.variantName ? ` (${ri.variantName})` : ""} × <strong className="text-slate-900">{ri.returnedQuantity}</strong>
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {ret.reason ? (
                          <p className="text-[11px] text-slate-500 italic">
                            Reason: {ret.reason}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {saleData.notes ? (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-card">
                  <div className="border-b border-slate-200 bg-[#F1F4F9] px-4 py-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Notes</h3>
                  </div>
                  <div className="px-4 py-3 text-sm text-slate-700">{saleData.notes}</div>
                </div>
              ) : null}
            </div>
          )}

          {detailProduct ? (
            <ProductDetailSlider
              portaled={false}
              product={detailProduct}
              onClose={closeDetailProduct}
              currency={deviceCurrency}
              privacyMode={false}
              userId={deviceId || undefined}
            />
          ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isServiceViewOpen} onOpenChange={(open) => !open && setIsServiceViewOpen(false)}>
        <DialogContent className="max-w-lg gap-0 overflow-hidden border-slate-200 p-0 sm:max-w-lg [&>button]:top-3 [&>button]:right-3">
          <DialogHeader className="border-b border-slate-200 bg-[#F1F4F9] px-4 py-3 pr-10 text-left">
            <DialogTitle className="text-base font-semibold text-slate-900">Service details</DialogTitle>
            {selectedServiceItem ? (
              <p className="text-xs text-slate-600">{selectedServiceItem.service_name}</p>
            ) : null}
          </DialogHeader>
          {selectedServiceItem ? (
            <div className="grid grid-cols-1 sm:grid-cols-2">
              <InfoCell label="Service" value={selectedServiceItem.service_name || "—"} />
              <InfoCell label="Category" value={getDisplayValue(selectedServiceItem.service_category)} />
              <InfoCell label="Quantity" value={getDisplayValue(selectedServiceItem.quantity, "0")} />
              <InfoCell label="Unit price" value={formatCurrency(selectedServiceItem.price || 0)} />
              <InfoCell label="Cost" value={formatCurrency(selectedServiceItem.actual_cost || selectedServiceItem.cost || 0)} />
              <InfoCell
                label="Line total"
                value={formatCurrency(
                  (Number.parseFloat(selectedServiceItem.price) || 0) *
                    (Number.parseInt(selectedServiceItem.quantity) || 0),
                )}
              />
              {selectedServiceItem.duration_minutes ? (
                <InfoCell label="Duration" value={`${selectedServiceItem.duration_minutes} min`} />
              ) : null}
              {selectedServiceItem.service_description ? (
                <InfoCell
                  label="Description"
                  value={selectedServiceItem.service_description}
                  className="sm:col-span-2"
                />
              ) : null}
              {selectedServiceItem.notes ? (
                <InfoCell label="Notes" value={selectedServiceItem.notes} className="sm:col-span-2" />
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ReturnSaleModal
        isOpen={isReturnModalOpen}
        onClose={() => setIsReturnModalOpen(false)}
        saleId={saleId}
        saleData={saleData}
        saleItems={saleItems}
        currency={deviceCurrency}
        onSuccess={reloadSaleDetails}
      />

      {saleData ? (
        <CreateReplacementModal
          isOpen={isReplacementModalOpen}
          onClose={() => setIsReplacementModalOpen(false)}
          sale={saleData}
          saleItems={saleItems}
          onSuccess={reloadSaleDetails}
        />
      ) : null}
    </>
  )
}
