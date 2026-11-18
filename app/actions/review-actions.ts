"use server"

import { sql } from "@/lib/db"
import { revalidatePath, unstable_noStore as noStore } from "next/cache"
import { getStaffSession } from "@/lib/staff-session"
import { del } from "@vercel/blob"

export interface ReviewMediaItem {
  url: string
  type: "image" | "video"
  name?: string
  size?: number
}

export interface SaleReviewRecord {
  id: number
  sale_id: number
  company_id: number | null
  device_id: number | null
  staff_id: number | null
  staff_name?: string
  customer_id: number | null
  review_text: string | null
  media_urls: ReviewMediaItem[]
  created_at: string
  updated_at: string
}

function parseMediaUrls(val: any): ReviewMediaItem[] {
  if (!val) return []
  if (Array.isArray(val)) return val
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val)
      if (Array.isArray(parsed)) return parsed
      if (typeof parsed === "string") {
        const doubleParsed = JSON.parse(parsed)
        if (Array.isArray(doubleParsed)) return doubleParsed
      }
    } catch (_) {}
  }
  return []
}

/**
 * Get review for a specific sale
 */
export async function getSaleReview(saleId: number): Promise<{
  success: boolean
  review: SaleReviewRecord | null
  message?: string
}> {
  noStore()
  try {
    const rows = await sql`
      SELECT 
        sr.id,
        sr.sale_id,
        sr.company_id,
        sr.device_id,
        sr.staff_id,
        sr.customer_id,
        sr.review_text,
        COALESCE(sr.media_urls, '[]'::jsonb) as media_urls,
        sr.created_at,
        sr.updated_at,
        st.name as staff_name
      FROM sale_reviews sr
      LEFT JOIN staff st ON sr.staff_id = st.id
      WHERE sr.sale_id = ${saleId}
      LIMIT 1
    `

    if (rows.length === 0) {
      return { success: true, review: null }
    }

    const row = rows[0]
    return {
      success: true,
      review: {
        id: row.id,
        sale_id: row.sale_id,
        company_id: row.company_id,
        device_id: row.device_id,
        staff_id: row.staff_id,
        staff_name: row.staff_name,
        customer_id: row.customer_id,
        review_text: row.review_text || "",
        media_urls: parseMediaUrls(row.media_urls),
        created_at: row.created_at ? new Date(row.created_at).toISOString() : "",
        updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : "",
      },
    }
  } catch (error: any) {
    console.error("getSaleReview error:", error)
    return { success: false, review: null, message: error.message || "Failed to load review" }
  }
}

/**
 * Check which sale IDs already have a review
 */
export async function getSalesWithReviews(saleIds: number[]): Promise<Record<number, boolean>> {
  noStore()
  if (!saleIds || saleIds.length === 0) return {}
  try {
    const rows = await sql`
      SELECT sale_id 
      FROM sale_reviews 
      WHERE sale_id = ANY(${saleIds})
    `

    const reviewMap: Record<number, boolean> = {}
    for (const r of rows) {
      reviewMap[Number(r.sale_id)] = true
    }
    return reviewMap
  } catch (error) {
    console.warn("getSalesWithReviews error:", error)
    return {}
  }
}

/**
 * Save or update a review for a delivered sale
 */
export async function saveSaleReview(input: {
  saleId: number
  reviewText: string
  mediaUrls: ReviewMediaItem[]
}): Promise<{
  success: boolean
  review?: SaleReviewRecord
  message?: string
}> {
  try {
    const session = await getStaffSession()
    const staffId = session?.staffId ?? null
    const sessionDeviceId = session?.deviceId ?? null
    const sessionCompanyId = session?.companyId ?? null

    // Look up the sale to retrieve its device_id, customer_id, and device's company_id
    const saleRows = await sql`
      SELECT s.id, s.device_id, s.staff_id, s.customer_id, s.delivery_status, d.company_id
      FROM sales s
      LEFT JOIN devices d ON s.device_id = d.id
      WHERE s.id = ${input.saleId}
      LIMIT 1
    `

    if (saleRows.length === 0) {
      return { success: false, message: "Order / Sale not found" }
    }

    const sale = saleRows[0]
    const companyId = sale.company_id ?? sessionCompanyId ?? null
    const deviceId = sale.device_id ?? sessionDeviceId ?? null
    const customerId = sale.customer_id ?? null
    const effectiveStaffId = staffId ?? sale.staff_id ?? null

    const mediaJson = JSON.stringify(input.mediaUrls || [])

    const upsertRows = await sql`
      INSERT INTO sale_reviews (
        sale_id,
        company_id,
        device_id,
        staff_id,
        customer_id,
        review_text,
        media_urls,
        created_at,
        updated_at
      ) VALUES (
        ${input.saleId},
        ${companyId},
        ${deviceId},
        ${effectiveStaffId},
        ${customerId},
        ${input.reviewText || ""},
        ${mediaJson}::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT (sale_id) DO UPDATE SET
        review_text = EXCLUDED.review_text,
        media_urls = EXCLUDED.media_urls,
        staff_id = COALESCE(EXCLUDED.staff_id, sale_reviews.staff_id),
        company_id = COALESCE(EXCLUDED.company_id, sale_reviews.company_id),
        device_id = COALESCE(EXCLUDED.device_id, sale_reviews.device_id),
        customer_id = COALESCE(EXCLUDED.customer_id, sale_reviews.customer_id),
        updated_at = NOW()
      RETURNING *
    `

    revalidatePath("/staff/dashboard")
    revalidatePath("/dashboard")

    const saved = upsertRows[0]
    return {
      success: true,
      review: {
        id: saved.id,
        sale_id: saved.sale_id,
        company_id: saved.company_id,
        device_id: saved.device_id,
        staff_id: saved.staff_id,
        customer_id: saved.customer_id,
        review_text: saved.review_text || "",
        media_urls: parseMediaUrls(saved.media_urls),
        created_at: saved.created_at ? new Date(saved.created_at).toISOString() : "",
        updated_at: saved.updated_at ? new Date(saved.updated_at).toISOString() : "",
      },
    }
  } catch (error: any) {
    console.error("saveSaleReview error:", error)
    return { success: false, message: error.message || "Failed to save review" }
  }
}

/**
 * Delete a media item from blob storage
 */
export async function deleteReviewMediaFile(blobUrl: string): Promise<{ success: boolean }> {
  try {
    if (!blobUrl || !blobUrl.includes("blob.vercel-storage.com")) {
      return { success: true }
    }
    await del(blobUrl)
    return { success: true }
  } catch (error) {
    console.warn("Failed to delete blob media:", error)
    return { success: false }
  }
}

