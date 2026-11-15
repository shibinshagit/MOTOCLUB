"use server"

import { headers } from "next/headers"
import { getConfiguredAppUrl } from "@/lib/app-url"
import { sql } from "@/lib/db"
import {
  buildShareUrl,
  DEFAULT_SHARE_LINK_DAYS,
  generateShareToken,
} from "@/lib/product-share"
import { fetchSharedProductByToken, getShareExpiryDate, verifyProductShareAccess } from "@/lib/product-share-data"
import { getServerActor } from "@/lib/device-access"
import { getStaffSession } from "@/lib/staff-session"

async function getShareBaseUrl() {
  const configured = getConfiguredAppUrl()
  if (configured) return configured

  const headerList = await headers()
  const host = headerList.get("x-forwarded-host") || headerList.get("host")
  if (!host) return "http://localhost:3000"

  const protocol = headerList.get("x-forwarded-proto") || "http"
  return `${protocol}://${host}`
}

export async function createProductShareLink(
  productId: number,
  deviceId?: number,
  options?: { expiresInDays?: number; reuseExisting?: boolean },
) {
  if (!productId) {
    return { success: false as const, message: "Product is required" }
  }

  try {
    let resolvedDeviceId = deviceId ? Number(deviceId) : 0

    // Attempt to resolve deviceId from server-side authenticated session
    if (!resolvedDeviceId) {
      try {
        const actor = await getServerActor()
        if (actor && "deviceId" in actor && actor.deviceId) {
          resolvedDeviceId = Number(actor.deviceId)
        }
      } catch (e) {
        // Fall back to product creator
      }
    }

    // If still not resolved, query the product's created_by device
    if (!resolvedDeviceId) {
      const prodRows = await sql`SELECT created_by FROM products WHERE id = ${productId} LIMIT 1`
      if (prodRows.length > 0 && prodRows[0].created_by) {
        resolvedDeviceId = Number(prodRows[0].created_by)
      } else {
        const firstDev = await sql`SELECT id FROM devices ORDER BY id ASC LIMIT 1`
        if (firstDev.length > 0) {
          resolvedDeviceId = Number(firstDev[0].id)
        }
      }
    }

    if (!resolvedDeviceId) {
      resolvedDeviceId = 1
    }

    const hasAccess = await verifyProductShareAccess(productId, resolvedDeviceId)
    if (!hasAccess) {
      return { success: false as const, message: "Product not found" }
    }

    const expiresInDays = options?.expiresInDays ?? DEFAULT_SHARE_LINK_DAYS
    const expiresAt = getShareExpiryDate(expiresInDays)

    if (options?.reuseExisting !== false) {
      const existing = await sql`
        SELECT token, expires_at
        FROM product_share_links
        WHERE product_id = ${productId}
          AND device_id = ${resolvedDeviceId}
          AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY created_at DESC
        LIMIT 1
      `

      if (existing.length > 0) {
        const baseUrl = await getShareBaseUrl()
        return {
          success: true as const,
          url: buildShareUrl(String(existing[0].token), baseUrl),
          expiresAt: existing[0].expires_at ? String(existing[0].expires_at) : null,
          reused: true as const,
        }
      }
    }

    const token = generateShareToken()

    let staffId: number | null = null
    try {
      const staffSession = await getStaffSession()
      if (staffSession?.staffId) {
        staffId = Number(staffSession.staffId)
      }
    } catch {
      // ignore
    }

    const createdByValue = staffId || resolvedDeviceId

    await sql`
      INSERT INTO product_share_links (
        token,
        product_id,
        device_id,
        created_by,
        expires_at
      )
      VALUES (
        ${token},
        ${productId},
        ${resolvedDeviceId},
        ${createdByValue},
        ${expiresAt}
      )
    `

    const baseUrl = await getShareBaseUrl()

    return {
      success: true as const,
      url: buildShareUrl(token, baseUrl),
      expiresAt: expiresAt.toISOString(),
      reused: false as const,
    }
  } catch (error) {
    console.error("createProductShareLink error:", error)
    return { success: false as const, message: "Failed to create share link" }
  }
}

export async function revokeProductShareLinks(productId: number, deviceId: number) {
  if (!productId || !deviceId) {
    return { success: false as const, message: "Product and device are required" }
  }

  try {
    await sql`
      UPDATE product_share_links
      SET revoked_at = NOW()
      WHERE product_id = ${productId}
        AND device_id = ${deviceId}
        AND revoked_at IS NULL
    `

    return { success: true as const }
  } catch (error) {
    console.error("revokeProductShareLinks error:", error)
    return { success: false as const, message: "Failed to revoke share links" }
  }
}

export async function getSharedProductByToken(token: string) {
  return fetchSharedProductByToken(token)
}

export async function getProductAvailableStock(productId: number, deviceId?: number): Promise<{ success: boolean; stock: number }> {
  if (!productId) return { success: false, stock: 0 }

  try {
    let resolvedDeviceId = deviceId ? Number(deviceId) : 0
    if (!resolvedDeviceId) {
      try {
        const actor = await getServerActor()
        if (actor && "deviceId" in actor && actor.deviceId) {
          resolvedDeviceId = Number(actor.deviceId)
        }
      } catch {
        // ignore
      }
    }

    // 1. Device specific stock from batches
    if (resolvedDeviceId) {
      const batchRows = await sql`
        SELECT COALESCE(SUM(pbds.stock), 0)::int as total
        FROM product_batch_device_stock pbds
        JOIN product_batches pb ON pb.id = pbds.batch_id
        JOIN product_variants pv ON pv.id = pb.product_variant_id
        WHERE pv.product_id = ${productId} AND pbds.device_id = ${resolvedDeviceId}
      `
      if (batchRows.length > 0 && Number(batchRows[0].total) > 0) {
        return { success: true, stock: Number(batchRows[0].total) }
      }

      // Check legacy product_device_stock
      const pdsRows = await sql`
        SELECT COALESCE(stock, 0)::int as total
        FROM product_device_stock
        WHERE product_id = ${productId} AND device_id = ${resolvedDeviceId}
        LIMIT 1
      `
      if (pdsRows.length > 0 && Number(pdsRows[0].total) > 0) {
        return { success: true, stock: Number(pdsRows[0].total) }
      }
    }

    // 2. Global/Company total stock across all branches for this product
    const allBatches = await sql`
      SELECT COALESCE(SUM(pbds.stock), 0)::int as total
      FROM product_batch_device_stock pbds
      JOIN product_batches pb ON pb.id = pbds.batch_id
      JOIN product_variants pv ON pv.id = pb.product_variant_id
      WHERE pv.product_id = ${productId}
    `
    const totalBatchStock = Number(allBatches[0]?.total || 0)
    if (totalBatchStock > 0) {
      return { success: true, stock: totalBatchStock }
    }

    const allPds = await sql`
      SELECT COALESCE(SUM(stock), 0)::int as total
      FROM product_device_stock
      WHERE product_id = ${productId}
    `
    const totalPdsStock = Number(allPds[0]?.total || 0)
    return { success: true, stock: totalPdsStock }
  } catch (error) {
    console.error("getProductAvailableStock error:", error)
    return { success: false, stock: 0 }
  }
}
