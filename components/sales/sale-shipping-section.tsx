"use client"

import { useEffect, useMemo, useState } from "react"
import { Package, Truck } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { getMasterDataItems, getAllGlobalCouriers } from "@/app/actions/master-data-actions"
import { getDeviceServices, addService } from "@/app/actions/service-actions"
import { getPackagingDefaultCost } from "@/lib/master-data"
import {
  DEFAULT_SALE_SHIPPING,
  DELIVERY_STATUSES,
  type SaleShippingInput,
} from "@/lib/sale-shipping"
import type { MasterDataItem } from "@/lib/master-data"

interface SaleShippingSectionProps {
  deviceId?: number | null
  value: SaleShippingInput
  onChange: (value: SaleShippingInput) => void
  customerAddress?: string
  currency?: string
  className?: string
  isJobCard?: boolean
  customerName?: string
  customerPhone?: string
}

export default function SaleShippingSection({
  deviceId,
  value,
  onChange,
  customerAddress,
  currency = "AED",
  className,
  isJobCard = false,
  customerName = "",
  customerPhone = "",
}: SaleShippingSectionProps) {
  const shipping = { ...DEFAULT_SALE_SHIPPING, ...value }
  const [courierPartners, setCourierPartners] = useState<{ id: number; name: string; linked_partner_id?: number | null; tracking_url_template?: string | null }[]>([])
  const [courierServices, setCourierServices] = useState<{ id: number; name: string }[]>([])
  const [packagingTypes, setPackagingTypes] = useState<MasterDataItem[]>([])
  
  const [isCreatingService, setIsCreatingService] = useState(false)
  const [newServiceName, setNewServiceName] = useState("")
  const [newServicePrice, setNewServicePrice] = useState("0")

  useEffect(() => {
    console.log("[SaleShippingSection] Mounted with deviceId:", deviceId)
    if (!deviceId) return

    let isMounted = true

    const loadData = async () => {
      try {
        const { getDeviceStaff } = await import("@/app/actions/staff-actions")
        const { getMasterDataItems } = await import("@/app/actions/master-data-actions")
        const { getDeviceServices } = await import("@/app/actions/service-actions")

        const [staffResult, courierMasterResult, packagingResult, servicesResult] = await Promise.all([
          getDeviceStaff(deviceId),
          getMasterDataItems(deviceId, "courier"),
          getMasterDataItems(deviceId, "packaging"),
          getDeviceServices(deviceId),
        ])

        if (!isMounted) return

        // 1. COURIER PARTNERS: Get active staff members with role = 'partner'
        let partners: { id: number; name: string; linked_partner_id?: number | null; tracking_url_template?: string | null }[] = []
        if (staffResult.success && Array.isArray(staffResult.data)) {
          partners = staffResult.data
            .filter((s: any) => s.role === "partner" && s.is_active !== false)
            .map((s: any) => ({
              id: s.id,
              name: s.name,
              linked_partner_id: s.linked_partner_id,
            }))
        }
        setCourierPartners(partners)

        // 2. COURIER SERVICES: Get master data courier items (excluding partner staff names) + services table items
        const staffNames = new Set(partners.map((p) => p.name.toLowerCase().trim()))
        const servicesList: { id: number; name: string }[] = []

        if (courierMasterResult.success && Array.isArray(courierMasterResult.data)) {
          courierMasterResult.data.forEach((item: any) => {
            if (item.is_active !== false && item.name && !staffNames.has(String(item.name).toLowerCase().trim())) {
              servicesList.push({ id: item.id, name: item.name })
            }
          })
        }

        if (servicesResult.success && Array.isArray(servicesResult.data)) {
          servicesResult.data.forEach((s: any) => {
            if (s.name && !servicesList.some((existing) => existing.name.toLowerCase() === s.name.toLowerCase())) {
              servicesList.push({ id: s.id, name: s.name })
            }
          })
        }

        setCourierServices(servicesList)

        if (packagingResult.success && Array.isArray(packagingResult.data)) {
          setPackagingTypes(packagingResult.data.filter((item: any) => item.is_active !== false))
        }
      } catch (error) {
        console.error("[SaleShippingSection] Error fetching shipping data:", error)
      }
    }

    loadData()

    return () => {
      isMounted = false
    }
  }, [deviceId])

  const selectedCourierPartner = useMemo(
    () => courierPartners.find((courier) => courier.id === shipping.courierPartnerId) || null,
    [courierPartners, shipping.courierPartnerId],
  )

  const selectedPackaging = useMemo(
    () => packagingTypes.find((item) => item.id === shipping.packagingTypeId) || null,
    [packagingTypes, shipping.packagingTypeId],
  )

  const patch = (partial: Partial<SaleShippingInput>) => {
    onChange({ ...shipping, ...partial })
  }

  const setFulfillmentType = (fulfillmentType: "pickup" | "ship") => {
    if (fulfillmentType === "pickup") {
      onChange({ ...DEFAULT_SALE_SHIPPING, fulfillmentType: "pickup" })
      return
    }

    onChange({
      ...DEFAULT_SALE_SHIPPING,
      ...shipping,
      fulfillmentType: "ship",
      deliveryStatus: shipping.deliveryStatus || "Pending",
      shippingAddress: shipping.shippingAddress || customerAddress || "",
    })
  }

  const handleCourierPartnerChange = (partnerIdStr: string) => {
    if (!partnerIdStr) {
      patch({ courierPartnerId: null, courierServiceId: null, courierServiceName: "" })
      return
    }
    const partnerId = Number(partnerIdStr)
    const partner = courierPartners.find((item) => item.id === partnerId)

    let autoServiceId = shipping.courierServiceId
    let autoServiceName = shipping.courierServiceName

    if (partner?.linked_partner_id) {
      const linkedService = courierServices.find((s) => s.id === partner.linked_partner_id)
      if (linkedService) {
        autoServiceId = linkedService.id
        autoServiceName = linkedService.name
      }
    }

    patch({
      courierPartnerId: partner?.id || null,
      courierServiceId: autoServiceId,
      courierServiceName: autoServiceName,
      fulfillmentType: "ship",
    })
  }

  const handleCourierServiceChange = (serviceIdStr: string) => {
    if (serviceIdStr === "create_new") {
      setIsCreatingService(true)
      return
    }
    if (!serviceIdStr) {
      patch({ courierServiceId: null, courierServiceName: "" })
      return
    }

    const serviceId = Number(serviceIdStr)
    const service = courierServices.find((item) => item.id === serviceId)
    patch({
      courierServiceId: service?.id || null,
      courierServiceName: service?.name || "",
    })
  }

  const handleCreateService = async () => {
    if (!deviceId || !newServiceName.trim()) return
    try {
      const { createMasterDataItem } = await import("@/app/actions/master-data-actions")
      const result = await createMasterDataItem(deviceId, deviceId, {
        category: "courier",
        name: newServiceName.trim(),
        isActive: true,
      })
      if (result.success && result.data) {
        const newService = { id: result.data.id, name: result.data.name }
        setCourierServices((prev) => [...prev, newService])
        patch({
          courierServiceId: newService.id,
          courierServiceName: newService.name,
        })
        setIsCreatingService(false)
        setNewServiceName("")
        setNewServicePrice("0")
      }
    } catch (error) {
      console.error("Failed to create service", error)
    }
  }

  const handlePackagingChange = (packagingId: string) => {
    if (!packagingId) {
      patch({ packagingTypeId: null, packagingTypeName: "" })
      return
    }

    const packaging = packagingTypes.find((item) => String(item.id) === packagingId)
    const defaultCost = getPackagingDefaultCost(packaging?.metadata)
    patch({
      packagingTypeId: packaging?.id || null,
      packagingTypeName: packaging?.name || "",
      expensePacking: defaultCost ?? shipping.expensePacking ?? 0,
    })
  }

  if (isJobCard) {
    return (
      <div className={cn("rounded-lg border border-blue-100 bg-blue-50/30 overflow-hidden", className)}>
        <div className="bg-blue-100/50 px-3 py-2 border-b border-blue-100 flex items-center">
          <Truck className="h-4 w-4 mr-2 text-blue-700" />
          <h3 className="text-xs font-semibold text-blue-900">Job Card Fulfillment Details</h3>
        </div>
        
        <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <Label className="text-[10px] font-semibold uppercase tracking-wide text-blue-600/80">Customer Information</Label>
              <div className="mt-1 bg-white p-2 border border-blue-100 rounded-md">
                <div className="text-sm font-medium text-slate-900">{customerName || "No name provided"}</div>
                <div className="text-xs text-slate-500 mt-0.5">{customerPhone || shipping.customerPhoneOverride || "No phone provided"}</div>
              </div>
            </div>
            
            <div>
              <Label className="text-[10px] font-semibold uppercase tracking-wide text-blue-600/80 mb-2 block">Courier Fulfillment</Label>
              <div className="space-y-2 bg-white p-2 border border-blue-100 rounded-md">
                <div>
                  <Label className="text-sm font-extrabold uppercase tracking-wide text-slate-900">
                    Courier Partner <span className="text-red-500">*</span>
                  </Label>
                  <select
                    value={shipping.courierPartnerId ? String(shipping.courierPartnerId) : ""}
                    onChange={(e) => handleCourierPartnerChange(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900"
                  >
                    <option value="" className="font-normal">Select partner</option>
                    {courierPartners.map((courier) => (
                      <option key={courier.id} value={courier.id}>
                        {courier.name}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <Label className="text-sm font-extrabold uppercase tracking-wide text-slate-900">
                    Courier Service <span className="text-red-500">*</span>
                  </Label>
                  {isCreatingService ? (
                    <div className="flex flex-col gap-1 rounded border border-slate-200 bg-slate-50 p-1.5">
                      <Input 
                        placeholder="Service Name" 
                        value={newServiceName} 
                        onChange={e => setNewServiceName(e.target.value)} 
                        className="h-9 text-sm font-bold bg-white" 
                      />
                      <div className="flex gap-1">
                        <button type="button" onClick={handleCreateService} className="flex-1 bg-slate-900 text-white rounded text-xs py-1.5 font-bold">Save</button>
                        <button type="button" onClick={() => setIsCreatingService(false)} className="flex-1 bg-slate-200 text-slate-700 rounded text-xs py-1.5 font-bold">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <select
                      value={shipping.courierServiceId ? String(shipping.courierServiceId) : ""}
                      onChange={(e) => handleCourierServiceChange(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900"
                    >
                      <option value="" className="font-normal">Select service</option>
                      {courierServices.map((service) => (
                        <option key={service.id} value={service.id}>
                          {service.name}
                        </option>
                      ))}
                      <option value="create_new">+ Create New Courier Service</option>
                    </select>
                  )}
                </div>
              </div>
            </div>
            
            <div>
              <Label className="text-[10px] font-semibold uppercase tracking-wide text-blue-600/80 mb-2 block">Order Tracking</Label>
              <div className="bg-white p-2 border border-blue-100 rounded-md">
                <div className="text-xs font-medium text-slate-700 mb-1">Tracking ID:</div>
                <Input
                  value={shipping.trackingId || ""}
                  onChange={(e) => patch({ trackingId: e.target.value })}
                  placeholder="AWB / tracking number"
                  className="h-8 border-slate-200 text-xs w-full"
                />
              </div>
            </div>
          </div>
          
          <div>
            <Label className="text-[10px] font-semibold uppercase tracking-wide text-blue-600/80">Shipping Address</Label>
            <div className="mt-1 bg-white p-2 border border-blue-100 rounded-md space-y-1.5 min-h-[92px]">
              {shipping.shippingAddressType && (
                <div className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-medium rounded border border-blue-100">
                  {shipping.shippingAddressType}
                </div>
              )}
              {shipping.shippingStreet && <div className="text-xs text-slate-700"><span className="font-medium text-slate-900">Street:</span> {shipping.shippingStreet}</div>}
              {shipping.shippingLandmark && <div className="text-xs text-slate-700"><span className="font-medium text-slate-900">Landmark:</span> {shipping.shippingLandmark}</div>}
              {shipping.shippingCity && <div className="text-xs text-slate-700"><span className="font-medium text-slate-900">Location:</span> {shipping.shippingCity}</div>}
              {shipping.shippingPincode && <div className="text-xs text-slate-700"><span className="font-medium text-slate-900">Pincode:</span> {shipping.shippingPincode}</div>}
              
              {!shipping.shippingStreet && !shipping.shippingCity && shipping.shippingAddress && (
                <div className="text-xs text-slate-700 mt-1">{shipping.shippingAddress}</div>
              )}
              
              {!shipping.shippingStreet && !shipping.shippingCity && !shipping.shippingAddress && (
                <div className="text-xs text-slate-400 italic">No shipping address provided</div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("overflow-hidden rounded-xl border border-slate-200 bg-white", className)}>
      <div className="border-b border-slate-200 bg-[#F1F4F9] px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Fulfillment</h3>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setFulfillmentType("pickup")}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                shipping.fulfillmentType === "pickup"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50",
              )}
            >
              Pickup
            </button>
            <button
              type="button"
              onClick={() => setFulfillmentType("ship")}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                shipping.fulfillmentType === "ship"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50",
              )}
            >
              Ship
            </button>
          </div>
        </div>
      </div>

      {shipping.fulfillmentType === "pickup" ? (
        <div className="px-3 py-4 text-xs text-slate-500">Customer pickup in store. No shipping details required.</div>
      ) : (
        <div className="space-y-3 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Delivery status
              </Label>
              <select
                value={shipping.deliveryStatus || "Pending"}
                onChange={(e) => patch({ deliveryStatus: e.target.value })}
                className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900"
              >
                {DELIVERY_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold uppercase tracking-wide text-slate-700">
                Courier Partner
              </Label>
              <select
                value={shipping.courierPartnerId ? String(shipping.courierPartnerId) : ""}
                onChange={(e) => handleCourierPartnerChange(e.target.value)}
                className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-900"
              >
                <option value="" className="font-normal">Select partner</option>
                {courierPartners.map((courier) => (
                  <option key={courier.id} value={courier.id}>
                    {courier.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Courier service
              </Label>
              {isCreatingService ? (
                <div className="flex flex-col gap-1 rounded border border-slate-200 bg-slate-50 p-1.5">
                  <Input 
                    placeholder="Service Name" 
                    value={newServiceName} 
                    onChange={e => setNewServiceName(e.target.value)} 
                    className="h-7 text-xs bg-white" 
                  />
                  <div className="flex gap-1">
                    <button type="button" onClick={handleCreateService} className="flex-1 bg-slate-900 text-white rounded text-[10px] py-1 font-medium">Save</button>
                    <button type="button" onClick={() => setIsCreatingService(false)} className="flex-1 bg-slate-200 text-slate-700 rounded text-[10px] py-1 font-medium">Cancel</button>
                  </div>
                </div>
              ) : (
                <select
                  value={shipping.courierServiceId ? String(shipping.courierServiceId) : ""}
                  onChange={(e) => handleCourierServiceChange(e.target.value)}
                  className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900"
                >
                  <option value="">Select service</option>
                  {courierServices.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                  <option value="create_new">+ Create New Courier Service</option>
                </select>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Packaging type
              </Label>
              <select
                value={shipping.packagingTypeId ? String(shipping.packagingTypeId) : ""}
                onChange={(e) => handlePackagingChange(e.target.value)}
                className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900"
              >
                <option value="">Select packaging</option>
                {packagingTypes.map((packaging) => (
                  <option key={packaging.id} value={packaging.id}>
                    {packaging.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Tracking ID</Label>
              <Input
                value={shipping.trackingId || ""}
                onChange={(e) => patch({ trackingId: e.target.value })}
                placeholder="AWB / tracking number"
                className="h-8 border-slate-200 text-xs"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Shipping address
            </Label>
            <Textarea
              value={shipping.shippingAddress || ""}
              onChange={(e) => patch({ shippingAddress: e.target.value })}
              placeholder="Delivery address"
              className="min-h-[72px] border-slate-200 text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Weight (kg)</Label>
              <Input
                type="number"
                min="0"
                step="0.001"
                value={shipping.weightKg ?? ""}
                onChange={(e) =>
                  patch({ weightKg: e.target.value === "" ? null : Number.parseFloat(e.target.value) })
                }
                className="h-8 border-slate-200 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Length (cm)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={shipping.lengthCm ?? ""}
                onChange={(e) =>
                  patch({ lengthCm: e.target.value === "" ? null : Number.parseFloat(e.target.value) })
                }
                className="h-8 border-slate-200 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Width (cm)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={shipping.widthCm ?? ""}
                onChange={(e) =>
                  patch({ widthCm: e.target.value === "" ? null : Number.parseFloat(e.target.value) })
                }
                className="h-8 border-slate-200 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Height (cm)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={shipping.heightCm ?? ""}
                onChange={(e) =>
                  patch({ heightCm: e.target.value === "" ? null : Number.parseFloat(e.target.value) })
                }
                className="h-8 border-slate-200 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Courier paid (extra)
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={shipping.courierPaidExtra ?? 0}
                onChange={(e) => patch({ courierPaidExtra: Number.parseFloat(e.target.value) || 0 })}
                className="h-8 border-slate-200 bg-white text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Expense: courier
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={shipping.expenseCourier ?? 0}
                onChange={(e) => patch({ expenseCourier: Number.parseFloat(e.target.value) || 0 })}
                className="h-8 border-amber-50 bg-amber-50/70 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Expense: packing
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={shipping.expensePacking ?? 0}
                onChange={(e) => patch({ expensePacking: Number.parseFloat(e.target.value) || 0 })}
                className="h-8 border-slate-200 bg-white text-xs"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Shipping notes
            </Label>
            <Textarea
              value={shipping.shippingNotes || ""}
              onChange={(e) => patch({ shippingNotes: e.target.value })}
              placeholder="Fragile, call before delivery, etc."
              className="min-h-[60px] border-slate-200 text-xs"
            />
          </div>

          {selectedPackaging && getPackagingDefaultCost(selectedPackaging.metadata) != null ? (
            <p className="text-[11px] text-slate-500">
              Default packing cost for {selectedPackaging.name} is applied to expense packing. You can override it
              above.
            </p>
          ) : null}

          {selectedCourierPartner?.tracking_url_template && shipping.trackingId ? (
            <p className="text-[11px] text-slate-500">
              Tracking template available for {selectedCourierPartner.name}. Link can be opened after saving the sale.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Truck className="h-3.5 w-3.5" />
              {selectedCourierPartner?.name || "No courier selected"}
            </span>
            <span className="inline-flex items-center gap-1">
              <Package className="h-3.5 w-3.5" />
              {selectedPackaging?.name || "No packaging selected"} · {currency}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
