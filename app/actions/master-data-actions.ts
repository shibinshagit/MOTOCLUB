"use server"

import { sql } from "@/lib/db"
import { revalidatePath, unstable_noStore as noStore } from "next/cache"
import type { MasterDataCategory, MasterDataInput, MasterDataItem } from "@/lib/master-data"
import { getPackagingDefaultCost } from "@/lib/master-data"
import {
  DEFAULT_MANUAL_ENTRY_CATEGORIES,
  MANUAL_ENTRY_MASTER_CATEGORY,
  normalizeManualEntryCategory,
} from "@/lib/manual-entry-categories"

function buildMetadata(input: MasterDataInput, existing?: Record<string, unknown> | null) {
  if (input.category === "packaging") {
    const defaultCost = getPackagingDefaultCost({ default_cost: input.defaultCost })
    if (defaultCost != null) {
      return { ...(existing || {}), default_cost: defaultCost }
    }
    if (existing?.default_cost != null) {
      const next = { ...existing }
      delete next.default_cost
      return Object.keys(next).length > 0 ? next : null
    }
    return existing || null
  }

  if (input.category === "ecommerce_banner") {
    const rawImages = input.images ?? (existing?.images as any[]) ?? []
    const images = rawImages
      .map((img: any) => {
        if (typeof img === "string") return { url: img }
        return {
          url: String(img?.url || ""),
          title: img?.title ? String(img.title) : undefined,
          subtitle: img?.subtitle ? String(img.subtitle) : undefined,
          productId: img?.productId ? Number(img.productId) : undefined,
        }
      })
      .filter((img: any) => Boolean(img.url))

    const primaryImageUrl = input.imageUrl || images[0]?.url || (existing?.imageUrl as string) || (existing?.image_url as string) || ""

    if (images.length === 0 && primaryImageUrl) {
      images.push({ url: primaryImageUrl })
    }

    return {
      ...(existing || {}),
      imageUrl: primaryImageUrl,
      images,
      selectedProductIds: input.selectedProductIds ?? (existing?.selectedProductIds as number[]) ?? [],
      bannerType: input.bannerType ?? (existing?.bannerType as string) ?? "custom",
      subtitle: input.subtitle ?? (existing?.subtitle as string) ?? "",
      ctaText: input.ctaText ?? (existing?.ctaText as string) ?? (existing?.cta_text as string) ?? "Shop Now",
      ctaUrl: input.ctaUrl ?? (existing?.ctaUrl as string) ?? (existing?.cta_url as string) ?? "",
      badgeText: input.badgeText ?? (existing?.badgeText as string) ?? (existing?.badge_text as string) ?? "",
      themeColor: input.themeColor ?? (existing?.themeColor as string) ?? (existing?.theme_color as string) ?? "violet",
    }
  }

  return existing || null
}


function parseMetadata(meta: unknown): Record<string, unknown> | null {
  if (!meta) return null
  if (typeof meta === "object") return meta as Record<string, unknown>
  if (typeof meta === "string") {
    try {
      return JSON.parse(meta)
    } catch {
      return null
    }
  }
  return null
}

function mapMasterDataRow(row: Record<string, unknown>): MasterDataItem {
  return {
    id: Number(row.id),
    device_id: Number(row.device_id),
    category: String(row.category),
    name: String(row.name),
    code: (row.code as string) || null,
    contact_phone: (row.contact_phone as string) || null,
    contact_email: (row.contact_email as string) || null,
    website: (row.website as string) || null,
    tracking_url_template: (row.tracking_url_template as string) || null,
    notes: (row.notes as string) || null,
    metadata: parseMetadata(row.metadata),
    is_active: row.is_active !== false,
    sort_order: Number(row.sort_order) || 0,
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  }
}

export async function getMasterDataItems(deviceId: number, category?: MasterDataCategory | string) {
  if (!deviceId) {
    return { success: false as const, message: "Device ID is required", data: [] as MasterDataItem[] }
  }

  try {
    const rows = category
      ? category === "ecommerce_banner"
        ? await sql`
            SELECT md.*,
                   COALESCE(
                     NULLIF(md.contact_phone, ''),
                     (SELECT phone FROM staff WHERE linked_partner_id = md.id AND phone IS NOT NULL AND phone != '' LIMIT 1),
                     (SELECT phone FROM staff WHERE role = 'partner' AND LOWER(name) = LOWER(md.name) AND phone IS NOT NULL AND phone != '' LIMIT 1)
                   ) as contact_phone
            FROM master_data md
            WHERE md.category = 'ecommerce_banner'
            ORDER BY md.sort_order ASC, md.name ASC
          `
        : await sql`
            SELECT md.*,
                   COALESCE(
                     NULLIF(md.contact_phone, ''),
                     (SELECT phone FROM staff WHERE linked_partner_id = md.id AND phone IS NOT NULL AND phone != '' LIMIT 1),
                     (SELECT phone FROM staff WHERE role = 'partner' AND LOWER(name) = LOWER(md.name) AND phone IS NOT NULL AND phone != '' LIMIT 1)
                   ) as contact_phone
            FROM master_data md
            WHERE md.device_id = ${deviceId}
              AND md.category = ${category}
            ORDER BY md.sort_order ASC, md.name ASC
          `
      : await sql`
          SELECT md.*,
                 COALESCE(
                   NULLIF(md.contact_phone, ''),
                   (SELECT phone FROM staff WHERE linked_partner_id = md.id AND phone IS NOT NULL AND phone != '' LIMIT 1),
                   (SELECT phone FROM staff WHERE role = 'partner' AND LOWER(name) = LOWER(md.name) AND phone IS NOT NULL AND phone != '' LIMIT 1)
                 ) as contact_phone
          FROM master_data md
          WHERE md.device_id = ${deviceId} OR md.category = 'ecommerce_banner'
          ORDER BY md.category ASC, md.sort_order ASC, md.name ASC
        `

    return {
      success: true as const,
      data: rows.map((row: Record<string, unknown>) => mapMasterDataRow(row)),
    }
  } catch (error) {
    console.error("getMasterDataItems error:", error)
    return { success: false as const, message: "Failed to load master data", data: [] as MasterDataItem[] }
  }
}

export async function getAllGlobalCouriers() {
  try {
    const rows = await sql`
      SELECT *
      FROM master_data
      WHERE category = 'courier' AND is_active = true
      ORDER BY sort_order ASC, name ASC
    `
    return {
      success: true as const,
      data: rows.map((row: Record<string, unknown>) => mapMasterDataRow(row)),
    }
  } catch (error) {
    console.error("getAllGlobalCouriers error:", error)
    return { success: false as const, message: "Failed to load global couriers", data: [] as MasterDataItem[] }
  }
}

export async function createMasterDataItem(deviceId: number, userId: number, input: MasterDataInput) {
  if (!deviceId || !userId) {
    return { success: false as const, message: "Device and user are required" }
  }
  if (!input.name?.trim()) {
    return { success: false as const, message: "Name is required" }
  }

  try {
    const metadata = buildMetadata(input)
    const rows = await sql`
      INSERT INTO master_data (
        device_id,
        category,
        name,
        code,
        contact_phone,
        contact_email,
        website,
        tracking_url_template,
        notes,
        metadata,
        is_active,
        sort_order,
        created_by
      )
      VALUES (
        ${deviceId},
        ${input.category},
        ${input.name.trim()},
        ${input.code?.trim() || null},
        ${input.contactPhone?.trim() || null},
        ${input.contactEmail?.trim() || null},
        ${input.website?.trim() || null},
        ${input.trackingUrlTemplate?.trim() || null},
        ${input.notes?.trim() || null},
        ${metadata ? JSON.stringify(metadata) : null}::jsonb,
        ${input.isActive !== false},
        ${input.sortOrder || 0},
        ${userId}
      )
      RETURNING *
    `

    revalidatePath("/dashboard")
    return { success: true as const, data: mapMasterDataRow(rows[0] as Record<string, unknown>) }
  } catch (error) {
    console.error("createMasterDataItem error:", error)
    return { success: false as const, message: "Failed to create master data item" }
  }
}

export async function updateMasterDataItem(
  id: number,
  deviceId: number,
  input: MasterDataInput,
) {
  if (!id || !deviceId) {
    return { success: false as const, message: "Invalid master data item" }
  }
  if (!input.name?.trim()) {
    return { success: false as const, message: "Name is required" }
  }

  try {
    const metadata = buildMetadata(input)

    const rows = await sql`
      UPDATE master_data
      SET
        category = ${input.category},
        name = ${input.name.trim()},
        code = ${input.code?.trim() || null},
        contact_phone = ${input.contactPhone?.trim() || null},
        contact_email = ${input.contactEmail?.trim() || null},
        website = ${input.website?.trim() || null},
        tracking_url_template = ${input.trackingUrlTemplate?.trim() || null},
        notes = ${input.notes?.trim() || null},
        metadata = ${metadata ? JSON.stringify(metadata) : null}::jsonb,
        is_active = ${input.isActive !== false},
        sort_order = ${input.sortOrder || 0},
        updated_at = NOW()
      WHERE id = ${id}
        AND (device_id = ${deviceId} OR category = 'ecommerce_banner')
      RETURNING *
    `

    if (rows.length === 0) {
      return { success: false as const, message: "Master data item not found" }
    }

    revalidatePath("/dashboard")
    return { success: true as const, data: mapMasterDataRow(rows[0] as Record<string, unknown>) }
  } catch (error) {
    console.error("updateMasterDataItem error:", error)
    return { success: false as const, message: "Failed to update master data item" }
  }
}

export async function deleteMasterDataItem(id: number, deviceId: number) {
  if (!id || !deviceId) {
    return { success: false as const, message: "Invalid master data item" }
  }

  try {
    const rows = await sql`
      DELETE FROM master_data
      WHERE id = ${id}
        AND (device_id = ${deviceId} OR category = 'ecommerce_banner')
      RETURNING id
    `

    if (rows.length === 0) {
      return { success: false as const, message: "Master data item not found" }
    }

    revalidatePath("/dashboard")
    return { success: true as const }
  } catch (error) {
    console.error("deleteMasterDataItem error:", error)
    return { success: false as const, message: "Failed to delete master data item" }
  }
}

export async function ensureManualEntryCategories(deviceId: number, userId: number) {
  if (!deviceId || !userId) {
    return { success: false as const, message: "Device and user are required", data: [] as MasterDataItem[] }
  }

  try {
    for (const category of DEFAULT_MANUAL_ENTRY_CATEGORIES) {
      const existing = await sql`
        SELECT id
        FROM master_data
        WHERE device_id = ${deviceId}
          AND category = ${MANUAL_ENTRY_MASTER_CATEGORY}
          AND LOWER(name) = LOWER(${category.name})
        LIMIT 1
      `

      if (existing.length === 0) {
        await sql`
          INSERT INTO master_data (
            device_id,
            category,
            name,
            code,
            is_active,
            sort_order,
            created_by
          )
          VALUES (
            ${deviceId},
            ${MANUAL_ENTRY_MASTER_CATEGORY},
            ${category.name},
            ${category.code},
            true,
            ${category.sortOrder},
            ${userId}
          )
        `
      }
    }

    const rows = await sql`
      SELECT *
      FROM master_data
      WHERE device_id = ${deviceId}
        AND category = ${MANUAL_ENTRY_MASTER_CATEGORY}
        AND is_active = true
      ORDER BY sort_order ASC, name ASC
    `

    return {
      success: true as const,
      data: rows.map((row: Record<string, unknown>) => mapMasterDataRow(row)),
    }
  } catch (error) {
    console.error("ensureManualEntryCategories error:", error)
    return { success: false as const, message: "Failed to load manual entry categories", data: [] as MasterDataItem[] }
  }
}

export async function getManualEntryCategoryByName(deviceId: number, categoryName: string) {
  const canonical = normalizeManualEntryCategory(categoryName)
  const rows = await sql`
    SELECT *
    FROM master_data
    WHERE device_id = ${deviceId}
      AND category = ${MANUAL_ENTRY_MASTER_CATEGORY}
      AND LOWER(name) = LOWER(${canonical})
    LIMIT 1
  `

  if (rows.length === 0) return null
  return mapMasterDataRow(rows[0] as Record<string, unknown>)
}

export async function getCourierProfileDetails(courierId: number) {
  noStore()
  try {
    const courierQuery = await sql`
      SELECT md.*,
             COALESCE(
               NULLIF(md.contact_phone, ''),
               (SELECT phone FROM staff WHERE linked_partner_id = md.id AND phone IS NOT NULL AND phone != '' LIMIT 1),
               (SELECT phone FROM staff WHERE role = 'partner' AND LOWER(name) = LOWER(md.name) AND phone IS NOT NULL AND phone != '' LIMIT 1)
             ) as contact_phone
      FROM master_data md
      WHERE md.id = ${courierId}
      LIMIT 1
    `
    if (courierQuery.length === 0) {
      return { success: false, message: "Courier partner not found" }
    }
    const courier = mapMasterDataRow(courierQuery[0] as Record<string, unknown>)

    const sales = await sql`
      SELECT s.id, s.tracking_id, s.total_amount, s.delivery_status, s.status, s.created_at, s.expense_courier, s.courier_paid_extra, COALESCE(c.name, s.customer_name_override) as customer_name, COALESCE(c.phone, s.customer_phone_override) as customer_phone
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.courier_partner_id = ${courierId}
         OR s.courier_service_id = ${courierId}
         OR LOWER(s.courier_service_name) = LOWER(${courier.name})
      ORDER BY s.created_at DESC
      LIMIT 100
    `

    const totalOrders = sales.length
    const totalEarnings = sales.reduce((sum: number, s: any) => sum + (Number(s.expense_courier || s.courier_paid_extra || s.total_amount || 0)), 0)
    const totalRevenue = sales.reduce((sum: number, s: any) => sum + Number(s.total_amount || 0), 0)

    return {
      success: true,
      data: {
        courier,
        totalOrders,
        totalEarnings,
        totalRevenue,
        recentOrders: sales
      }
    }
  } catch (error: any) {
    console.error("getCourierProfileDetails error:", error)
    return { success: false, message: error.message || "Failed to fetch courier details" }
  }
}

export async function getPublicEcommerceBanners(deviceId?: number) {
  noStore()
  try {
    const rows = deviceId
      ? await sql`
          SELECT *
          FROM master_data
          WHERE category = 'ecommerce_banner' AND is_active = true AND device_id = ${deviceId}
          ORDER BY sort_order ASC, id DESC
        `
      : await sql`
          SELECT *
          FROM master_data
          WHERE category = 'ecommerce_banner' AND is_active = true
          ORDER BY sort_order ASC, id DESC
        `
    return {
      success: true as const,
      data: rows.map((row: Record<string, unknown>) => mapMasterDataRow(row)),
    }
  } catch (error) {
    console.error("getPublicEcommerceBanners error:", error)
    return { success: false as const, message: "Failed to load public e-commerce banners", data: [] as MasterDataItem[] }
  }
}

