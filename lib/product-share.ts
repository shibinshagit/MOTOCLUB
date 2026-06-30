import { randomBytes } from "crypto"
import { parseProductLinks, type ProductLinkEntry } from "@/lib/product-links"

export type PublicSharedProduct = {
  name: string
  companyName: string | null
  categoryName: string | null
  description: string | null
  color: string | null
  size: string | null
  suitableFor: string | null
  attributes: Array<{ key: string; value: string }>
  links: ProductLinkEntry[]
  imageUrls: string[]
  videoUrl: string | null
  storeName: string | null
  storeLogoUrl: string | null
}

export const DEFAULT_SHARE_LINK_DAYS = 90

export function generateShareToken() {
  return randomBytes(32).toString("base64url")
}

export function buildShareUrl(token: string, baseUrl: string) {
  const normalizedBase = baseUrl.replace(/\/$/, "")
  return `${normalizedBase}/share/p/${token}`
}

export function parseProductImageUrls(product: {
  image_urls?: unknown
  image_url?: string | null
}): string[] {
  let urls: string[] = []

  if (Array.isArray(product.image_urls)) {
    urls = product.image_urls.filter((url): url is string => typeof url === "string" && url.trim().length > 0)
  } else if (typeof product.image_urls === "string" && product.image_urls.trim()) {
    try {
      const parsed = JSON.parse(product.image_urls)
      if (Array.isArray(parsed)) {
        urls = parsed.filter((url): url is string => typeof url === "string" && url.trim().length > 0)
      }
    } catch {
      urls = []
    }
  }

  if (urls.length === 0 && product.image_url?.trim()) {
    urls = [product.image_url.trim()]
  }

  return urls.slice(0, 4)
}

export function parseProductAttributes(raw: unknown): Array<{ key: string; value: string }> {
  if (!raw) return []

  try {
    const attrs = typeof raw === "string" ? JSON.parse(raw) : raw
    if (!Array.isArray(attrs)) return []

    return attrs
      .filter((item) => item && typeof item.key === "string")
      .map((item) => ({
        key: String(item.key),
        value: item.value != null ? String(item.value) : "",
      }))
  } catch {
    return []
  }
}

export function mapRowToPublicSharedProduct(row: Record<string, unknown>): PublicSharedProduct {
  return {
    name: String(row.name || "Product"),
    companyName: row.product_company_name ? String(row.product_company_name) : null,
    categoryName: row.category_name ? String(row.category_name) : null,
    description: row.description ? String(row.description) : null,
    color: row.color ? String(row.color) : null,
    size: row.size ? String(row.size) : null,
    suitableFor: row.suitable_for ? String(row.suitable_for) : null,
    attributes: parseProductAttributes(row.attributes),
    links: parseProductLinks(row.link),
    imageUrls: parseProductImageUrls({
      image_urls: row.image_urls,
      image_url: row.image_url as string | null,
    }),
    videoUrl: typeof row.video_url === "string" && row.video_url.trim() ? row.video_url.trim() : null,
    storeName: row.store_name ? String(row.store_name) : null,
    storeLogoUrl: row.store_logo_url ? String(row.store_logo_url) : null,
  }
}
