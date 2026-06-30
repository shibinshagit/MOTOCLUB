import { sql } from "@/lib/db"
import {
  DEFAULT_SHARE_LINK_DAYS,
  mapRowToPublicSharedProduct,
  type PublicSharedProduct,
} from "@/lib/product-share"

export async function fetchSharedProductByToken(
  token: string,
  options?: { recordView?: boolean },
): Promise<{
  success: boolean
  message?: string
  data?: PublicSharedProduct
}> {
  if (!token?.trim()) {
    return { success: false, message: "Invalid link" }
  }

  try {
    const rows = await sql`
      SELECT
        p.name,
        p.company_name AS product_company_name,
        p.description,
        p.color,
        p.size,
        p.suitable_for,
        p.attributes,
        p.link,
        p.image_urls,
        p.image_url,
        p.video_url,
        c.name AS category_name,
        d.name AS store_name,
        d.logo_url AS store_logo_url,
        psl.id AS share_link_id
      FROM product_share_links psl
      JOIN products p ON p.id = psl.product_id
      JOIN devices d ON d.id = psl.device_id
      LEFT JOIN product_categories c ON c.id = p.category_id
      WHERE psl.token = ${token.trim()}
        AND psl.revoked_at IS NULL
        AND (psl.expires_at IS NULL OR psl.expires_at > NOW())
        AND p.created_by IN (
          SELECT d2.id
          FROM devices d2
          WHERE d2.company_id = d.company_id
        )
      LIMIT 1
    `

    if (rows.length === 0) {
      return { success: false, message: "This link is invalid or has expired." }
    }

    if (options?.recordView !== false) {
      await sql`
        UPDATE product_share_links
        SET view_count = view_count + 1
        WHERE id = ${rows[0].share_link_id}
      `
    }

    return {
      success: true,
      data: mapRowToPublicSharedProduct(rows[0] as Record<string, unknown>),
    }
  } catch (error) {
    console.error("fetchSharedProductByToken error:", error)
    return { success: false, message: "Unable to load this product." }
  }
}

export async function verifyProductShareAccess(productId: number, deviceId: number) {
  const rows = await sql`
    SELECT p.id
    FROM products p
    WHERE p.id = ${productId}
      AND p.created_by IN (
        SELECT d2.id
        FROM devices d1
        JOIN devices d2 ON d2.company_id = d1.company_id
        WHERE d1.id = ${deviceId}
      )
    LIMIT 1
  `

  return rows.length > 0
}

export function getShareExpiryDate(days = DEFAULT_SHARE_LINK_DAYS) {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + days)
  return expiresAt
}
