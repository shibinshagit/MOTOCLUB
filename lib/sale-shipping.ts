export type FulfillmentType = "pickup" | "ship"

export const DELIVERY_STATUSES = [
  "Pending",
  "Packed",
  "Shipped",
  "In transit",
  "Delivered",
  "Returned",
  "Failed",
] as const

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

export type SaleShippingInput = {
  fulfillmentType?: FulfillmentType
  deliveryStatus?: DeliveryStatus | string | null
  courierServiceId?: number | null
  courierServiceName?: string | null
  packagingTypeId?: number | null
  packagingTypeName?: string | null
  trackingId?: string | null
  shippingAddress?: string | null
  weightKg?: number | null
  lengthCm?: number | null
  widthCm?: number | null
  heightCm?: number | null
  courierPaidExtra?: number | null
  expenseCourier?: number | null
  expensePacking?: number | null
  shippingNotes?: string | null
}

export type SaleShippingRecord = SaleShippingInput & {
  shippedAt?: string | null
  deliveredAt?: string | null
}

export const DEFAULT_SALE_SHIPPING: Required<
  Pick<
    SaleShippingInput,
    | "fulfillmentType"
    | "deliveryStatus"
    | "courierServiceId"
    | "courierServiceName"
    | "packagingTypeId"
    | "packagingTypeName"
    | "trackingId"
    | "shippingAddress"
    | "weightKg"
    | "lengthCm"
    | "widthCm"
    | "heightCm"
    | "courierPaidExtra"
    | "expenseCourier"
    | "expensePacking"
    | "shippingNotes"
  >
> = {
  fulfillmentType: "pickup",
  deliveryStatus: "Pending",
  courierServiceId: null,
  courierServiceName: "",
  packagingTypeId: null,
  packagingTypeName: "",
  trackingId: "",
  shippingAddress: "",
  weightKg: null,
  lengthCm: null,
  widthCm: null,
  heightCm: null,
  courierPaidExtra: 0,
  expenseCourier: 0,
  expensePacking: 0,
  shippingNotes: "",
}

export function buildTrackingUrl(template?: string | null, trackingId?: string | null) {
  if (!template || !trackingId?.trim()) return null
  if (template.includes("{tracking_id}")) {
    return template.replaceAll("{tracking_id}", encodeURIComponent(trackingId.trim()))
  }
  return template.endsWith("/")
    ? `${template}${encodeURIComponent(trackingId.trim())}`
    : `${template}/${encodeURIComponent(trackingId.trim())}`
}

export function getSaleDeliveryLabel(sale: {
  fulfillment_type?: string | null
  delivery_status?: string | null
}) {
  if (sale.fulfillment_type !== "ship") return "Pickup"
  return sale.delivery_status || "Pending"
}

export function normalizeSaleShippingInput(input?: SaleShippingInput | null) {
  const fulfillmentType: FulfillmentType = input?.fulfillmentType === "ship" ? "ship" : "pickup"

  if (fulfillmentType === "pickup") {
    return {
      fulfillment_type: "pickup" as const,
      delivery_status: null,
      courier_service_id: null,
      courier_service_name: null,
      packaging_type_id: null,
      packaging_type_name: null,
      tracking_id: null,
      shipping_address: null,
      weight_kg: null,
      length_cm: null,
      width_cm: null,
      height_cm: null,
      courier_paid_extra: 0,
      expense_courier: 0,
      expense_packing: 0,
      shipped_at: null,
      delivered_at: null,
      shipping_notes: null,
    }
  }

  const deliveryStatus = input?.deliveryStatus || "Pending"
  const shippedAt =
    input && "shippedAt" in input && input.shippedAt
      ? input.shippedAt
      : ["Shipped", "In transit", "Delivered"].includes(String(deliveryStatus))
        ? new Date().toISOString()
        : null
  const deliveredAt =
    input && "deliveredAt" in input && input.deliveredAt
      ? input.deliveredAt
      : deliveryStatus === "Delivered"
        ? new Date().toISOString()
        : null

  return {
    fulfillment_type: "ship" as const,
    delivery_status: deliveryStatus,
    courier_service_id: input?.courierServiceId || null,
    courier_service_name: input?.courierServiceName?.trim() || null,
    packaging_type_id: input?.packagingTypeId || null,
    packaging_type_name: input?.packagingTypeName?.trim() || null,
    tracking_id: input?.trackingId?.trim() || null,
    shipping_address: input?.shippingAddress?.trim() || null,
    weight_kg: input?.weightKg ?? null,
    length_cm: input?.lengthCm ?? null,
    width_cm: input?.widthCm ?? null,
    height_cm: input?.heightCm ?? null,
    courier_paid_extra: Number(input?.courierPaidExtra) || 0,
    expense_courier: Number(input?.expenseCourier) || 0,
    expense_packing: Number(input?.expensePacking) || 0,
    shipped_at: shippedAt,
    delivered_at: deliveredAt,
    shipping_notes: input?.shippingNotes?.trim() || null,
  }
}

export function mapSaleShippingFromRecord(record: Record<string, unknown>): SaleShippingRecord {
  return {
    fulfillmentType: (record.fulfillment_type as FulfillmentType) || "pickup",
    deliveryStatus: (record.delivery_status as string) || "Pending",
    courierServiceId: (record.courier_service_id as number) || null,
    courierServiceName: (record.courier_service_name as string) || "",
    packagingTypeId: (record.packaging_type_id as number) || null,
    packagingTypeName: (record.packaging_type_name as string) || "",
    trackingId: (record.tracking_id as string) || "",
    shippingAddress: (record.shipping_address as string) || "",
    weightKg: record.weight_kg != null ? Number(record.weight_kg) : null,
    lengthCm: record.length_cm != null ? Number(record.length_cm) : null,
    widthCm: record.width_cm != null ? Number(record.width_cm) : null,
    heightCm: record.height_cm != null ? Number(record.height_cm) : null,
    courierPaidExtra: Number(record.courier_paid_extra) || 0,
    expenseCourier: Number(record.expense_courier) || 0,
    expensePacking: Number(record.expense_packing) || 0,
    shippingNotes: (record.shipping_notes as string) || "",
    shippedAt: (record.shipped_at as string) || null,
    deliveredAt: (record.delivered_at as string) || null,
  }
}
