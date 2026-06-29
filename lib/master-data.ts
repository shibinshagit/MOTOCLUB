export const MASTER_DATA_CATEGORIES = [
  {
    id: "courier",
    label: "Courier Services",
    description: "Shipping partners used on sales and deliveries.",
  },
  {
    id: "packaging",
    label: "Packaging Types",
    description: "Common packaging options for shipped orders.",
  },
] as const

export type MasterDataCategory = (typeof MASTER_DATA_CATEGORIES)[number]["id"]

export type MasterDataItem = {
  id: number
  device_id: number
  category: MasterDataCategory | string
  name: string
  code?: string | null
  contact_phone?: string | null
  contact_email?: string | null
  website?: string | null
  tracking_url_template?: string | null
  notes?: string | null
  metadata?: Record<string, unknown> | null
  is_active?: boolean
  sort_order?: number
  created_at?: string
  updated_at?: string
}

export type MasterDataInput = {
  category: MasterDataCategory | string
  name: string
  code?: string
  contactPhone?: string
  contactEmail?: string
  website?: string
  trackingUrlTemplate?: string
  notes?: string
  defaultCost?: string | number
  isActive?: boolean
  sortOrder?: number
}

export function getMasterDataCategoryLabel(category: string) {
  return MASTER_DATA_CATEGORIES.find((item) => item.id === category)?.label || category
}

export function getPackagingDefaultCost(metadata?: Record<string, unknown> | null): number | null {
  const cost = metadata?.default_cost
  if (cost === null || cost === undefined || cost === "") return null
  const parsed = Number(cost)
  return Number.isFinite(parsed) ? parsed : null
}
