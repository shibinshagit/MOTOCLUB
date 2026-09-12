export const REPLACEMENT_REASONS = [
  "Missing Item",
  "Damaged Item",
  "Wrong Item",
  "Short Quantity",
  "Other",
] as const

export type ReplacementReason = (typeof REPLACEMENT_REASONS)[number]

export interface ReplacementItemInput {
  saleItemId: number
  productId: number
  productVariantId?: number | null
  batchId?: number | null
  quantity: number
}

export interface CreateReplacementInput {
  saleId: number
  reason: ReplacementReason | string
  items: ReplacementItemInput[]
  fulfillmentType?: "ship" | "pickup"
  courierPartnerId?: number | null
  courierServiceId?: number | null
  courierServiceName?: string | null
  trackingId?: string | null
  shippingDate?: string | null
  shippingAddress?: string | null
  shippingCity?: string | null
  shippingStreet?: string | null
  shippingLandmark?: string | null
  shippingAddressType?: string | null
  shippingPincode?: string | null
  notes?: string | null
  deviceId?: number | null
  staffId?: number | null
}
