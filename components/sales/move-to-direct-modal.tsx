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
import { Loader2, Package, Truck, Plus, X, AlertCircle, Forward, FileText, Tag, MessageCircle, ExternalLink, CheckCircle2, Copy, Send, Eye, Download } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"
import { getSaleDetails, moveSaleToDirectPurchase } from "@/app/actions/sale-actions"
import { getMasterDataItems, createMasterDataItem } from "@/app/actions/master-data-actions"
import { getDeviceServices } from "@/app/actions/service-actions"
import { getDeviceDefaultCourierPct } from "@/app/actions/dashboard-actions"
import SupplierAutocomplete from "@/components/purchases/supplier-autocomplete"
import { getCurrencySymbol } from "@/lib/currency-utils"
import { cn } from "@/lib/utils"
import { openWhatsApp } from "@/lib/whatsapp-utils"
import { printSalesReceipt, printBatchJobCards } from "@/lib/receipt-utils"
import {
  generateSaleDocumentPdf,
  shareOrDownloadPdf,
  downloadBlob,
  type SaleDocumentKind,
} from "@/lib/sale-documents"
import { useSelector } from "react-redux"
import { selectDeviceName } from "@/store/slices/deviceSlice"

interface DirectItem {
  product_id: number
  product_name: string
  variant_id: number | null
  variant_name?: string
  quantity: number
  unit_cost: number
  price?: number
  mrp?: number
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

  // WhatsApp dispatch & document options
  const [currentStep, setCurrentStep] = useState<"form" | "whatsapp">("form")
  const [sendInvoice, setSendInvoice] = useState(true)
  const [sendLabel, setSendLabel] = useState(true)
  const [supplierPhone, setSupplierPhone] = useState("")
  const [activePreviewTab, setActivePreviewTab] = useState<"invoice" | "label">("invoice")
  const [invoiceHtml, setInvoiceHtml] = useState<string>("")
  const [labelHtml, setLabelHtml] = useState<string>("")
  const [isLoadingPreviews, setIsLoadingPreviews] = useState(false)
  const [isSharingPdf, setIsSharingPdf] = useState(false)

  const deviceName = useSelector(selectDeviceName) || "MOTOCLUB"

  // Fetch Courier services and default courier percentage
  useEffect(() => {
    const effectiveDeviceId = Number(deviceId) || Number(sale?.device_id) || 0
    if (!effectiveDeviceId || !isOpen) return

    let isMounted = true

    // Fetch courier master data and services for this device
    Promise.all([
      getMasterDataItems(effectiveDeviceId, "courier"),
      getDeviceServices(effectiveDeviceId),
    ])
      .then(([masterRes, servicesRes]) => {
        if (!isMounted) return
        const servicesMap = new Map<number, { id: number; name: string }>()
        if (masterRes.success && Array.isArray(masterRes.data)) {
          masterRes.data.forEach((it: any) => {
            if (it.device_id === effectiveDeviceId && it.is_active !== false && it.name?.trim()) {
              servicesMap.set(it.id, { id: it.id, name: it.name.trim() })
            }
          })
        }
        if (servicesRes.success && Array.isArray(servicesRes.data)) {
          const existingNames = new Set(Array.from(servicesMap.values()).map((s) => s.name.toLowerCase().trim()))
          servicesRes.data.forEach((it: any) => {
            if (it.device_id === effectiveDeviceId && it.is_active !== false && it.name?.trim()) {
              const norm = it.name.toLowerCase().trim()
              if (!servicesMap.has(it.id) && !existingNames.has(norm)) {
                servicesMap.set(it.id, { id: it.id, name: it.name.trim() })
                existingNames.add(norm)
              }
            }
          })
        }
        const list = Array.from(servicesMap.values()).sort((a, b) => a.name.localeCompare(b.name))
        setCourierServices(list)
      })
      .catch((err) => console.error("Failed to fetch courier services:", err))

    // Fetch default courier percentage
    getDeviceDefaultCourierPct(effectiveDeviceId)
      .then((pct) => {
        if (isMounted && pct != null) {
          setCourierPct(Number(pct) || 0)
        }
      })
      .catch((err) => console.error("Failed to fetch courier pct:", err))

    return () => {
      isMounted = false
    }
  }, [deviceId, sale?.device_id, isOpen])

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

    // Reset WhatsApp step & options
    setCurrentStep("form")
    setSendInvoice(true)
    setSendLabel(true)
    setSupplierPhone("")
    setInvoiceHtml("")
    setLabelHtml("")

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

  // Formatted items and sale object for documents (both preview and PDF export)
  const docItems = useMemo(() => {
    return items.map((it) => {
      const q = Number(it.quantity) || 1
      const p = Number(it.price ?? it.unit_cost ?? 0)
      return {
        ...it,
        quantity: q,
        price: p,
        line_total: q * p,
      }
    })
  }, [items])

  const saleForDoc = useMemo(() => {
    const customerSubtotal = docItems.reduce((sum, it) => sum + it.quantity * it.price, 0)
    const customerTotal = Number(sale?.total_amount) || customerSubtotal
    return {
      ...sale,
      total_amount: customerTotal,
      items: docItems,
      courier_service_name: selectedCourierServiceName.trim() || sale?.courier_service_name,
      tracking_id: trackingId.trim() || sale?.tracking_id,
      expense_courier: Number(sale?.expense_courier) || courierCharge,
    }
  }, [sale, docItems, selectedCourierServiceName, trackingId, courierCharge])

  // Load document HTML previews when entering WhatsApp step
  useEffect(() => {
    if (currentStep !== "whatsapp" || !isOpen || !sale?.id) return

    let isMounted = true
    setIsLoadingPreviews(true)

    Promise.all([
      sendInvoice ? Promise.resolve(printSalesReceipt(saleForDoc, docItems, currency, {}, false, true)) : Promise.resolve(""),
      sendLabel ? printBatchJobCards([saleForDoc], currency, {}, true) : Promise.resolve(""),
    ])
      .then(([invHtml, lblHtml]) => {
        if (!isMounted) return
        setInvoiceHtml(invHtml || "")
        setLabelHtml(lblHtml || "")
        if (!sendInvoice && sendLabel) {
          setActivePreviewTab("label")
        } else {
          setActivePreviewTab("invoice")
        }
      })
      .catch((err) => console.error("Error generating document previews:", err))
      .finally(() => {
        if (isMounted) setIsLoadingPreviews(false)
      })

    return () => {
      isMounted = false
    }
  }, [currentStep, isOpen, sendInvoice, sendLabel, saleForDoc, docItems, currency])

  const mapSaleItems = (rawItems: any[]) => {
    const productItems: DirectItem[] = rawItems
      .filter((it: any) => (it.item_type === "product" || it.product_id != null) && !it.service_id)
      .map((it: any) => {
        const qty = Number(it.quantity) || 1
        const cost = Number(it.actual_cost ?? it.cost ?? it.product_wholesale_price ?? 0)
        const sellingPrice = Number(it.price ?? it.unit_price ?? it.selling_price ?? cost)
        const rawMrp = Number(it.mrp ?? 0)
        const itemMrp = rawMrp > 0 ? rawMrp : sellingPrice
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
          price: sellingPrice,
          mrp: itemMrp,
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
        if (sendInvoice || sendLabel) {
          setCurrentStep("whatsapp")
        } else {
          onSuccess?.()
          onClose()
        }
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

  // Derived values for WhatsApp message & public document links
  const origin = typeof window !== "undefined" ? window.location.origin : "https://www.motocart.store"
  const customerName = sale?.customer_name_override || sale?.customer_name || "Customer"
  const customerPhone = sale?.customer_phone || ""
  const shippingAddress = sale?.shipping_address || sale?.customer_address || "Provided on order"
  const effectiveCourier = selectedCourierServiceName.trim() || sale?.courier_service_name || "Direct Courier"
  const effectiveTracking = trackingId.trim() || sale?.tracking_id || `ORD-${sale?.id}`

  const itemsFormatted = items
    .map((it, idx) => `${idx + 1}. ${it.product_name}${it.variant_name ? ` (${it.variant_name})` : ""} × ${it.quantity}`)
    .join("\n")

  // Selected document kind for PDF export
  const docKind: SaleDocumentKind | null =
    sendInvoice && sendLabel ? "both" : sendInvoice ? "invoice" : sendLabel ? "label" : null

  const docLines: string[] = []
  if (sendInvoice && sendLabel) {
    docLines.push("• 📄 Tax Invoice & 🏷️ Shipping Label (Attached as PDF)")
  } else if (sendInvoice) {
    docLines.push("• 📄 Tax Invoice (Attached as PDF)")
  } else if (sendLabel) {
    docLines.push("• 🏷️ Shipping Label (Attached as PDF)")
  }

  const whatsappMessage = `📦 *Direct Dropship Order Request*
*Store:* ${deviceName}
*Job Card / Order ID:* #${sale?.id}

👤 *Customer Delivery Details:*
• Name: ${customerName}
${customerPhone ? `• Phone: ${customerPhone}\n` : ""}• Address: ${shippingAddress}

🚚 *Courier & Tracking:*
• Courier: ${effectiveCourier}
• Tracking ID: ${effectiveTracking}

📋 *Products to Dispatch:*
${itemsFormatted}

${docLines.length > 0 ? `📄 *Documents Attached:*\n${docLines.join("\n")}\n\n` : ""}Please print the required document(s) and dispatch the order to the customer. Thank you!
— ${deviceName}`

  const handleDownloadPdf = async () => {
    if (!docKind) return
    try {
      setIsSharingPdf(true)
      const { blob, filename } = await generateSaleDocumentPdf(saleForDoc, docItems, docKind, currency)
      downloadBlob(blob, filename)
      notifySuccess(toast, filename, "PDF downloaded successfully")
    } catch (err: any) {
      console.error("PDF generation error:", err)
      notifyError(toast, err?.message || "Failed to generate PDF", "Document Error")
    } finally {
      setIsSharingPdf(false)
    }
  }

  const handleSendWhatsApp = async () => {
    const rawDigits = (supplierPhone || "").replace(/\D/g, "")
    const formattedPhone = rawDigits.length === 10 ? `91${rawDigits}` : rawDigits

    if (!formattedPhone) {
      notifyError(toast, "Please enter a valid WhatsApp phone number for the supplier", "Phone Required")
      return
    }

    // If no document checkboxes selected, send clean text message only
    if (!docKind) {
      openWhatsApp(formattedPhone, whatsappMessage)
      notifySuccess(toast, "WhatsApp opened with order details")
      onSuccess?.()
      onClose()
      return
    }

    try {
      setIsSharingPdf(true)
      const { blob, filename } = await generateSaleDocumentPdf(saleForDoc, docItems, docKind, currency)

      const shareResult = await shareOrDownloadPdf(
        blob,
        filename,
        `Order #${sale?.id} - ${supplier}`,
        whatsappMessage,
      )

      if (shareResult === "shared") {
        notifySuccess(toast, "Native share opened with PDF document")
        onSuccess?.()
        onClose()
      } else if (shareResult === "downloaded") {
        // Desktop / browser without native file share:
        // The PDF is downloaded, now open WhatsApp Web with message so user can drag-and-drop / attach it!
        openWhatsApp(formattedPhone, whatsappMessage)
        notifySuccess(
          toast,
          "PDF downloaded & WhatsApp opened! Please attach the downloaded PDF in the chat.",
          "PDF Ready",
        )
        onSuccess?.()
        onClose()
      }
    } catch (err: any) {
      console.error("Failed to share PDF:", err)
      notifyError(toast, err?.message || "Failed to generate PDF for WhatsApp", "PDF Error")
    } finally {
      setIsSharingPdf(false)
    }
  }

  const handleFinishWhatsAppStep = () => {
    onSuccess?.()
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent className={cn("max-w-4xl max-h-[92vh] overflow-y-auto p-0 gap-0", currentStep === "whatsapp" && "max-w-5xl")}>
        {currentStep === "form" ? (
          <>
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
                      onSelectSupplier={(s) => {
                        if (s?.phone) {
                          setSupplierPhone(s.phone)
                        }
                      }}
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

                  {/* SECTION 6: SUPPLIER WHATSAPP NOTIFICATION OPTIONS */}
                  <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-3.5 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-md bg-emerald-100 text-emerald-700">
                        <MessageCircle className="h-4 w-4" />
                      </div>
                      <div>
                        <Label className="text-xs font-bold text-slate-900">
                          Supplier WhatsApp Notification
                        </Label>
                        <p className="text-[11px] text-slate-500">
                          Select order documents to send to the supplier via WhatsApp after moving to Direct
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <label className="flex items-center gap-2.5 p-2.5 rounded-lg bg-white border border-slate-200 cursor-pointer hover:border-purple-300 transition-colors shadow-2xs">
                        <input
                          type="checkbox"
                          checked={sendInvoice}
                          onChange={(e) => setSendInvoice(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-purple-700 focus:ring-purple-500 cursor-pointer"
                        />
                        <div className="text-xs">
                          <span className="font-semibold text-slate-800 flex items-center gap-1">
                            <FileText className="h-3.5 w-3.5 text-purple-600" /> Invoice
                          </span>
                          <span className="text-[10px] text-slate-400 block">Attaches customer tax invoice PDF for supplier to print</span>
                        </div>
                      </label>

                      <label className="flex items-center gap-2.5 p-2.5 rounded-lg bg-white border border-slate-200 cursor-pointer hover:border-purple-300 transition-colors shadow-2xs">
                        <input
                          type="checkbox"
                          checked={sendLabel}
                          onChange={(e) => setSendLabel(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-purple-700 focus:ring-purple-500 cursor-pointer"
                        />
                        <div className="text-xs">
                          <span className="font-semibold text-slate-800 flex items-center gap-1">
                            <Tag className="h-3.5 w-3.5 text-purple-600" /> Shipping Label
                          </span>
                          <span className="text-[10px] text-slate-400 block">Attaches shipping label PDF with customer address & courier tracking</span>
                        </div>
                      </label>
                    </div>
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
          </>
        ) : (
          /* STEP 2: WHATSAPP DISPATCH & DOCUMENT PREVIEW */
          <>
            <DialogHeader className="p-4 sm:p-5 border-b border-emerald-200 bg-emerald-50/70">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-emerald-600 text-white shadow-xs">
                    <MessageCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <DialogTitle className="text-base font-bold text-slate-900">
                      Dispatch Order to Supplier WhatsApp
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-600 mt-0.5">
                      Order #{sale?.id} moved to Direct • Supplier: <span className="font-semibold text-slate-800">{supplier}</span>
                    </DialogDescription>
                  </div>
                </div>
              </div>
            </DialogHeader>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                {/* LEFT COLUMN: RECIPIENT PHONE, ORDER INFO & MESSAGE PREVIEW */}
                <div className="lg:col-span-5 space-y-3.5">
                  {/* Recipient Phone */}
                  <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-2xs space-y-2">
                    <Label className="text-xs font-bold text-slate-900 flex items-center justify-between">
                      <span>Supplier WhatsApp Number <span className="text-red-500">*</span></span>
                      {supplierPhone.trim() && (
                        <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Ready
                        </span>
                      )}
                    </Label>
                    <Input
                      value={supplierPhone}
                      onChange={(e) => setSupplierPhone(e.target.value)}
                      placeholder="e.g. 9876543210 (10-digit mobile number)"
                      className="h-8 text-xs bg-slate-50 border-slate-300 font-mono"
                    />
                    <p className="text-[10px] text-slate-500">
                      Pre-filled from supplier directory. You can edit or enter an alternate number.
                    </p>
                  </div>

                  {/* Order Details Card */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 space-y-2 text-xs">
                    <div className="font-semibold text-slate-800 border-b border-slate-200/80 pb-1.5 flex justify-between items-center">
                      <span>Order #{sale?.id} Summary</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">Direct Dropship</span>
                    </div>
                    <div className="space-y-1 text-slate-600">
                      <div><strong className="text-slate-800">Customer:</strong> {customerName} {customerPhone ? `(${customerPhone})` : ""}</div>
                      <div className="line-clamp-2"><strong className="text-slate-800">Address:</strong> {shippingAddress}</div>
                      <div><strong className="text-slate-800">Courier:</strong> {effectiveCourier} • <strong className="text-slate-800">Tracking:</strong> {effectiveTracking}</div>
                      <div><strong className="text-slate-800">Items ({items.length}):</strong> {items.map(it => `${it.product_name} (${it.quantity})`).join(", ")}</div>
                    </div>
                  </div>

                  {/* Included Document Badges & PDF Download */}
                  <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-slate-800">Documents to Dispatch (PDF)</Label>
                      {docKind && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isSharingPdf}
                          onClick={handleDownloadPdf}
                          className="h-6 text-[10px] px-2 text-purple-700 hover:text-purple-900 hover:bg-purple-50 flex items-center gap-1 cursor-pointer"
                        >
                          {isSharingPdf ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Download className="h-3 w-3" />
                          )}
                          Download PDF
                        </Button>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      {sendInvoice && (
                        <div className="flex items-center justify-between p-2 rounded-md bg-purple-50/60 border border-purple-100">
                          <span className="font-medium text-slate-800 flex items-center gap-1.5">
                            <FileText className="h-4 w-4 text-purple-600" /> Tax Invoice
                          </span>
                          <span className="text-[10px] font-semibold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
                            PDF Document
                          </span>
                        </div>
                      )}
                      {sendLabel && (
                        <div className="flex items-center justify-between p-2 rounded-md bg-purple-50/60 border border-purple-100">
                          <span className="font-medium text-slate-800 flex items-center gap-1.5">
                            <Tag className="h-4 w-4 text-purple-600" /> Shipping Label
                          </span>
                          <span className="text-[10px] font-semibold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
                            PDF Document
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Message Preview */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-slate-700">WhatsApp Message</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(whatsappMessage)
                          notifySuccess(toast, "WhatsApp message copied to clipboard")
                        }}
                        className="h-6 text-[10px] px-2 text-slate-600 hover:text-slate-900"
                      >
                        <Copy className="h-3 w-3 mr-1" /> Copy Text
                      </Button>
                    </div>
                    <pre className="p-2.5 rounded-lg bg-slate-100 text-[11px] text-slate-800 font-mono whitespace-pre-wrap max-h-36 overflow-y-auto border border-slate-200">
                      {whatsappMessage}
                    </pre>
                  </div>
                </div>

                {/* RIGHT COLUMN: DOCUMENT PREVIEW */}
                <div className="lg:col-span-7 flex flex-col space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Eye className="h-4 w-4 text-purple-600" /> Live Document Preview
                    </Label>

                    {/* Switcher if both checked */}
                    {sendInvoice && sendLabel && (
                      <div className="flex items-center gap-1 p-0.5 bg-slate-200/80 rounded-lg">
                        <button
                          type="button"
                          onClick={() => setActivePreviewTab("invoice")}
                          className={cn(
                            "px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer",
                            activePreviewTab === "invoice" ? "bg-white text-purple-800 shadow-2xs" : "text-slate-600 hover:text-slate-900"
                          )}
                        >
                          📄 Invoice
                        </button>
                        <button
                          type="button"
                          onClick={() => setActivePreviewTab("label")}
                          className={cn(
                            "px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer",
                            activePreviewTab === "label" ? "bg-white text-purple-800 shadow-2xs" : "text-slate-600 hover:text-slate-900"
                          )}
                        >
                          🏷️ Shipping Label
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Live Iframe container */}
                  <div className="border border-slate-300 rounded-xl overflow-hidden bg-white shadow-2xs flex-1 min-h-[420px]">
                    {isLoadingPreviews ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-2 min-h-[420px]">
                        <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
                        <span className="text-xs font-medium">Loading document preview...</span>
                      </div>
                    ) : (
                      <iframe
                        title="Order Document Preview"
                        srcDoc={activePreviewTab === "invoice" ? invoiceHtml : labelHtml}
                        className="w-full h-full min-h-[420px] border-0"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between sm:justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleFinishWhatsAppStep}
                className="h-8 text-xs px-4"
              >
                Done / Skip WhatsApp
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={handleSendWhatsApp}
                disabled={!supplierPhone.trim() || isSharingPdf}
                className="h-8 text-xs px-5 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                {isSharingPdf ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Preparing PDF...
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    Send via WhatsApp
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default MoveToDirectModal
