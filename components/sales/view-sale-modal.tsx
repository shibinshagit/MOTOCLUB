"use client"

import { useState, useEffect, type ReactNode } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Edit, Loader2, Package, Printer, RotateCcw, Trash2, Wrench } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"
import { useConfirm } from "@/hooks/use-confirm"
import { FormAlert } from "@/components/ui/form-alert"
import { format } from "date-fns"
import { useSelector } from "react-redux"
import { selectDeviceCurrency, selectDeviceId } from "@/store/slices/deviceSlice"
import { printSalesReceipt } from "@/lib/receipt-utils"
import { getSaleDetails, updateSale, updateSaleDeliveryStatus } from "@/app/actions/sale-actions"
import { getProductById } from "@/app/actions/product-actions"
import { ProductDetailSlider } from "@/components/products/product-detail-slider"
import { buildTrackingUrl, mapSaleShippingFromRecord } from "@/lib/sale-shipping"
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
  const [isUpdatingDelivery, setIsUpdatingDelivery] = useState(false)
  const { toast } = useToast()
  const { confirm, ConfirmDialog, isConfirmOpen } = useConfirm()

  const closeDetailProduct = () => setDetailProduct(null)

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

    let subtotal = 0
    if (saleItems && saleItems.length > 0) {
      subtotal = saleItems.reduce((sum: number, item: any) => {
        const price = Number.parseFloat(item.price) || 0
        const quantity = Number.parseInt(item.quantity) || 0
        return sum + price * quantity
      }, 0)
    } else {
      const total = Number.parseFloat(saleData.total_amount) || 0
      const discount = Number.parseFloat(saleData.discount) || 0
      subtotal = total + discount
    }

    const discount = Number.parseFloat(saleData.discount) || 0
    const total = subtotal - discount
    const receivedAmount = Number.parseFloat(saleData.received_amount) || 0
    const remaining = Math.max(0, total - receivedAmount)

    return { subtotal, total, remaining }
  }

  const { subtotal, total, remaining } = calculateTotals()

  const getDisplayValue = (value: any, fallback = "—") => {
    if (value === null || value === undefined || value === "") return fallback
    return value
  }

  const getStatusDisplay = (status: any) => {
    if (!status) return "Pending"
    return status
  }

  const getPaymentMethodDisplay = (paymentMethod: any) => {
    if (!paymentMethod) return "Cash"
    return paymentMethod
  }

  const getReceivedAmount = () => {
    if (!saleData) return 0
    return Number.parseFloat(saleData.received_amount) || 0
  }

  const getRemainingAmount = () => {
    if (!saleData) return 0

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

    const shouldDelete = await confirm({
      title: "Delete this sale?",
      description:
        "This permanently removes the sale, its accounting entries, and restores product stock where applicable. This cannot be undone.",
      confirmLabel: "Delete sale",
      destructive: true,
    })
    if (!shouldDelete) return

    try {
      setIsDeletingLocal(true)
      await onDelete(saleId)
    } catch {
      notifyError(toast, "Failed to delete sale")
    } finally {
      setIsDeletingLocal(false)
    }
  }

  const handleReturn = async () => {
    if (!saleData || !saleId) return

    if (saleData.status !== "Completed") {
      notifyError(toast, "Only completed sales can be returned", "Cannot Return Sale")
      return
    }

    const confirmReturn = await confirm({
      title: "Return this sale?",
      description:
        "This will change the sale status to Cancelled, restore product stock, and create accounting adjustments. This action cannot be undone.",
      destructive: true,
      confirmLabel: "Return sale",
    })

    if (!confirmReturn) return

    try {
      setIsLoading(true)

      const returnData = {
        id: saleId,
        customerId: saleData.customer_id,
        items: saleItems.map((item: any) => ({
          id: item.id,
          productId: item.product_id,
          quantity: item.quantity,
          price: item.price,
          cost: item.actual_cost || item.cost || 0,
          notes: item.notes || "",
        })),
        paymentStatus: "Cancelled",
        paymentMethod: saleData.payment_method || "Cash",
        saleDate: saleData.sale_date,
        discount: saleData.discount || 0,
        receivedAmount: 0,
        deviceId: saleData.device_id,
        userId: saleData.created_by,
        staffId: saleData.staff_id,
      }

      const result = await updateSale(returnData)

      if (result.success) {
        notifySuccess(toast, "The sale has been cancelled and stock has been restored", "Sale Returned Successfully")

        const refreshResult = await getSaleDetails(saleId)
        if (refreshResult.success && refreshResult.data) {
          setSaleData(refreshResult.data.sale)
          setSaleItems(refreshResult.data.items || [])
        }
      } else {
        notifyError(toast, result.message || "Failed to process sale return", "Return Failed")
      }
    } catch {
      notifyError(toast, "An error occurred while processing the return", "Return Error")
    } finally {
      setIsLoading(false)
    }
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

  const status = saleData ? getStatusDisplay(saleData.status) : "Pending"
  const received = saleData ? getReceivedAmount() : 0
  const balance = saleData ? getRemainingAmount() : 0
  const deleteInProgress = isDeleting || isDeletingLocal

  return (
    <>
      <Dialog open={isOpen} modal={!isConfirmOpen} onOpenChange={(open) => !open && !deleteInProgress && onClose()}>
        <DialogContent
          overlayClassName={cn(
            "duration-0 data-[state=open]:animate-none data-[state=closed]:animate-none",
            isConfirmOpen && "pointer-events-none",
          )}
          className="max-w-5xl gap-0 overflow-hidden border-slate-200 p-0 duration-0 data-[state=open]:animate-none data-[state=closed]:animate-none sm:max-w-5xl [&>button]:top-3 [&>button]:right-3"
          style={isConfirmOpen ? { pointerEvents: "none" } : undefined}
        >
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
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <SummaryCard label="Total" value={formatCurrency(total)} tone="violet" />
                <SummaryCard label="Received" value={formatCurrency(received)} tone="emerald" />
                <SummaryCard
                  label="Balance"
                  value={balance > 0 ? formatCurrency(balance) : "—"}
                  tone="amber"
                />
                <SummaryCard label="Discount" value={formatCurrency(saleData.discount || 0)} tone="slate" />
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
                  <InfoCell label="Staff" value={saleData.staff_name || "Not assigned"} />
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
                              <td className="whitespace-nowrap px-4 py-2.5 text-center text-slate-800">
                                {getDisplayValue(item.quantity, "0")}
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
                    <div className="flex flex-wrap gap-1.5">
                      {!["Shipped", "In transit", "Delivered"].includes(
                        saleData.delivery_status || "Pending",
                      ) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 border-slate-200 bg-white px-2 text-[11px]"
                          disabled={isUpdatingDelivery}
                          onClick={() => handleDeliveryStatusUpdate("Shipped")}
                        >
                          {isUpdatingDelivery ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Mark shipped"
                          )}
                        </Button>
                      ) : null}
                      {saleData.delivery_status !== "Delivered" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 border-emerald-200 bg-white px-2 text-[11px] text-emerald-700 hover:bg-emerald-50"
                          disabled={isUpdatingDelivery}
                          onClick={() => handleDeliveryStatusUpdate("Delivered")}
                        >
                          Mark delivered
                        </Button>
                      ) : null}
                    </div>
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

      {ConfirmDialog}
    </>
  )
}
