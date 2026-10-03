"use server"

import { sql, getLastError } from "@/lib/db"
import { getStaffSession } from "@/lib/staff-session"
import { getServerActor } from "@/lib/device-access"
import { getPaginatedProducts } from "@/app/actions/product-actions"

import { revalidatePath } from "next/cache"

export async function getStaffInventory(
  options?: { page?: number; pageSize?: number; searchTerm?: string; categoryId?: number | null; categoryName?: string | null } | string
) {
  try {
    const session = await getStaffSession()
    if (!session || !session.deviceId || !session.companyId) {
      return {
        success: false,
        message: "Unauthorized or device not assigned",
        data: [],
        totalCount: 0,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      }
    }
    const deviceId = session.deviceId

    let page = 1
    let pageSize = 10
    let searchTerm = ""
    let categoryId: number | null = null
    let categoryName: string | null = null

    if (typeof options === "string") {
      searchTerm = options
    } else if (options && typeof options === "object") {
      page = options.page ?? 1
      pageSize = options.pageSize ?? 10
      searchTerm = options.searchTerm ?? ""
      categoryId = options.categoryId ?? null
      categoryName = options.categoryName ?? null
    }

    const [deviceRow] = await sql`SELECT name FROM devices WHERE id = ${deviceId}`
    const branchName = deviceRow?.name || "Main"

    // Delegate entirely to the shared paginated inventory query
    // Pass skipRbac=true because the inventory page explicitly exists for viewing stock and locations.
    const res = await getPaginatedProducts({
      userId: deviceId,
      page,
      pageSize,
      searchTerm,
      categoryId,
      categoryName,
      skipRbac: true,
    })

    if (res.success && res.data) {
      res.data = res.data.map((p: any) => ({
        ...p,
        branch_name: branchName,
      }))
    }

    return res
  } catch (error) {
    console.error("Get staff inventory error:", error)
    return {
      success: false,
      message: "Failed to fetch inventory",
      data: [],
      totalCount: 0,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    }
  }
}

export async function getStaffInventoryStats() {
  try {
    const session = await getStaffSession()
    if (!session || !session.deviceId) {
      return {
        success: false,
        message: "Unauthorized",
        stats: { total: 0, available: 0, low: 0, out: 0 },
      }
    }
    const deviceId = session.deviceId

    const statsRes = await sql`
      SELECT 
        COUNT(*)::int AS total,
        COUNT(CASE WHEN COALESCE(ds.stock, 0) > 0 THEN 1 END)::int AS available,
        COUNT(CASE WHEN COALESCE(ds.stock, 0) > 0 AND COALESCE(ds.stock, 0) <= 5 THEN 1 END)::int AS low,
        COUNT(CASE WHEN COALESCE(ds.stock, 0) <= 0 THEN 1 END)::int AS out
      FROM products p
      LEFT JOIN (
        SELECT product_id, SUM(stock) as stock FROM (
          SELECT pds.product_id, pds.stock FROM product_device_stock pds WHERE pds.device_id = ${deviceId}
          UNION ALL
          SELECT pv.product_id, pbds.stock FROM product_batch_device_stock pbds
          JOIN product_batches pb ON pb.id = pbds.batch_id
          JOIN product_variants pv ON pv.id = pb.product_variant_id
          WHERE pbds.device_id = ${deviceId}
        ) s GROUP BY product_id
      ) ds ON ds.product_id = p.id
      WHERE p.created_by IN (
        SELECT d2.id FROM devices d1 JOIN devices d2 ON d2.company_id = d1.company_id WHERE d1.id = ${deviceId}
      )
    `

    const row = statsRes[0] || {}
    return {
      success: true,
      stats: {
        total: Number(row.total || 0),
        available: Number(row.available || 0),
        low: Number(row.low || 0),
        out: Number(row.out || 0),
      },
    }
  } catch (error) {
    console.error("Get staff inventory stats error:", error)
    return {
      success: false,
      stats: { total: 0, available: 0, low: 0, out: 0 },
    }
  }
}

/**
 * Who may read/change product media, from the server session only. Staff, device admins and platform
 * admins can; the product must belong to the actor's company (platform admins: any). Media lives on the
 * product row itself, so every authorized user of that company sees the same photos and video.
 */
async function resolveMediaScope(): Promise<{ companyId: number | null } | null> {
  const actor = await getServerActor()
  if (!actor) return null
  if (actor.kind === "platform_admin") return { companyId: null }
  const rows = await sql`SELECT company_id FROM devices WHERE id = ${actor.deviceId} LIMIT 1`
  const companyId = rows[0]?.company_id != null ? Number(rows[0].company_id) : null
  return companyId ? { companyId } : null
}

function parseImageUrls(raw: unknown, fallback: unknown): string[] {
  let urls: string[] = []
  let value = raw
  if (typeof value === "string" && value.trim()) {
    try {
      value = JSON.parse(value)
    } catch {
      value = null
    }
  }
  if (Array.isArray(value)) {
    urls = value.filter((u): u is string => typeof u === "string" && u.trim().length > 0)
  }
  if (urls.length === 0 && typeof fallback === "string" && fallback.trim()) urls = [fallback]
  return urls.slice(0, 4)
}

/** Fresh photos/video for one product straight from the database (never from list state). */
export async function getStaffProductMedia(productId: number) {
  try {
    const scope = await resolveMediaScope()
    if (!scope) return { success: false as const, message: "Unauthorized" }
    if (!productId || typeof productId !== "number") return { success: false as const, message: "Invalid product ID" }

    const rows = await sql`
      SELECT p.id, p.image_url, p.image_urls, p.video_url
      FROM products p
      WHERE p.id = ${productId}
        AND (${scope.companyId}::int IS NULL OR p.created_by IN (SELECT d.id FROM devices d WHERE d.company_id = ${scope.companyId}))
    `
    if (rows.length === 0) return { success: false as const, message: "Product not found" }
    const r = rows[0]
    return {
      success: true as const,
      media: {
        image_urls: parseImageUrls(r.image_urls, r.image_url),
        video_url: typeof r.video_url === "string" && r.video_url.trim() ? r.video_url.trim() : null,
      },
    }
  } catch (error) {
    console.error("Get product media error:", error)
    return { success: false as const, message: "Failed to load product media" }
  }
}

export async function updateStaffProductMedia(
  productId: number,
  imageUrls: string[],
  videoUrl?: string | null
) {
  try {
    const scope = await resolveMediaScope()
    if (!scope) {
      return { success: false, message: "Unauthorized or device not assigned" }
    }

    if (!productId || typeof productId !== "number") {
      return { success: false, message: "Invalid product ID" }
    }

    const cleanImageUrls = Array.isArray(imageUrls)
      ? imageUrls.filter((url) => typeof url === "string" && url.trim().length > 0).slice(0, 4)
      : []

    const cleanVideoUrl = typeof videoUrl === "string" && videoUrl.trim().length > 0 ? videoUrl.trim() : null
    const primaryImageUrl = cleanImageUrls[0] || null

    // Only the media columns change, and only for a product of the caller's own company
    const result = await sql`
      UPDATE products
      SET
        image_url = ${primaryImageUrl},
        image_urls = ${JSON.stringify(cleanImageUrls)}::text::jsonb,
        video_url = ${cleanVideoUrl},
        updated_at = NOW()
      WHERE id = ${productId}
        AND (${scope.companyId}::int IS NULL OR created_by IN (SELECT d.id FROM devices d WHERE d.company_id = ${scope.companyId}))
      RETURNING id, image_url, image_urls, video_url
    `

    if (result.length === 0) {
      return { success: false, message: "Product not found or update failed" }
    }

    revalidatePath("/dashboard")
    revalidatePath("/staff/dashboard")

    return {
      success: true,
      message: "Product media updated successfully",
      // Same shape callers already merge into their product state; image_urls is always a real array here
      product: {
        id: result[0].id,
        image_url: result[0].image_url,
        image_urls: parseImageUrls(result[0].image_urls, result[0].image_url),
        video_url: result[0].video_url,
      },
    }
  } catch (error) {
    console.error("Update staff product media error:", error)
    return { success: false, message: "Failed to update product media" }
  }
}
