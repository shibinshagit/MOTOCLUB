"use server"

import { headers } from "next/headers"
import { sql } from "@/lib/db"
import {
  buildShareUrl,
  DEFAULT_SHARE_LINK_DAYS,
  generateShareToken,
} from "@/lib/product-share"
import { fetchSharedProductByToken, getShareExpiryDate, verifyProductShareAccess } from "@/lib/product-share-data"

async function getShareBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "")
  if (configured) return configured

  const headerList = await headers()
  const host = headerList.get("x-forwarded-host") || headerList.get("host")
  if (!host) return "http://localhost:3000"

  const protocol = headerList.get("x-forwarded-proto") || "http"
  return `${protocol}://${host}`
}

export async function createProductShareLink(
  productId: number,
  deviceId: number,
  options?: { expiresInDays?: number; reuseExisting?: boolean },
) {
  if (!productId || !deviceId) {
    return { success: false as const, message: "Product and device are required" }
  }

  try {
    const hasAccess = await verifyProductShareAccess(productId, deviceId)
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
          AND device_id = ${deviceId}
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
        ${deviceId},
        ${deviceId},
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
