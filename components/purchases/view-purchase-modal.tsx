"use client"

import { useState, useEffect, type ReactNode } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Edit, Loader2, Package, Printer, Trash2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { notifyError } from "@/lib/notifications"
import { useConfirm } from "@/hooks/use-confirm"
import { FormAlert } from "@/components/ui/form-alert"
import { format } from "date-fns"
import { useSelector } from "react-redux"
import { selectDeviceCurrency, selectDeviceId } from "@/store/slices/deviceSlice"
import { printPurchaseReceipt } from "@/lib/receipt-utils"
import { getPurchaseDetails } from "@/app/actions/purchase-actions"
import { getProductById } from "@/app/actions/product-actions"
import { ProductDetailSlider } from "@/components/products/product-detail-slider"

interface ViewPurchaseModalProps {
  isOpen: boolean
  onClose: () => void
  purchaseId: number | null
  currency?: string
  onEdit?: (purchaseData: any) => void
  onDelete?: (purchaseId: number) => void
}

function PaymentStatusBadge({ status }: { status: string }) {
  const normalized = status === "Partial" ? "Cancelled" : status
  const styles: Record<string, string> = {
    Paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Credit: "bg-amber-50 text-amber-700 border-amber-200",
    Cancelled: "bg-rose-50 text-rose-700 border-rose-200",
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        styles[normalized] || "border-border bg-muted text-muted-foreground"
      }`}
    >
      {normalized}
    </span>
  )
}

function DeliveryStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
    Pending: "bg-amber-50 text-amber-700 border-amber-200",
    Ordered: "bg-blue-50 text-blue-700 border-blue-200",
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        styles[status] || "border-border bg-muted text-muted-foreground"
      }`}
    >
      {status || "Delivered"}
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

export default function ViewPurchaseModal({
  isOpen,
  onClose,
  purchaseId,
  currency,
  onEdit,
  onDelete,
}: ViewPurchaseModalProps) {
  const [purchaseData, setPurchaseData] = useState<any>(null)
  const [purchaseItems, setPurchaseItems] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailProduct, setDetailProduct] = useState<any>(null)
  const [isItemLoading, setIsItemLoading] = useState(false)
  const { toast } = useToast()
  const { confirm, ConfirmDialog } = useConfirm()

  const closeDetailProduct = () => setDetailProduct(null)

  const deviceCurrency = useSelector(selectDeviceCurrency) || currency || "AED"
  const deviceId = useSelector(selectDeviceId)

  const formatCurrency = (amount: number | string) => {
    const numAmount = typeof amount === "string" ? Number.parseFloat(amount) : amount
    if (isNaN(numAmount)) return `${deviceCurrency} 0.00`
    return `${deviceCurrency} ${numAmount.toFixed(2)}`
  }

  useEffect(() => {
    const fetchPurchaseData = async () => {
      if (!isOpen || !purchaseId) {
        setPurchaseData(null)
        setPurchaseItems([])
        setError(null)
        setDetailProduct(null)
        return
      }

      try {
        setIsLoading(true)
        setError(null)

        const result = await getPurchaseDetails(purchaseId)

        if (result.success && result.data) {
          setPurchaseData(result.data.purchase)
          setPurchaseItems(result.data.items || [])
        } else {
          setError(result.message || "Failed to load purchase details")
        }
      } catch {
        setError("An error occurred while loading purchase details")
      } finally {
        setIsLoading(false)
      }
    }

    fetchPurchaseData()
  }, [isOpen, purchaseId])

  const calculateTotals = () => {
    if (!purchaseData) return { subtotal: 0, total: 0, paid: 0, remaining: 0 }

    let subtotal = 0
    if (purchaseItems.length > 0) {
      subtotal = purchaseItems.reduce((sum: number, item: any) => {
        const price = Number.parseFloat(item.price) || 0
        const quantity = Number.parseInt(item.quantity) || 0
        return sum + price * quantity
      }, 0)
    }

    const total = Number.parseFloat(purchaseData.total_amount) || subtotal
    const status = purchaseData.status === "Partial" ? "Cancelled" : purchaseData.status
    let paid = 0
    if (status === "Credit") {
      paid = Number.parseFloat(purchaseData.received_amount) || 0
    } else if (status === "Paid") {
      paid = total
    }
    const remaining = Math.max(0, total - paid)

    return { subtotal, total, paid, remaining }
  }

  const { subtotal, total, paid, remaining } = calculateTotals()

  const getDisplayValue = (value: any, fallback = "—") => {
    if (value === null || value === undefined || value === "") return fallback
    return value
  }

  const handleEdit = () => {
    if (onEdit && purchaseData) {
      onEdit(purchaseData)
    }
  }

  const handleDelete = async () => {
    if (onDelete && purchaseId) {
      const shouldDelete = await confirm("Are you sure you want to delete this purchase? This action cannot be undone.")
      if (!shouldDelete) return
      onDelete(purchaseId)
      onClose()
    }
  }

  const handlePrint = () => {
    if (purchaseData && purchaseItems.length > 0) {
      printPurchaseReceipt(purchaseData, purchaseItems, deviceCurrency)
    } else {
      notifyError(toast, "Cannot print receipt - purchase data not loaded")
    }
  }

  const handleItemRowClick = async (item: any) => {
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

  const formatPurchaseDate = (dateValue: string | null | undefined) => {
    if (!dateValue) return "—"
    try {
      return format(new Date(dateValue), "yyyy-MM-dd")
    } catch {
      return "Invalid date"
    }
  }

  const PurchaseDetailsSkeleton = () => (
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

  if (!isOpen) return null

  const paymentStatus = purchaseData?.status === "Partial" ? "Cancelled" : purchaseData?.status || "Credit"

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          overlayClassName="duration-0 data-[state=open]:animate-none data-[state=closed]:animate-none"
          className="max-w-5xl gap-0 overflow-hidden border-slate-200 p-0 duration-0 data-[state=open]:animate-none data-[state=closed]:animate-none sm:max-w-5xl [&>button]:top-3 [&>button]:right-3"
        >
          <DialogHeader className="space-y-0 border-b border-slate-200 bg-[#F1F4F9] px-4 py-3 text-left">
            <DialogTitle className="sr-only">
              Purchase {purchaseId ? `#${purchaseId}` : "details"}
            </DialogTitle>
            <div className="flex flex-wrap items-center gap-2 pr-10">
              <Button
                variant="outline"
                size="sm"
                onClick={handleEdit}
                disabled={isLoading || !purchaseData}
                className="h-8 border-slate-200 bg-white px-3 text-xs"
              >
                <Edit className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                disabled={isLoading || !purchaseData || !purchaseItems.length}
                className="h-8 border-slate-200 bg-white px-3 text-xs"
              >
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                Print
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={isLoading}
                className="h-8 border-rose-200 bg-white px-3 text-xs text-rose-700 hover:bg-rose-50"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
          </DialogHeader>

          <div className="relative min-h-0 max-h-[calc(90vh-5.5rem)] overflow-hidden">
          {isLoading ? (
            <PurchaseDetailsSkeleton />
          ) : error ? (
            <div className="space-y-4 p-4">
              <FormAlert type="error" message={error} />
              <div className="flex justify-end">
                <Button onClick={onClose} variant="outline" size="sm">
                  Close
                </Button>
              </div>
            </div>
          ) : !purchaseData ? (
            <div className="space-y-4 p-8 text-center">
              <p className="text-sm text-muted-foreground">Purchase not found</p>
              <Button onClick={onClose} variant="outline" size="sm">
                Close
              </Button>
            </div>
          ) : (
            <div className="h-full space-y-3 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <SummaryCard label="Total" value={formatCurrency(total)} tone="violet" />
                <SummaryCard label="Paid" value={formatCurrency(paid)} tone="emerald" />
                <SummaryCard
                  label="Balance"
                  value={remaining > 0 ? formatCurrency(remaining) : "—"}
                  tone="amber"
                />
                <SummaryCard
                  label="Delivery"
                  value={purchaseData.purchase_status || "Delivered"}
                  tone="blue"
                />
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-card">
                <div className="border-b border-slate-200 bg-[#F1F4F9] px-4 py-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Purchase information
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                  <InfoCell label="Purchase #" value={`#${purchaseData.id}`} />
                  <InfoCell label="Date" value={formatPurchaseDate(purchaseData.purchase_date)} />
                  <InfoCell label="Payment" value={<PaymentStatusBadge status={paymentStatus} />} />
                  <InfoCell
                    label="Delivery"
                    value={<DeliveryStatusBadge status={purchaseData.purchase_status || "Delivered"} />}
                  />
                  <InfoCell label="Supplier" value={getDisplayValue(purchaseData.supplier)} />
                  <InfoCell label="Method" value={getDisplayValue(purchaseData.payment_method, "Cash")} />
                  <InfoCell label="Created" value={formatPurchaseDate(purchaseData.created_at)} />
                  <InfoCell label="Updated" value={formatPurchaseDate(purchaseData.updated_at)} />
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-card">
                <div className="flex items-center justify-between border-b border-slate-200 bg-[#F1F4F9] px-4 py-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Line items</h3>
                  <span className="text-xs text-slate-500">
                    {purchaseItems.length} item{purchaseItems.length === 1 ? "" : "s"} · click row for details
                  </span>
                </div>

                {purchaseItems.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No line items available · Total {formatCurrency(total)}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-separate border-spacing-0 text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-[#F1F4F9] text-xs font-semibold uppercase tracking-wide text-slate-600">
                          <th className="whitespace-nowrap px-4 py-2.5 text-left">#</th>
                          <th className="whitespace-nowrap px-4 py-2.5 text-left">Product</th>
                          <th className="whitespace-nowrap px-4 py-2.5 text-center">Qty</th>
                          <th className="whitespace-nowrap px-4 py-2.5 text-right">Unit price</th>
                          <th className="whitespace-nowrap px-4 py-2.5 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purchaseItems.map((item: any, index: number) => {
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
                                  <Package className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-slate-800">
                                      {getDisplayValue(item.product_name)}
                                    </p>
                                    {item.category ? (
                                      <p className="text-[11px] text-slate-500">{item.category}</p>
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
                              <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-slate-800">
                                {formatCurrency(lineTotal)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-slate-200 bg-[#F1F4F9]">
                          <td
                            colSpan={4}
                            className="px-4 py-2.5 text-right text-xs font-semibold uppercase text-slate-600"
                          >
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

              {purchaseData.notes ? (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-card">
                  <div className="border-b border-slate-200 bg-[#F1F4F9] px-4 py-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Notes</h3>
                  </div>
                  <div className="px-4 py-3 text-sm text-slate-700">{purchaseData.notes}</div>
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

      {ConfirmDialog}
    </>
  )
}
