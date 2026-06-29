"use server"

import { sql } from "@/lib/db"
import { revalidatePath } from "next/cache"
import type { MasterDataCategory, MasterDataInput, MasterDataItem } from "@/lib/master-data"
import { getPackagingDefaultCost } from "@/lib/master-data"

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

  return existing || null
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
    metadata: (row.metadata as Record<string, unknown>) || null,
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
      ? await sql`
          SELECT *
          FROM master_data
          WHERE device_id = ${deviceId}
            AND category = ${category}
          ORDER BY sort_order ASC, name ASC
        `
      : await sql`
          SELECT *
          FROM master_data
          WHERE device_id = ${deviceId}
          ORDER BY category ASC, sort_order ASC, name ASC
        `

    return {
      success: true as const,
      data: rows.map((row) => mapMasterDataRow(row as Record<string, unknown>)),
    }
  } catch (error) {
    console.error("getMasterDataItems error:", error)
    return { success: false as const, message: "Failed to load master data", data: [] as MasterDataItem[] }
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
        ${metadata ? sql.json(metadata) : null},
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
    const existingRows = await sql`
      SELECT metadata
      FROM master_data
      WHERE id = ${id}
        AND device_id = ${deviceId}
      LIMIT 1
    `

    if (existingRows.length === 0) {
      return { success: false as const, message: "Master data item not found" }
    }

    const metadata = buildMetadata(
      input,
      (existingRows[0].metadata as Record<string, unknown>) || null,
    )

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
        metadata = ${metadata ? sql.json(metadata) : null},
        is_active = ${input.isActive !== false},
        sort_order = ${input.sortOrder || 0},
        updated_at = NOW()
      WHERE id = ${id}
        AND device_id = ${deviceId}
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
        AND device_id = ${deviceId}
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
