"use client"

import { useEffect, useMemo, useState } from "react"
import { Package, Truck } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { getMasterDataItems } from "@/app/actions/master-data-actions"
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
}

export default function SaleShippingSection({
  deviceId,
  value,
  onChange,
  customerAddress,
  currency = "AED",
  className,
}: SaleShippingSectionProps) {
  const shipping = { ...DEFAULT_SALE_SHIPPING, ...value }
  const [couriers, setCouriers] = useState<MasterDataItem[]>([])
  const [packagingTypes, setPackagingTypes] = useState<MasterDataItem[]>([])

  useEffect(() => {
    if (!deviceId) return

    Promise.all([getMasterDataItems(deviceId, "courier"), getMasterDataItems(deviceId, "packaging")]).then(
      ([courierResult, packagingResult]) => {
        if (courierResult.success) {
          setCouriers((courierResult.data || []).filter((item: any) => item.is_active !== false))
        }
        if (packagingResult.success) {
          setPackagingTypes((packagingResult.data || []).filter((item: any) => item.is_active !== false))
        }
      },
    )
  }, [deviceId])

  const selectedCourier = useMemo(
    () => couriers.find((courier) => courier.id === shipping.courierServiceId) || null,
    [couriers, shipping.courierServiceId],
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

  const handleCourierChange = (courierId: string) => {
    if (!courierId) {
      patch({ courierServiceId: null, courierServiceName: "" })
      return
    }

    const courier = couriers.find((item) => String(item.id) === courierId)
    patch({
      courierServiceId: courier?.id || null,
      courierServiceName: courier?.name || "",
    })
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
              <Label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Courier service
              </Label>
              <select
                value={shipping.courierServiceId ? String(shipping.courierServiceId) : ""}
                onChange={(e) => handleCourierChange(e.target.value)}
                className="flex h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900"
              >
                <option value="">Select courier</option>
                {couriers.map((courier) => (
                  <option key={courier.id} value={courier.id}>
                    {courier.name}
                  </option>
                ))}
              </select>
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

          {selectedCourier?.tracking_url_template && shipping.trackingId ? (
            <p className="text-[11px] text-slate-500">
              Tracking template available for {selectedCourier.name}. Link can be opened after saving the sale.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Truck className="h-3.5 w-3.5" />
              {selectedCourier?.name || "No courier selected"}
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
