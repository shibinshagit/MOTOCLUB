"use client"

import React, { useState, useEffect, useMemo, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Package, Truck, Plus, X, AlertCircle, Forward } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"
import { getSaleDetails, moveSaleToDirectPurchase } from "@/app/actions/sale-actions"
import { getMasterDataItems, createMasterDataItem } from "@/app/actions/master-data-actions"
import { getDeviceDefaultCourierPct } from "@/app/actions/dashboard-actions"
import SupplierAutocomplete from "@/components/purchases/supplier-autocomplete"
import { getCurrencySymbol } from "@/lib/currency-utils"
import { cn } from "@/lib/utils"

interface DirectItem {
  product_id: number
  product_name: string
  variant_id: number | null
  variant_name?: string
  quantity: number
  unit_cost: number
  tax_percentage: number
  tax_amount: number
  line_total: number
}

interface MoveToDirectModalProps {
  isOpen: boolean
  onClose: () => void
  sale: any
  deviceId: number
  userId: number
  currency?: string
  onSuccess?: () => void
}

export function MoveToDirectModal({
  isOpen,
  onClose,
  sale,
  deviceId,
  userId,
  currency = "INR",
  onSuccess,
}: MoveToDirectModalProps) {
  const { toast } = useToast()
  const currencySymbol = getCurrencySymbol(currency)

  // Loading & submit states
  const [isLoadingSale, setIsLoadingSale] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Items
  const [items, setItems] = useState<DirectItem[]>([])

  // Supplier
  const [supplier, setSupplier] = useState("")

  // Courier service
  const [courierServices, setCourierServices] = useState<{ id: number; name: string }[]>([])
  const [selectedCourierServiceId, setSelectedCourierServiceId] = useState<string>("")
  const [selectedCourierServiceName, setSelectedCourierServiceName] = useState<string>("")
  const [isCreatingCourier, setIsCreatingCourier] = useState(false)
  const [newCourierName, setNewCourierName] = useState("")
  const [isSavingNewCourier, setIsSavingNewCourier] = useState(false)

  // Tracking ID
  const [trackingId, setTrackingId] = useState("")

  // Courier charge
  const [courierPct, setCourierPct] = useState<number>(0)
  const [courierCharge, setCourierCharge] = useState<number>(0)
  const [isCourierManuallyEdited, setIsCourierManuallyEdited] = useState(false)

  // Discount
  const [discountAmount, setDiscountAmount] = useState<number>(0)

  // Purchase details
  const [paymentStatus, setPaymentStatus] = useState<"Credit" | "Paid">("Credit")
  const [purchaseStatus, setPurchaseStatus] = useState<"Ordered" | "Delivered">("Ordered")
  const [paidAmount, setPaidAmount] = useState<number | string>(0)
  const [notes, setNotes] = useState("")

  // Fetch Courier services and default courier percentage
  useEffect(() => {
    if (!deviceId || !isOpen) return

    let isMounted = true

    // Fetch courier master data
    getMasterDataItems(deviceId, "courier")
      .then((res) => {
        if (isMounted && res.success && Array.isArray(res.data)) {
          const list = res.data
            .filter((it: any) => it.is_active !== false && it.name)
            .map((it: any) => ({ id: it.id, name: it.name }))
          setCourierServices(list)
        }
      })
      .catch((err) => console.error("Failed to fetch courier services:", err))

    // Fetch default courier percentage
    getDeviceDefaultCourierPct(deviceId)
      .then((pct) => {
        if (isMounted && pct != null) {
          setCourierPct(Number(pct) || 0)
        }
      })
      .catch((err) => console.error("Failed to fetch courier pct:", err))

    return () => {
      isMounted = false
    }
  }, [deviceId, isOpen])

  // Pre-fill / load sale items and defaults when modal opens
  useEffect(() => {
    if (!isOpen || !sale?.id) return

    // Reset initial state
    setSupplier(sale.dropship_supplier || "")
    setIsCreatingCourier(false)
    setNewCourierName("")
    setIsCourierManuallyEdited(false)
    setPaymentStatus("Credit")
    setPurchaseStatus("Ordered")
    setPaidAmount(0)
    setDiscountAmount(0)
    setNotes(`Direct dropship fulfillment for Job Card #${sale.id}`)

    // Pre-fill tracking ID with default DOD jobcard number or existing tracking ID
    const defaultTrack = (sale.tracking_id || sale.job_card_number || "").trim()
    setTrackingId(defaultTrack)

    // Pre-select existing courier service if present
    if (sale.courier_service_name) {
      setSelectedCourierServiceName(sale.courier_service_name)
      if (sale.courier_service_id) {
        setSelectedCourierServiceId(String(sale.courier_service_id))
      }
    } else {
      setSelectedCourierServiceId("")
      setSelectedCourierServiceName("")
    }

    // Set courier expense if order already had one
    if (Number(sale.expense_courier) > 0) {
      setCourierCharge(Number(sale.expense_courier))
      setIsCourierManuallyEdited(true)
    }

    // Load items
    if (Array.isArray(sale.items) && sale.items.length > 0) {
      mapSaleItems(sale.items)
    } else {
      setIsLoadingSale(true)
      getSaleDetails(sale.id)
        .then((res) => {
          if (res.success && res.data?.items) {
            mapSaleItems(res.data.items)
          } else {
            notifyError(toast, res.message || "Failed to load order items")
          }
        })
        .catch((err) => {
          console.error("Error loading sale details:", err)
          notifyError(toast, "Failed to load sale details")
        })
        .finally(() => {
          setIsLoadingSale(false)
        })
    }
  }, [isOpen, sale?.id])

  const mapSaleItems = (rawItems: any[]) => {
    const productItems: DirectItem[] = rawItems
      .filter((it: any) => (it.item_type === "product" || it.product_id != null) && !it.service_id)
      .map((it: any) => {
        const qty = Number(it.quantity) || 1
        const cost = Number(it.actual_cost ?? it.cost ?? it.product_wholesale_price ?? 0)
        const taxPct = Number(it.tax_percentage) || 0
        const taxAmt = Math.round(qty * cost * (taxPct / 100) * 100) / 100
        const lineTot = Math.round((qty * cost + taxAmt) * 100) / 100
        return {
          product_id: it.product_id,
          product_name: it.product_name || `Product #${it.product_id}`,
          variant_id: it.product_variant_id || it.variant_id || null,
          variant_name: it.variant_name || undefined,
          quantity: qty,
          unit_cost: cost,
          tax_percentage: taxPct,
          tax_amount: taxAmt,
          line_total: lineTot,
        }
      })
    setItems(productItems)
  }

  // Calculate Subtotal (base products cost without tax)
  const subtotal = useMemo(() => {
    return items.reduce((sum, it) => sum + (Number(it.quantity) * Number(it.unit_cost)), 0)
  }, [items])

  // Total Tax
  const totalTax = useMemo(() => {
    return items.reduce((sum, it) => sum + (Number(it.tax_amount) || 0), 0)
  }, [items])

  // Calculate Courier Charge from percentage if not manually edited
  useEffect(() => {
    if (!isCourierManuallyEdited) {
      if (courierPct > 0 && subtotal > 0) {
        const calculated = Math.round(((subtotal * courierPct) / 100) * 100) / 100
        setCourierCharge(calculated)
      } else if (courierPct === 0) {
        setCourierCharge(0)
      }
    }
  }, [subtotal, courierPct, isCourierManuallyEdited])

  // Purchase Bill Total (payable to supplier for products + tax - discount)
  const purchaseTotal = useMemo(() => {
    return Math.max(0, Math.round((subtotal + totalTax - Number(discountAmount)) * 100) / 100)
  }, [subtotal, totalTax, discountAmount])

  // Grand Total = subtotal + totalTax - discountAmount + courierCharge
  const grandTotal = useMemo(() => {
    return Math.max(0, Math.round((subtotal + totalTax - Number(discountAmount) + Number(courierCharge)) * 100) / 100)
  }, [subtotal, totalTax, discountAmount, courierCharge])

  const parsedPaidAmount = useMemo(() => {
    return Math.max(0, Number.parseFloat(String(paidAmount)) || 0)
  }, [paidAmount])

  const remainingAmount = useMemo(() => {
    return Math.max(0, Math.round((grandTotal - parsedPaidAmount) * 100) / 100)
  }, [grandTotal, parsedPaidAmount])

  // Handle changing unit cost for an item
  const handleUnitCostChange = (index: number, newCostStr: string) => {
    const newCost = Math.max(0, Number.parseFloat(newCostStr) || 0)
    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== index) return it
        const taxAmt = Math.round(it.quantity * newCost * (it.tax_percentage / 100) * 100) / 100
        const lineTot = Math.round((it.quantity * newCost + taxAmt) * 100) / 100
        return {
          ...it,
          unit_cost: newCost,
          tax_amount: taxAmt,
          line_total: lineTot,
        }
      })
    )
  }

  // Handle changing tax percentage for an item
  const handleTaxPercentageChange = (index: number, newTaxPctStr: string) => {
    const newTaxPct = Math.max(0, Number.parseFloat(newTaxPctStr) || 0)
    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== index) return it
        const taxAmt = Math.round(it.quantity * it.unit_cost * (newTaxPct / 100) * 100) / 100
        const lineTot = Math.round((it.quantity * it.unit_cost + taxAmt) * 100) / 100
        return {
          ...it,
          tax_percentage: newTaxPct,
          tax_amount: taxAmt,
          line_total: lineTot,
        }
      })
    )
  }

  // Handle inline courier service creation
  const handleSaveNewCourier = async () => {
    const name = newCourierName.trim()
    if (!name) return
    setIsSavingNewCourier(true)
    try {
      const res = await createMasterDataItem(deviceId, userId, {
        category: "courier",
        name,
      })
      if (res.success && res.data) {
        const newService = { id: res.data.id, name: res.data.name }
        setCourierServices((prev) => [...prev, newService])
        setSelectedCourierServiceId(String(newService.id))
        setSelectedCourierServiceName(newService.name)
        setIsCreatingCourier(false)
        setNewCourierName("")
        notifySuccess(toast, `Courier service "${name}" added`)
      } else {
        notifyError(toast, res.message || "Failed to add courier service")
      }
    } catch (err: any) {
      console.error("Save new courier error:", err)
      notifyError(toast, err.message || "Failed to save courier service")
    } finally {
      setIsSavingNewCourier(false)
    }
  }

  // Handle submitting Move to Direct
  const handleSubmit = async () => {
    if (!supplier.trim()) {
      notifyError(toast, "Please select a supplier to move order to Direct", "Supplier Required")
      return
    }

    if (!items.length) {
      notifyError(toast, "No products available in this order to create a purchase", "Products Required")
      return
    }

    const finalPaid = paymentStatus === "Paid" ? grandTotal : parsedPaidAmount

    if (paymentStatus === "Credit" && parsedPaidAmount > grandTotal) {
      notifyError(toast, `Paid amount cannot exceed Grand Total (${currencySymbol} ${grandTotal.toFixed(2)})`, "Invalid Paid Amount")
      return
    }

    setIsSubmitting(true)
    try {
      const res = await moveSaleToDirectPurchase({
        saleId: sale.id,
        deviceId,
        userId,
        supplier: supplier.trim(),
        courierServiceName: selectedCourierServiceName.trim() || null,
        courierServiceId: selectedCourierServiceId ? Number(selectedCourierServiceId) : null,
        trackingId: trackingId.trim() || null,
        courierCharge,
        courierChargePercentage: courierPct,
        discount: Number(discountAmount) || 0,
        paymentStatus,
        purchaseStatus,
        paidAmount: finalPaid,
        notes: notes.trim() || null,
        items: items.map((it) => ({
          product_id: it.product_id,
          variant_id: it.variant_id,
          quantity: it.quantity,
          unit_cost: it.unit_cost,
          tax_percentage: it.tax_percentage,
          tax_amount: it.tax_amount,
          line_total: it.line_total,
        })),
      })

      if (res.success) {
        notifySuccess(toast, res.message || "Order moved to Direct successfully!")
        onSuccess?.()
        onClose()
      } else {
        notifyError(toast, res.message || "Failed to move order to Direct")
      }
    } catch (err: any) {
      console.error("Move to Direct submit error:", err)
      notifyError(toast, err.message || "An unexpected error occurred")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="p-4 sm:p-5 border-b border-slate-200 bg-[#F1F4F9]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-purple-100 text-purple-700">
                <Forward className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-slate-900">
                  Move to Direct (Dropship Purchase)
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                  Job Card #{sale?.id} • Customer: {sale?.customer_name_override || sale?.customer_name || "Walk-in"}
                  {sale?.customer_phone ? ` (${sale.customer_phone})` : ""}
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="p-5 space-y-5">
          {isLoadingSale ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
              <span className="text-xs font-medium">Loading order products...</span>
            </div>
          ) : (
            <>
              {/* SECTION 1: PRODUCT LIST & UNIT BUYING COSTS */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Package className="h-4 w-4 text-purple-600" />
                    Products to Purchase ({items.length})
                  </Label>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                  <div className="grid grid-cols-12 gap-2 p-2.5 bg-slate-100 font-semibold text-slate-700 text-xs border-b border-slate-200">
                    <div className="col-span-4">Product</div>
                    <div className="col-span-1 text-center">Qty</div>
                    <div className="col-span-2 text-right">Cost ({currencySymbol})</div>
                    <div className="col-span-2 text-center">Tax %</div>
                    <div className="col-span-1 text-right">Tax Amt</div>
                    <div className="col-span-2 text-right">Line Total ({currencySymbol})</div>
                  </div>

                  {items.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-400">
                      No product items found for this order.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                      {items.map((it, idx) => (
                        <div
                          key={`${it.product_id}-${it.variant_id ?? idx}`}
                          className="grid grid-cols-12 gap-2 p-2.5 items-center text-xs hover:bg-slate-50/80 transition-colors"
                        >
                          <div className="col-span-4 font-medium text-slate-900 truncate" title={it.product_name}>
                            <div className="truncate">{it.product_name}</div>
                            {it.variant_name && (
                              <span className="text-[10px] text-slate-500 font-normal">
                                Variant: {it.variant_name}
                              </span>
                            )}
                          </div>
                          <div className="col-span-1 text-center font-mono font-medium text-slate-700">
                            {it.quantity}
                          </div>
                          <div className="col-span-2 text-right">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={it.unit_cost}
                              onChange={(e) => handleUnitCostChange(idx, e.target.value)}
                              className="h-7 text-xs text-right font-mono bg-white border-slate-300"
                            />
                          </div>
                          <div className="col-span-2 text-center">
                            <Input
                              type="number"
                              min="0"
                              step="0.1"
                              value={it.tax_percentage}
                              onChange={(e) => handleTaxPercentageChange(idx, e.target.value)}
                              className="h-7 text-xs text-center font-mono bg-white border-slate-300"
                              placeholder="0"
                            />
                          </div>
                          <div className="col-span-1 text-right font-mono text-slate-600">
                            {currencySymbol} {it.tax_amount.toFixed(2)}
                          </div>
                          <div className="col-span-2 text-right font-mono font-semibold text-slate-900">
                            {currencySymbol} {it.line_total.toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION 2: ORDER CALCULATION SUMMARY */}
              <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-2xs space-y-2.5 text-xs">
                <div className="font-semibold text-slate-800 text-xs border-b border-slate-100 pb-1.5 flex items-center justify-between">
                  <span>Order Calculation Summary</span>
                  <span className="text-[11px] text-slate-500 font-normal">Amounts in {currencySymbol}</span>
                </div>

                <div className="flex justify-between items-center text-slate-600">
                  <span className="font-medium">Subtotal (Net Items Cost):</span>
                  <span className="font-mono font-semibold text-slate-800">{currencySymbol} {subtotal.toFixed(2)}</span>
                </div>

                <div className="flex justify-between items-center text-slate-600">
                  <span className="font-medium">Tax:</span>
                  <span className="font-mono font-semibold text-slate-800">{currencySymbol} {totalTax.toFixed(2)}</span>
                </div>

                <div className="flex justify-between items-center text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">Courier Charge:</span>
                    {courierPct > 0 && !isCourierManuallyEdited && (
                      <span className="text-[10px] text-slate-400">({courierPct}% of subtotal)</span>
                    )}
                  </div>
                  <span className="font-mono font-semibold text-slate-800">{currencySymbol} {courierCharge.toFixed(2)}</span>
                </div>

                <div className="flex justify-between items-center text-slate-600">
                  <span className="font-medium">Discount:</span>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-400 font-mono">-</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={discountAmount || ""}
                      onChange={(e) => setDiscountAmount(Math.max(0, Number.parseFloat(e.target.value) || 0))}
                      placeholder="0.00"
                      className="w-24 h-7 text-xs text-right bg-white border-slate-300 font-mono"
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center text-slate-700 font-semibold border-t border-slate-100 pt-1.5">
                  <span className="font-medium">Purchase Bill (Supplier):</span>
                  <span className="font-mono text-slate-900">{currencySymbol} {purchaseTotal.toFixed(2)}</span>
                </div>

                <div className="flex justify-between items-center pt-2.5 border-t border-slate-200 text-sm font-bold text-emerald-700 bg-emerald-50/70 -mx-3.5 -mb-3.5 p-3 rounded-b-lg">
                  <span>Grand Total (with Courier):</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-extrabold">{currencySymbol} {grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* SECTION 3: SUPPLIER SELECTION (MANDATORY) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-slate-900 flex items-center gap-1">
                    Supplier <span className="text-red-500">*</span>
                  </Label>
                  {!supplier && (
                    <span className="text-[11px] font-medium text-amber-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Mandatory to move order
                    </span>
                  )}
                </div>
                <SupplierAutocomplete
                  value={supplier}
                  onChange={setSupplier}
                  userId={deviceId || userId}
                  placeholder="Select or search registered supplier..."
                  className="h-9 text-xs bg-white"
                />
              </div>

              {/* SECTION 4: COURIER SERVICE & TRACKING DETAILS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
                {/* Courier Service */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-800">Courier Service</Label>
                  {isCreatingCourier ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        placeholder="Service name (e.g. DTDC, ST Courier)"
                        value={newCourierName}
                        onChange={(e) => setNewCourierName(e.target.value)}
                        className="h-8 text-xs bg-white"
                        autoFocus
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={isSavingNewCourier || !newCourierName.trim()}
                        onClick={handleSaveNewCourier}
                        className="h-8 px-2.5 text-xs bg-slate-900 text-white"
                      >
                        {isSavingNewCourier ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setIsCreatingCourier(false)}
                        className="h-8 px-2 text-xs"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <Select
                      value={selectedCourierServiceId || "unselected"}
                      onValueChange={(val) => {
                        if (val === "create_new") {
                          setIsCreatingCourier(true)
                        } else if (val === "unselected") {
                          setSelectedCourierServiceId("")
                          setSelectedCourierServiceName("")
                        } else {
                          setSelectedCourierServiceId(val)
                          const found = courierServices.find((c) => String(c.id) === val)
                          setSelectedCourierServiceName(found?.name || "")
                        }
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs bg-white border-slate-300">
                        <SelectValue placeholder="Select courier service" />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-slate-200">
                        <SelectItem value="unselected">None / Unassigned</SelectItem>
                        {courierServices.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name}
                          </SelectItem>
                        ))}
                        <SelectItem value="create_new" className="font-semibold text-blue-600 focus:text-blue-700">
                          + Create New Courier Service
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Tracking ID */}
                <div className="space-y-1.5">
                  <Label htmlFor="direct-tracking-id" className="text-xs font-semibold text-slate-800">
                    Tracking ID
                  </Label>
                  <Input
                    id="direct-tracking-id"
                    placeholder="Courier tracking number (e.g. ST12345678)"
                    value={trackingId}
                    onChange={(e) => setTrackingId(e.target.value)}
                    className="h-8 text-xs bg-white border-slate-300 font-mono"
                  />
                </div>

                {/* Courier Charge */}
                <div className="space-y-1.5 sm:col-span-2 border-t border-slate-200 pt-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="direct-courier-charge" className="text-xs font-semibold text-slate-800">
                      Courier Charge ({currencySymbol})
                    </Label>
                    {courierPct > 0 && (
                      <span className="text-[10px] text-slate-500 font-medium">
                        Device default: {courierPct}% of subtotal
                      </span>
                    )}
                  </div>
                  <Input
                    id="direct-courier-charge"
                    type="number"
                    min="0"
                    step="0.01"
                    value={courierCharge}
                    onChange={(e) => {
                      setIsCourierManuallyEdited(true)
                      setCourierCharge(Math.max(0, Number.parseFloat(e.target.value) || 0))
                    }}
                    className="h-8 w-48 text-xs bg-white border-slate-300 font-mono"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* SECTION 5: PURCHASE DETAILS (PURCHASE TYPE, PAID AMOUNT, STATUS) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Payment Status */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-800">Payment Status</Label>
                  <Select
                    value={paymentStatus}
                    onValueChange={(val: "Credit" | "Paid") => setPaymentStatus(val)}
                  >
                    <SelectTrigger className="h-8 text-xs bg-white border-slate-300">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200">
                      <SelectItem value="Credit">Credit (Default)</SelectItem>
                      <SelectItem value="Paid">Paid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Purchase Status */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-800">Purchase Status</Label>
                  <Select
                    value={purchaseStatus}
                    onValueChange={(val: "Ordered" | "Delivered") => setPurchaseStatus(val)}
                  >
                    <SelectTrigger className="h-8 text-xs bg-white border-slate-300">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200">
                      <SelectItem value="Ordered">Ordered (Default)</SelectItem>
                      <SelectItem value="Delivered">Delivered</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Purchase Type and Paid Amount in the same row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-slate-800">Purchase Type</Label>
                  <div className="h-8 flex items-center">
                    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold border bg-purple-50 text-purple-700 border-purple-200">
                      Dropship
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="direct-paid-amount" className="text-xs font-medium text-slate-800">
                      Paid Amount
                    </Label>
                    {paymentStatus === "Credit" && (
                      <button
                        type="button"
                        onClick={() => setPaidAmount(grandTotal)}
                        className="text-[10px] text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                      >
                        Pay Full ({currencySymbol} {grandTotal.toFixed(2)})
                      </button>
                    )}
                  </div>
                  {paymentStatus === "Credit" ? (
                    <>
                      <Input
                        id="direct-paid-amount"
                        type="number"
                        min="0"
                        max={grandTotal}
                        step="0.01"
                        value={paidAmount}
                        onChange={(e) => setPaidAmount(e.target.value)}
                        onBlur={() => {
                          if (paidAmount !== "") {
                            const val = Math.min(grandTotal, Math.max(0, Number.parseFloat(String(paidAmount)) || 0))
                            setPaidAmount(val)
                          }
                        }}
                        className="h-8 text-xs bg-white border-slate-300 text-slate-900 font-mono"
                        placeholder="0.00"
                      />
                      <p className="text-[10px] text-slate-500 font-medium">
                        Remaining: {currencySymbol} {remainingAmount.toFixed(2)}
                      </p>
                    </>
                  ) : (
                    <Input
                      id="direct-paid-amount"
                      type="number"
                      value={grandTotal.toFixed(2)}
                      disabled
                      className="h-8 text-xs bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed font-mono"
                    />
                  )}
                </div>
              </div>

              {/* Internal Notes */}
              <div className="space-y-1">
                <Label htmlFor="direct-notes" className="text-xs font-medium text-slate-800">
                  Internal Notes
                </Label>
                <Textarea
                  id="direct-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="h-16 text-xs bg-white border-slate-300 resize-none"
                  placeholder="Optional internal notes or instructions..."
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-8 text-xs px-4"
          >
            Cancel
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleSubmit}
            disabled={isSubmitting || isLoadingSale || !supplier.trim() || items.length === 0}
            className="h-8 text-xs px-5 font-semibold bg-purple-700 hover:bg-purple-800 text-white shadow-xs"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Processing...
              </>
            ) : (
              "Move to Direct"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default MoveToDirectModal
