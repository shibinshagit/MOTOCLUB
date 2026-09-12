"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Truck, ShieldAlert, PackagePlus, Trash2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { createReplacementShipment } from "@/app/actions/replacement-actions"
import { getAllGlobalCouriers } from "@/app/actions/master-data-actions"
import { REPLACEMENT_REASONS, type ReplacementReason } from "@/lib/replacement-types"
import { ReplacementWhatsappModal } from "./replacement-whatsapp-modal"
import ProductSelectSimple from "./product-select-simple"
import { useSelector } from "react-redux"
import { selectDeviceId } from "@/store/slices/deviceSlice"

interface CreateReplacementModalProps {
  isOpen: boolean
  onClose: () => void
  sale: any
  saleItems: any[]
  masterCouriers?: Array<{ id: number; name: string }>
  onSuccess?: () => void
}

export interface CustomReplacementItem {
  id: string
  productId: number
  productName: string
  variantId: number | null
  variantName: string | null
  variants?: Array<{ id: number; name: string; stock?: number }>
  availStock: number
  quantity: number
}

export function CreateReplacementModal({
  isOpen,
  onClose,
  sale,
  saleItems,
  masterCouriers = [],
  onSuccess,
}: CreateReplacementModalProps) {
  const { toast } = useToast()
  const deviceId = useSelector(selectDeviceId)

  const [couriers, setCouriers] = useState<Array<{ id: number; name: string }>>(masterCouriers || [])
  const [reason, setReason] = useState<ReplacementReason | string>("Missing Item")
  const [courierPartnerId, setCourierPartnerId] = useState<string>("")
  const [courierServiceName, setCourierServiceName] = useState<string>("")
  const [trackingId, setTrackingId] = useState<string>("")
  const [shippingDate, setShippingDate] = useState<string>("")
  const [shippingAddress, setShippingAddress] = useState<string>("")
  const [notes, setNotes] = useState<string>("")

  // Quantities per sale_item_id (Original items)
  const [quantities, setQuantities] = useState<Record<number, number>>({})
  // Additional items selected from catalog
  const [additionalItems, setAdditionalItems] = useState<CustomReplacementItem[]>([])
  const [showProductSelect, setShowProductSelect] = useState<boolean>(false)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdReplacement, setCreatedReplacement] = useState<any>(null)
  const [submittedItemsList, setSubmittedItemsList] = useState<Array<{ productName: string; variantName?: string; quantity: number }>>([])
  const [showWhatsappModal, setShowWhatsappModal] = useState(false)

  useEffect(() => {
    let isMounted = true

    async function loadCourierPartners() {
      try {
        const targetDeviceId = deviceId || sale?.device_id || 1
        const { getDeviceStaff } = await import("@/app/actions/staff-actions")
        const { getMasterDataItems } = await import("@/app/actions/master-data-actions")

        const [staffRes, masterRes] = await Promise.all([
          getDeviceStaff(targetDeviceId),
          getMasterDataItems(targetDeviceId, "courier"),
        ])

        if (!isMounted) return

        let partnerList: Array<{ id: number; name: string }> = []

        // 1. Active staff members with role = 'partner'
        if (staffRes.success && Array.isArray(staffRes.data)) {
          partnerList = staffRes.data
            .filter((s: any) => s.role === "partner" && s.is_active !== false)
            .map((s: any) => ({ id: Number(s.id), name: String(s.name) }))
        }

        const staffNameSet = new Set(partnerList.map((p) => p.name.toLowerCase().trim()))

        // 2. Master data courier items (combine cleanly without duplicates)
        if (masterRes.success && Array.isArray(masterRes.data)) {
          masterRes.data.forEach((c: any) => {
            if (c.is_active !== false && c.name && !staffNameSet.has(String(c.name).toLowerCase().trim())) {
              partnerList.push({ id: Number(c.id), name: String(c.name) })
            }
          })
        }

        // 3. Combine any extra items passed via masterCouriers prop
        if (masterCouriers && masterCouriers.length > 0) {
          masterCouriers.forEach((mc) => {
            if (mc.name && !partnerList.some((p) => p.id === mc.id || p.name.toLowerCase().trim() === mc.name.toLowerCase().trim())) {
              partnerList.push({ id: Number(mc.id), name: String(mc.name) })
            }
          })
        }

        setCouriers(partnerList)
      } catch (err) {
        console.error("Failed to load courier partners in modal:", err)
      }
    }

    if (isOpen) {
      loadCourierPartners()
    }

    return () => {
      isMounted = false
    }
  }, [isOpen, deviceId, sale?.device_id, masterCouriers])

  // Reset form state ONLY when modal is opened for a specific sale
  useEffect(() => {
    if (isOpen && sale) {
      setCourierServiceName(sale.courier_service_name || "")
      setShippingAddress(sale.shipping_address || sale.customer_address || "")
      setNotes("")
      setTrackingId("")
      setShippingDate(new Date().toISOString().split("T")[0])
      setAdditionalItems([])
      setShowProductSelect(false)

      const initialQty: Record<number, number> = {}
      for (const item of saleItems || []) {
        initialQty[item.id] = 0
      }
      setQuantities(initialQty)
    }
  }, [isOpen, sale?.id])

  // Sync courier partner pre-selection when couriers list is populated
  useEffect(() => {
    if (sale && couriers.length > 0) {
      setCourierPartnerId((prevId) => {
        if (prevId && couriers.some((c) => String(c.id) === prevId)) {
          return prevId
        }
        if (sale.courier_partner_id && couriers.some((c) => String(c.id) === String(sale.courier_partner_id))) {
          return String(sale.courier_partner_id)
        }
        const searchName = (sale.courier_partner_name || sale.courier_service_name || "").toLowerCase().trim()
        if (searchName) {
          const matched = couriers.find((c) => c.name.toLowerCase().trim() === searchName)
          if (matched) {
            return String(matched.id)
          }
        }
        return prevId || (sale.courier_partner_id ? String(sale.courier_partner_id) : "")
      })
    }
  }, [couriers, sale?.courier_partner_id, sale?.courier_partner_name, sale?.courier_service_name])

  if (!sale) return null

  const handleQuantityChange = (itemId: number, maxEligible: number, availStock: number, valStr: string) => {
    const parsed = parseInt(valStr, 10)
    if (isNaN(parsed) || parsed < 0) {
      setQuantities((prev) => ({ ...prev, [itemId]: 0 }))
      return
    }
    const cap = Math.min(maxEligible, Math.max(0, availStock))
    const clamped = Math.min(parsed, cap)
    setQuantities((prev) => ({ ...prev, [itemId]: clamped }))
  }

  const handleSelectCatalogProduct = (
    productId: number,
    productName: string,
    price: number,
    wholesalePrice?: number,
    stock?: number,
    productObj?: any
  ) => {
    if (!productId) return

    const variants = Array.isArray(productObj?.variants) ? productObj.variants : []
    const defaultVariant = variants[0] || null
    const initialVariantId = defaultVariant ? Number(defaultVariant.id) : null
    const initialVariantName = defaultVariant ? defaultVariant.name : null
    const maxStock = stock ?? (defaultVariant?.stock !== undefined ? Number(defaultVariant.stock) : 0)

    // Check if product with same variant is already added
    const existingIdx = additionalItems.findIndex(
      (item) => item.productId === productId && item.variantId === initialVariantId
    )

    if (existingIdx >= 0) {
      const updated = [...additionalItems]
      const cap = Math.max(1, maxStock || 999)
      updated[existingIdx].quantity = Math.min(cap, updated[existingIdx].quantity + 1)
      setAdditionalItems(updated)
      toast({ title: "Quantity Updated", description: `Increased replacement quantity for ${productName}.` })
    } else {
      const newItem: CustomReplacementItem = {
        id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        productId,
        productName,
        variantId: initialVariantId,
        variantName: initialVariantName,
        variants,
        availStock: maxStock,
        quantity: maxStock > 0 ? 1 : 1,
      }
      setAdditionalItems((prev) => [...prev, newItem])
      toast({ title: "Catalog Product Added", description: `${productName} added to replacement items.` })
    }
  }

  const handleRemoveCustomItem = (id: string) => {
    setAdditionalItems((prev) => prev.filter((item) => item.id !== id))
  }

  const handleCustomQuantityChange = (id: string, availStock: number, valStr: string) => {
    const parsed = parseInt(valStr, 10)
    if (isNaN(parsed) || parsed < 0) {
      setAdditionalItems((prev) => prev.map((item) => (item.id === id ? { ...item, quantity: 0 } : item)))
      return
    }
    const cap = Math.max(0, availStock > 0 ? availStock : 999)
    const clamped = Math.min(parsed, cap)
    setAdditionalItems((prev) => prev.map((item) => (item.id === id ? { ...item, quantity: clamped } : item)))
  }

  const handleCustomVariantChange = (id: string, variantIdStr: string) => {
    const variantId = Number(variantIdStr)
    setAdditionalItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        const foundVar = item.variants?.find((v: any) => Number(v.id) === variantId)
        return {
          ...item,
          variantId,
          variantName: foundVar ? foundVar.name : item.variantName,
          availStock: foundVar?.stock !== undefined ? Number(foundVar.stock) : item.availStock,
        }
      })
    )
  }

  const originalSelectedCount = Object.values(quantities).reduce((acc, q) => acc + (q || 0), 0)
  const customSelectedCount = additionalItems.reduce((acc, item) => acc + (item.quantity || 0), 0)
  const selectedItemCount = originalSelectedCount + customSelectedCount

  const handleSubmit = async () => {
    if (!reason) {
      toast({ title: "Reason Required", description: "Please select a replacement reason.", variant: "destructive" })
      return
    }

    if (selectedItemCount <= 0) {
      toast({
        title: "No Items Selected",
        description: "Please specify a replacement quantity greater than 0 for at least one item.",
        variant: "destructive",
      })
      return
    }

    const originalItemsToSubmit = saleItems
      .filter((item) => (quantities[item.id] || 0) > 0)
      .map((item) => ({
        saleItemId: item.id,
        productId: item.product_id,
        productVariantId: item.product_variant_id || null,
        batchId: item.batch_id || null,
        quantity: quantities[item.id],
      }))

    const customItemsToSubmit = additionalItems
      .filter((item) => (item.quantity || 0) > 0)
      .map((item) => ({
        saleItemId: null,
        productId: item.productId,
        productVariantId: item.variantId || null,
        batchId: null,
        quantity: item.quantity,
      }))

    const itemsToSubmit = [...originalItemsToSubmit, ...customItemsToSubmit]

    const whatsappItemsList = [
      ...saleItems
        .filter((item) => (quantities[item.id] || 0) > 0)
        .map((item) => ({
          productName: item.product_name || `Product #${item.product_id}`,
          variantName: item.variant_name,
          quantity: quantities[item.id],
        })),
      ...additionalItems
        .filter((item) => (item.quantity || 0) > 0)
        .map((item) => ({
          productName: item.productName,
          variantName: item.variantName || undefined,
          quantity: item.quantity,
        })),
    ]

    setIsSubmitting(true)
    try {
      const res = await createReplacementShipment({
        saleId: sale.id,
        reason,
        items: itemsToSubmit,
        fulfillmentType: "ship",
        courierPartnerId: courierPartnerId ? Number(courierPartnerId) : null,
        courierServiceName: courierServiceName.trim() || null,
        trackingId: trackingId.trim() || null,
        shippingDate: shippingDate || null,
        shippingAddress: shippingAddress.trim() || null,
        notes: notes.trim() || null,
        deviceId: deviceId ? Number(deviceId) : sale.device_id,
      })

      if (res.success && res.data) {
        toast({
          title: "Replacement Shipment Created",
          description: `Replacement ${res.data.replacement_number} has been created successfully with ₹0 total amount.`,
        })
        setCreatedReplacement(res.data)
        setSubmittedItemsList(whatsappItemsList)
        setShowWhatsappModal(true)
        if (onSuccess) onSuccess()
      } else {
        toast({
          title: "Failed to Create Replacement",
          description: res.message || "An unexpected error occurred.",
          variant: "destructive",
        })
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to submit replacement shipment request.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleWhatsappClose = () => {
    setShowWhatsappModal(false)
    onClose()
  }

  return (
    <>
      <Dialog open={isOpen && !showWhatsappModal} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="p-6 pb-4 border-b bg-slate-50">
            <div className="flex items-center gap-2">
              <div className="rounded-full bg-blue-100 p-2 text-blue-600">
                <RefreshCw className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold">Create Replacement Shipment</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Attached to Original Order <span className="font-semibold text-slate-900">#{sale.id}</span>
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Commercial Amount Banner */}
            <div className="rounded-lg border border-blue-200 bg-blue-50/80 p-4 text-sm text-blue-900 flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Logistics Transaction (Non-Commercial)</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  Commercial Amount: <span className="font-bold">₹0</span> &bull; Payment: <span className="font-bold">No Payment Required</span>.
                  This feature fulfills missing or damaged items without altering the original order revenue or creating new receivables.
                </p>
              </div>
            </div>

            {/* Reason Selector */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                Replacement Reason <span className="text-rose-500">*</span>
              </Label>
              <Select value={reason} onValueChange={(val) => setReason(val)}>
                <SelectTrigger className="h-10 bg-white">
                  <SelectValue placeholder="Select Reason" />
                </SelectTrigger>
                <SelectContent>
                  {REPLACEMENT_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Items Section Header */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Select Items to Replace <span className="text-rose-500">*</span>
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowProductSelect((prev) => !prev)}
                  className="h-8 text-xs font-medium text-blue-700 border-blue-200 bg-blue-50/60 hover:bg-blue-100/80 gap-1.5"
                >
                  <PackagePlus className="h-3.5 w-3.5" />
                  {showProductSelect ? "Hide Product Picker" : "+ Select Missing Item from Products"}
                </Button>
              </div>

              {/* Inline Product Picker */}
              {showProductSelect && (
                <div className="p-3 bg-slate-50 border border-blue-200 rounded-lg space-y-2">
                  <div className="text-xs font-semibold text-slate-800 flex items-center justify-between">
                    <span>Search & Choose Product from Catalog</span>
                    <span className="text-[11px] text-slate-500 font-normal">Pick any missing product to add to replacement</span>
                  </div>
                  <ProductSelectSimple
                    value={null}
                    onChange={(productId, productName, price, wholesalePrice, stock, productObj) => {
                      handleSelectCatalogProduct(productId, productName, price, wholesalePrice, stock, productObj)
                      setShowProductSelect(false)
                    }}
                    allowServices={false}
                    userId={sale.device_id || 1}
                    autoOpen={true}
                  />
                </div>
              )}

              {/* Items Table */}
              <div className="rounded-lg border bg-white overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 border-b font-medium text-slate-600">
                    <tr>
                      <th className="py-2.5 px-3">Product Item</th>
                      <th className="py-2.5 px-3 text-center">Original Qty</th>
                      <th className="py-2.5 px-3 text-center">Prev. Replaced</th>
                      <th className="py-2.5 px-3 text-center">Eligible Qty</th>
                      <th className="py-2.5 px-3 text-center">Avail. Stock</th>
                      <th className="py-2.5 px-3 text-right w-28">Replace Qty</th>
                      <th className="py-2.5 px-3 text-center w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-slate-800">
                    {/* Original Sale Items */}
                    {saleItems.map((item) => {
                      const origQty = Number(item.quantity) || 0
                      const prevReplaced = Number(item.replaced_quantity) || 0
                      const eligibleQty = item.eligible_replacement_quantity ?? Math.max(0, origQty - prevReplaced)
                      const stockVal = Number(item.stock) || 0
                      const currentInput = quantities[item.id] || 0
                      const isDisabled = eligibleQty <= 0 || stockVal <= 0

                      return (
                        <tr key={`orig_${item.id}`} className={isDisabled ? "bg-slate-50 opacity-60" : "hover:bg-slate-50/50"}>
                          <td className="py-3 px-3">
                            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                              <span>{item.product_name || `Product #${item.product_id}`}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                Order Item
                              </span>
                            </div>
                            {item.variant_name && <div className="text-[11px] text-slate-500">Variant: {item.variant_name}</div>}
                            {item.batch_number && <div className="text-[11px] text-slate-500">Batch: {item.batch_number}</div>}
                          </td>
                          <td className="py-3 px-3 text-center font-mono font-medium">{origQty}</td>
                          <td className="py-3 px-3 text-center font-mono text-slate-500">{prevReplaced}</td>
                          <td className="py-3 px-3 text-center font-mono font-semibold text-blue-700">{eligibleQty}</td>
                          <td className="py-3 px-3 text-center font-mono font-medium">
                            <span className={stockVal > 0 ? "text-emerald-700" : "text-rose-600 font-bold"}>
                              {stockVal}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <Input
                              type="number"
                              min={0}
                              max={Math.min(eligibleQty, stockVal)}
                              value={currentInput}
                              disabled={isDisabled}
                              onChange={(e) => handleQuantityChange(item.id, eligibleQty, stockVal, e.target.value)}
                              className="h-8 w-20 ml-auto text-right font-mono font-bold"
                            />
                          </td>
                          <td className="py-3 px-3 text-center"></td>
                        </tr>
                      )
                    })}

                    {/* Additional Catalog Items */}
                    {additionalItems.map((item) => {
                      const stockVal = item.availStock
                      const currentInput = item.quantity
                      const hasVariants = Array.isArray(item.variants) && item.variants.length > 0

                      return (
                        <tr key={item.id} className="bg-blue-50/20 hover:bg-blue-50/40">
                          <td className="py-3 px-3">
                            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                              <span>{item.productName}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200 font-medium">
                                Catalog Item
                              </span>
                            </div>
                            {hasVariants ? (
                              <div className="mt-1 flex items-center gap-1.5">
                                <span className="text-[11px] text-slate-500">Variant:</span>
                                <Select
                                  value={item.variantId ? String(item.variantId) : ""}
                                  onValueChange={(val) => handleCustomVariantChange(item.id, val)}
                                >
                                  <SelectTrigger className="h-6 text-[11px] w-36 py-0 bg-white">
                                    <SelectValue placeholder="Select variant" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {item.variants!.map((v: any) => (
                                      <SelectItem key={v.id} value={String(v.id)} className="text-xs">
                                        {v.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : item.variantName ? (
                              <div className="text-[11px] text-slate-500">Variant: {item.variantName}</div>
                            ) : null}
                          </td>
                          <td className="py-3 px-3 text-center text-slate-400 font-mono">-</td>
                          <td className="py-3 px-3 text-center text-slate-400 font-mono">-</td>
                          <td className="py-3 px-3 text-center text-slate-400 font-mono">-</td>
                          <td className="py-3 px-3 text-center font-mono font-medium">
                            <span className={stockVal > 0 ? "text-emerald-700" : "text-rose-600 font-bold"}>
                              {stockVal}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <Input
                              type="number"
                              min={0}
                              max={Math.max(1, stockVal)}
                              value={currentInput}
                              onChange={(e) => handleCustomQuantityChange(item.id, stockVal, e.target.value)}
                              className="h-8 w-20 ml-auto text-right font-mono font-bold"
                            />
                          </td>
                          <td className="py-3 px-3 text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveCustomItem(item.id)}
                              className="h-7 w-7 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                              title="Remove item"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Shipping & Courier Information */}
            <div className="space-y-4 pt-2 border-t">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Truck className="h-4 w-4 text-slate-500" />
                Shipping & Courier Details
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Courier Partner</Label>
                  <Select value={courierPartnerId} onValueChange={(val) => setCourierPartnerId(val)}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Select Courier Partner" />
                    </SelectTrigger>
                    <SelectContent>
                      {couriers.map((cp) => (
                        <SelectItem key={cp.id} value={String(cp.id)}>
                          {cp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Courier Service Name</Label>
                  <Input
                    type="text"
                    placeholder="e.g. Express, Surface, BlueDart"
                    value={courierServiceName}
                    onChange={(e) => setCourierServiceName(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Tracking ID / AWB Number</Label>
                  <Input
                    type="text"
                    placeholder="Optional tracking ID"
                    value={trackingId}
                    onChange={(e) => setTrackingId(e.target.value)}
                    className="h-9 text-xs font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Shipping Date</Label>
                  <Input
                    type="date"
                    value={shippingDate}
                    onChange={(e) => setShippingDate(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Shipping Address</Label>
                <Textarea
                  rows={2}
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  className="text-xs resize-none"
                  placeholder="Recipient shipping address..."
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Internal Notes</Label>
                <Input
                  type="text"
                  placeholder="e.g. Approved by Store Manager for missing item"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="p-4 border-t bg-slate-50 flex items-center justify-between">
            <div className="text-xs text-slate-500">
              Selected Items: <span className="font-bold text-slate-900">{selectedItemCount}</span>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSubmit}
                disabled={isSubmitting || selectedItemCount <= 0}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                    Create Replacement Shipment
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {createdReplacement && (
        <ReplacementWhatsappModal
          isOpen={showWhatsappModal}
          onClose={handleWhatsappClose}
          originalSaleId={sale.id}
          replacementNumber={createdReplacement.replacement_number}
          reason={reason}
          customerName={sale.customer_name || "Customer"}
          customerPhone={sale.customer_phone || ""}
          shippingAddress={createdReplacement.shipping_address || sale.shipping_address || ""}
          courierPartnerName={createdReplacement.courier_service_name || "Courier"}
          trackingId={createdReplacement.tracking_id}
          trackingUrlTemplate={sale.tracking_url_template}
          items={submittedItemsList}
        />
      )}
    </>
  )
}

