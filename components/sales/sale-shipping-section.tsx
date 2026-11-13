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

export interface ShippingMetaCacheItem {
  partners: { id: number; name: string; linked_partner_id?: number | null; tracking_url_template?: string | null }[]
  services: { id: number; name: string }[]
  packaging: MasterDataItem[]
  timestamp: number
}

export const shippingMetaCacheByDevice = new Map<number, ShippingMetaCacheItem>()
const inFlightRequests = new Map<number, Promise<ShippingMetaCacheItem>>()

export async function fetchShippingMeta(deviceId: number): Promise<ShippingMetaCacheItem> {
  if (!deviceId || deviceId <= 0) {
    return { partners: [], services: [], packaging: [], timestamp: Date.now() }
  }

  const cached = shippingMetaCacheByDevice.get(deviceId)
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
    return cached
  }

  if (inFlightRequests.has(deviceId)) {
    return inFlightRequests.get(deviceId)!
  }

  const promise = (async () => {
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

      let packagingList: MasterDataItem[] = []
      if (packagingResult.success && Array.isArray(packagingResult.data)) {
        packagingList = packagingResult.data.filter((item: any) => item.is_active !== false)
      }

      const data: ShippingMetaCacheItem = {
        partners,
        services: servicesList,
        packaging: packagingList,
        timestamp: Date.now(),
      }
      shippingMetaCacheByDevice.set(deviceId, data)
      return data
    } finally {
      inFlightRequests.delete(deviceId)
    }
  })()

  inFlightRequests.set(deviceId, promise)
  return promise
}

interface SaleShippingSectionProps {
  deviceId?: number | null
  value: SaleShippingInput
  onChange: (value: SaleShippingInput) => void
  customerAddress?: string
  currency?: string
  formatCurrency?: (amount: number) => string
  className?: string
  isJobCard?: boolean
  customerName?: string
  customerPhone?: string
  forceFullForm?: boolean
  hidePickupToggle?: boolean
  isLogisticsFulfillment?: boolean
  errors?: { courierPartner?: string; shippingAddress?: string }
}

export default function SaleShippingSection({
  deviceId,
  value,
  onChange,
  customerAddress,
  currency = "INR",
  formatCurrency,
  className,
  isJobCard = false,
  customerName = "",
  customerPhone = "",
  forceFullForm = false,
  hidePickupToggle = false,
  isLogisticsFulfillment = false,
  errors,
}: SaleShippingSectionProps) {
  const shipping = { ...DEFAULT_SALE_SHIPPING, ...value }
  const cachedMeta = deviceId ? shippingMetaCacheByDevice.get(deviceId) : null

  const [courierPartners, setCourierPartners] = useState<{ id: number; name: string; linked_partner_id?: number | null; tracking_url_template?: string | null }[]>(
    () => cachedMeta?.partners || []
  )
  const [courierServices, setCourierServices] = useState<{ id: number; name: string }[]>(
    () => cachedMeta?.services || []
  )
  const [packagingTypes, setPackagingTypes] = useState<MasterDataItem[]>(
    () => cachedMeta?.packaging || []
  )
  
  const [isCreatingService, setIsCreatingService] = useState(false)
  const [newServiceName, setNewServiceName] = useState("")
  const [newServicePrice, setNewServicePrice] = useState("0")

  const initialHasDims = Boolean(value.lengthCm || value.widthCm || value.heightCm)
  const [weightMode, setWeightMode] = useState<"direct" | "volumetric">(() => {
    return initialHasDims ? "volumetric" : "direct"
  })
  const [actualScaleWeight, setActualScaleWeight] = useState<number>(() => {
    const w = Number(value.weightKg) || 0
    if (initialHasDims) {
      const l = Number(value.lengthCm) || 0
      const wi = Number(value.widthCm) || 0
      const h = Number(value.heightCm) || 0
      const vol = (l > 0 && wi > 0 && h > 0) ? Math.round(((l * wi * h) / 5000) * 1000) / 1000 : 0
      return w > vol ? w : 0
    }
    return w
  })

  useEffect(() => {
    const hasDims = Boolean(value.lengthCm || value.widthCm || value.heightCm)
    if (hasDims) {
      setWeightMode("volumetric")
      const l = Number(value.lengthCm) || 0
      const wi = Number(value.widthCm) || 0
      const h = Number(value.heightCm) || 0
      const vol = (l > 0 && wi > 0 && h > 0) ? Math.round(((l * wi * h) / 5000) * 1000) / 1000 : 0
      const w = Number(value.weightKg) || 0
      if (w > vol) {
        setActualScaleWeight(w)
      }
    } else if (value.weightKg != null && !hasDims) {
      setWeightMode("direct")
      setActualScaleWeight(Number(value.weightKg) || 0)
    }
  }, [value.lengthCm, value.widthCm, value.heightCm, value.weightKg])

  const volumetricWeight = useMemo(() => {
    const l = Number(shipping.lengthCm) || 0
    const w = Number(shipping.widthCm) || 0
    const h = Number(shipping.heightCm) || 0
    if (l > 0 && w > 0 && h > 0) {
      return Math.round(((l * w * h) / 5000) * 1000) / 1000
    }
    return 0
  }, [shipping.lengthCm, shipping.widthCm, shipping.heightCm])

  const billableWeight = useMemo(() => {
    if (weightMode === "direct") {
      return Number(shipping.weightKg) || 0
    }
    return Math.max(actualScaleWeight, volumetricWeight)
  }, [weightMode, shipping.weightKg, actualScaleWeight, volumetricWeight])

  useEffect(() => {
    if (!deviceId) return

    let isMounted = true
    const cached = shippingMetaCacheByDevice.get(deviceId)
    const isFresh = cached && Date.now() - cached.timestamp < 5 * 60 * 1000

    if (isFresh && courierPartners.length > 0) {
      return
    }

    fetchShippingMeta(deviceId)
      .then((data) => {
        if (!isMounted) return
        setCourierPartners(data.partners)
        setCourierServices(data.services)
        setPackagingTypes(data.packaging)
      })
      .catch((error) => {
        console.error("[SaleShippingSection] Error fetching shipping data:", error)
      })

    return () => {
      isMounted = false
    }
  }, [deviceId, courierPartners.length])

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
        if (deviceId) {
          const cached = shippingMetaCacheByDevice.get(deviceId)
          if (cached) {
            cached.services = [...cached.services, newService]
          }
        }
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

  const handleDimensionChange = (key: "lengthCm" | "widthCm" | "heightCm", valStr: string) => {
    const val = valStr === "" ? null : Number.parseFloat(valStr)
    const l = key === "lengthCm" ? (val || 0) : (Number(shipping.lengthCm) || 0)
    const w = key === "widthCm" ? (val || 0) : (Number(shipping.widthCm) || 0)
    const h = key === "heightCm" ? (val || 0) : (Number(shipping.heightCm) || 0)
    const vol = (l > 0 && w > 0 && h > 0) ? Math.round(((l * w * h) / 5000) * 1000) / 1000 : 0
    const finalW = Math.max(actualScaleWeight, vol)
    patch({
      [key]: val,
      weightKg: finalW > 0 ? finalW : null,
    })
  }

  const handleActualWeightChange = (valStr: string) => {
    const parsed = valStr === "" ? 0 : Number.parseFloat(valStr) || 0
    setActualScaleWeight(parsed)
    const finalW = Math.max(parsed, volumetricWeight)
    patch({
      weightKg: finalW > 0 ? finalW : null,
    })
  }

  const handleWeightModeToggle = (mode: "direct" | "volumetric") => {
    setWeightMode(mode)
    if (mode === "direct") {
      const w = actualScaleWeight > 0 ? actualScaleWeight : (Number(shipping.weightKg) || null)
      patch({
        weightKg: w,
        lengthCm: null,
        widthCm: null,
        heightCm: null,
      })
    } else {
      const finalW = Math.max(actualScaleWeight, volumetricWeight)
      patch({ weightKg: finalW > 0 ? finalW : null })
    }
  }

  if (isJobCard && shipping.fulfillmentType !== "pickup" && !forceFullForm) {
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
                    {shipping.courierPartnerId && !courierPartners.some((c) => c.id === shipping.courierPartnerId) && (
                      <option value={shipping.courierPartnerId}>
                        {selectedCourierPartner?.name || `Partner #${shipping.courierPartnerId}`}
                      </option>
                    )}
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
                        <button type="button" onClick={handleCreateService} className="flex-1 bg-slate-900 text-white rounded text-xs py-1 font-bold">Save</button>
                        <button type="button" onClick={() => setIsCreatingService(false)} className="flex-1 bg-slate-200 text-slate-700 rounded text-xs py-1 font-bold">Cancel</button>
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

  const isPickupSelected = !forceFullForm && shipping.fulfillmentType === "pickup"

  return (
    <div className={cn("overflow-hidden rounded-xl border border-slate-200 bg-white", className)}>
      {!hidePickupToggle && !forceFullForm && (
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
      )}

      {isPickupSelected ? (
        <div className="px-3 py-4 text-xs text-slate-500">Customer pickup in store. No shipping details required.</div>
      ) : (
        <div className="space-y-4 p-3.5 sm:p-4">
          {/* Row 1: Delivery Status, Courier Partner, Courier Service, Packaging Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                DELIVERY STATUS
              </Label>
              {isLogisticsFulfillment ? (
                <div className="flex h-10 w-full items-center rounded-xl border border-slate-200 bg-slate-100 px-3 text-xs font-bold text-slate-700">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    {shipping.deliveryStatus || "Ready to Ship"}
                  </span>
                </div>
              ) : (
                <select
                  value={shipping.deliveryStatus || "Pending"}
                  onChange={(e) => patch({ deliveryStatus: e.target.value })}
                  className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10 cursor-pointer"
                >
                  {DELIVERY_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-800">
                COURIER PARTNER <span className="text-red-500">*</span>
              </Label>
              <select
                value={shipping.courierPartnerId ? String(shipping.courierPartnerId) : ""}
                onChange={(e) => handleCourierPartnerChange(e.target.value)}
                className={cn(
                  "flex h-10 w-full rounded-xl border bg-white px-3 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10 cursor-pointer",
                  errors?.courierPartner ? "border-red-500 ring-1 ring-red-500 bg-red-50/20" : "border-slate-200"
                )}
              >
                <option value="" className="font-normal">Select partner</option>
                {courierPartners.map((courier) => (
                  <option key={courier.id} value={courier.id}>
                    {courier.name}
                  </option>
                ))}
                {shipping.courierPartnerId && !courierPartners.some((c) => c.id === shipping.courierPartnerId) && (
                  <option value={shipping.courierPartnerId}>
                    {selectedCourierPartner?.name || `Partner #${shipping.courierPartnerId}`}
                  </option>
                )}
              </select>
              {errors?.courierPartner && (
                <p className="text-[11px] font-medium text-red-500">{errors.courierPartner}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                COURIER SERVICE
              </Label>
              {isCreatingService ? (
                <div className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1.5">
                  <Input 
                    placeholder="Service Name" 
                    value={newServiceName} 
                    onChange={e => setNewServiceName(e.target.value)} 
                    className="h-8 text-xs font-semibold bg-white rounded-lg" 
                  />
                  <div className="flex gap-1">
                    <button type="button" onClick={handleCreateService} className="flex-1 bg-slate-900 text-white rounded text-xs py-1 font-bold">Save</button>
                    <button type="button" onClick={() => setIsCreatingService(false)} className="flex-1 bg-slate-200 text-slate-700 rounded text-xs py-1 font-bold">Cancel</button>
                  </div>
                </div>
              ) : (
                <select
                  value={shipping.courierServiceId ? String(shipping.courierServiceId) : ""}
                  onChange={(e) => handleCourierServiceChange(e.target.value)}
                  className="flex h-10 w-full rounded-xl border-2 border-slate-900 bg-white px-3 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10 cursor-pointer"
                >
                  <option value="">Select service</option>
                  {courierServices.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                  {shipping.courierServiceId && !courierServices.some((s) => s.id === shipping.courierServiceId) && (
                    <option value={shipping.courierServiceId}>
                      {shipping.courierServiceName || `Service #${shipping.courierServiceId}`}
                    </option>
                  )}
                  <option value="create_new">+ Create New Courier Service</option>
                </select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                PACKAGING TYPE
              </Label>
              <select
                value={shipping.packagingTypeId ? String(shipping.packagingTypeId) : ""}
                onChange={(e) => handlePackagingChange(e.target.value)}
                className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10 cursor-pointer"
              >
                <option value="">Select packag...</option>
                {packagingTypes.map((packaging) => (
                  <option key={packaging.id} value={packaging.id}>
                    {packaging.name}
                  </option>
                ))}
                {shipping.packagingTypeId && !packagingTypes.some((p) => p.id === shipping.packagingTypeId) && (
                  <option value={shipping.packagingTypeId}>
                    {shipping.packagingTypeName || `Packaging #${shipping.packagingTypeId}`}
                  </option>
                )}
              </select>
            </div>
          </div>

          {/* Row 2: Tracking ID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                TRACKING ID
              </Label>
              <Input
                value={shipping.trackingId || ""}
                onChange={(e) => patch({ trackingId: e.target.value })}
                placeholder="AWB / tracking..."
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-500/20"
              />
            </div>
          </div>

          {/* Row 3: Shipping Address */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
              SHIPPING ADDRESS <span className="text-red-500">*</span>
            </Label>
            <Textarea
              value={shipping.shippingAddress || ""}
              onChange={(e) => patch({ shippingAddress: e.target.value })}
              placeholder="Delivery address"
              className={cn(
                "min-h-[85px] w-full rounded-xl border bg-white p-3 text-xs font-medium text-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-500/20",
                errors?.shippingAddress ? "border-red-500 ring-1 ring-red-500 bg-red-50/20" : "border-slate-200"
              )}
            />
            {errors?.shippingAddress && (
              <p className="text-[11px] font-medium text-red-500">{errors.shippingAddress}</p>
            )}
          </div>

          {/* Row 4: Weight Input Mode Toggle & Fields */}
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
              <div>
                <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  Weight Mode
                </Label>
              </div>

              {/* Toggle Buttons */}
              <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => handleWeightModeToggle("direct")}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                    weightMode === "direct"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  )}
                >
                  Direct Weight
                </button>
                <button
                  type="button"
                  onClick={() => handleWeightModeToggle("volumetric")}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                    weightMode === "volumetric"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  )}
                >
                  Volumetric
                </button>
              </div>
            </div>

            {weightMode === "direct" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                    WEIGHT (KG)
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.001"
                    placeholder="e.g. 1.25"
                    value={shipping.weightKg ?? ""}
                    onChange={(e) => {
                      const val = e.target.value === "" ? null : Number.parseFloat(e.target.value)
                      setActualScaleWeight(val || 0)
                      patch({ weightKg: val })
                    }}
                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-500/20"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                      LENGTH (CM)
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="Length in cm"
                      value={shipping.lengthCm ?? ""}
                      onChange={(e) => handleDimensionChange("lengthCm", e.target.value)}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-500/20"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                      WIDTH (CM)
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="Width in cm"
                      value={shipping.widthCm ?? ""}
                      onChange={(e) => handleDimensionChange("widthCm", e.target.value)}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-500/20"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                      HEIGHT (CM)
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="Height in cm"
                      value={shipping.heightCm ?? ""}
                      onChange={(e) => handleDimensionChange("heightCm", e.target.value)}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-500/20"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                      ACTUAL WEIGHT (KG) <span className="text-slate-400 font-normal">(Optional)</span>
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.001"
                      placeholder="Dead weight (kg)"
                      value={actualScaleWeight > 0 ? actualScaleWeight : ""}
                      onChange={(e) => handleActualWeightChange(e.target.value)}
                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-500/20"
                    />
                  </div>
                </div>

                {/* Volumetric Weight & Comparison Banner */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-xs text-indigo-950">
                  <div className="flex items-center gap-5 flex-wrap">
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-indigo-600 block">Volumetric Weight</span>
                      <span className="font-bold text-slate-800">{volumetricWeight > 0 ? `${volumetricWeight.toFixed(3)} kg` : "—"}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-indigo-600 block">Actual Scale Weight</span>
                      <span className="font-bold text-slate-800">{actualScaleWeight > 0 ? `${actualScaleWeight.toFixed(3)} kg` : "—"}</span>
                    </div>
                  </div>

                  <div className="rounded-lg bg-indigo-600 px-3 py-1.5 text-white">
                    <span className="text-[10px] uppercase tracking-wider block opacity-85 font-medium">Applied Billable Weight</span>
                    <span className="font-black text-sm">{billableWeight > 0 ? `${billableWeight.toFixed(3)} kg` : "—"}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Row 5: Courier Paid (Extra), Expense: Courier, Expense: Packing */}
          <div className="rounded-2xl border border-slate-200/90 bg-slate-50/50 p-3.5 sm:p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  COURIER PAID (EXTRA)
                </Label>
                {isLogisticsFulfillment ? (
                  <div className="flex h-10 w-full items-center rounded-xl border border-slate-200 bg-slate-100 px-3 text-xs font-bold text-slate-700">
                    {formatCurrency
                      ? formatCurrency(Number(shipping.courierPaidExtra || 0))
                      : `${currency} ${Number(shipping.courierPaidExtra || 0).toFixed(2)}`}
                  </div>
                ) : (
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={shipping.courierPaidExtra ?? 0}
                    onChange={(e) => patch({ courierPaidExtra: Number.parseFloat(e.target.value) || 0 })}
                    className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-500/20"
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  EXPENSE: COURIER
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={shipping.expenseCourier ?? 0}
                  onChange={(e) => patch({ expenseCourier: Number.parseFloat(e.target.value) || 0 })}
                  className="h-10 rounded-xl border border-amber-200/80 bg-[#FFFDF0] px-3 text-xs font-bold text-slate-900 focus-visible:ring-2 focus-visible:ring-amber-500/20"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  EXPENSE: PACKING
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={shipping.expensePacking ?? 0}
                  onChange={(e) => patch({ expensePacking: Number.parseFloat(e.target.value) || 0 })}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-500/20"
                />
              </div>
            </div>
          </div>

          {/* Row 6: Shipping Notes */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              SHIPPING NOTES
            </Label>
            <Textarea
              value={shipping.shippingNotes || ""}
              onChange={(e) => patch({ shippingNotes: e.target.value })}
              placeholder="Fragile, call before delivery, etc."
              className="min-h-[75px] w-full rounded-xl border border-slate-200 bg-white p-3 text-xs font-medium text-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-500/20"
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
