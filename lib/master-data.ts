export const MASTER_DATA_CATEGORIES = [
  {
    id: "courier",
    label: "Courier Services",
    description: "Shipping partners used on sales and deliveries.",
  },
  {
    id: "manual_category",
    label: "Manual Entry Categories",
    description: "Standard categories for petty cash and manual accounting entries.",
  },
  {
    id: "trending",
    label: "Trending Products",
    description: "View and manage products highlighted in trending lists.",
  },
  {
    id: "staff",
    label: "Staff Management",
    description: "Manage staff members, roles, sales performance, payroll, and staff requests.",
  },
  {
    id: "ecommerce_banner",
    label: "E-Commerce Banners",
    description: "Manage homepage promotional banners, hero images, title, description, and links for the e-commerce home page carousel.",
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

export type BannerImageItem = {
  url: string
  title?: string
  subtitle?: string
  productId?: number
}

export type EcommerceBannerMetadata = {
  imageUrl?: string
  images?: BannerImageItem[]
  selectedProductIds?: number[]
  bannerType?: "custom" | "product_carousel"
  subtitle?: string
  ctaText?: string
  ctaUrl?: string
  badgeText?: string
  themeColor?: string
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
  imageUrl?: string
  images?: BannerImageItem[]
  selectedProductIds?: number[]
  bannerType?: "custom" | "product_carousel"
  subtitle?: string
  ctaText?: string
  ctaUrl?: string
  badgeText?: string
  themeColor?: string
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

export function getEcommerceBannerMetadata(metadata?: Record<string, unknown> | string | null): EcommerceBannerMetadata {
  if (!metadata) return {}

  let metaObj: Record<string, unknown> = {}
  if (typeof metadata === "string") {
    try {
      metaObj = JSON.parse(metadata)
    } catch {
      metaObj = {}
    }
  } else if (typeof metadata === "object" && metadata !== null) {
    metaObj = metadata as Record<string, unknown>
  }

  const rawImages = (metaObj.images as any[]) || []
  let images: BannerImageItem[] = rawImages
    .map((img) => {
      if (typeof img === "string") return { url: img }
      if (img && typeof img === "object") {
        return {
          url: String(img.url || ""),
          title: img.title ? String(img.title) : undefined,
          subtitle: img.subtitle ? String(img.subtitle) : undefined,
          productId: img.productId ? Number(img.productId) : undefined,
        }
      }
      return { url: "" }
    })
    .filter((img) => Boolean(img.url))

  const singleImageUrl = (metaObj.imageUrl as string) || (metaObj.image_url as string) || ""

  if (images.length === 0 && singleImageUrl) {
    images = [{ url: singleImageUrl }]
  }

  return {
    imageUrl: singleImageUrl || (images[0]?.url || ""),
    images,
    selectedProductIds: Array.isArray(metaObj.selectedProductIds) ? metaObj.selectedProductIds.map(Number) : [],
    bannerType: (metaObj.bannerType as "custom" | "product_carousel") || "custom",
    subtitle: (metaObj.subtitle as string) || "",
    ctaText: (metaObj.ctaText as string) || (metaObj.cta_text as string) || "Shop Now",
    ctaUrl: (metaObj.ctaUrl as string) || (metaObj.cta_url as string) || "",
    badgeText: (metaObj.badgeText as string) || (metaObj.badge_text as string) || "",
    themeColor: (metaObj.themeColor as string) || (metaObj.theme_color as string) || "violet",
  }
}


