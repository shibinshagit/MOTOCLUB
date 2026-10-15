"use server"

import { sql } from "@/lib/db"
import { emitNotificationToDevice } from "@/lib/socket-server"

export interface NotificationItem {
  id: number
  device_id: number
  company_id: number | null
  type: "order" | "postponed" | "reject" | "bulk_order" | string
  title: string
  message: string | null
  internal_note: string | null
  data: any
  status: "unchecked" | "checked"
  created_at: string
  read_at: string | null
  created_by_staff_id: number | null
  created_by_staff_name: string | null
}

export type NotificationFilter = "all" | "checked" | "unchecked"

/**
 * Fetch notifications for a device with optional filter
 */
export async function getNotifications(
  deviceId: number,
  filter: NotificationFilter = "all",
  limit = 50,
): Promise<{ success: boolean; data: NotificationItem[]; unreadCount: number; message?: string }> {
  try {
    if (!deviceId || isNaN(deviceId)) {
      return { success: false, data: [], unreadCount: 0, message: "Invalid device ID" }
    }

    let rows: any[] = []
    if (filter === "unchecked") {
      rows = await sql`
        SELECT *
        FROM notifications
        WHERE device_id = ${deviceId} AND status = 'unchecked'
        ORDER BY created_at DESC
        LIMIT ${limit}
      `
    } else if (filter === "checked") {
      rows = await sql`
        SELECT *
        FROM notifications
        WHERE device_id = ${deviceId} AND status = 'checked'
        ORDER BY created_at DESC
        LIMIT ${limit}
      `
    } else {
      rows = await sql`
        SELECT *
        FROM notifications
        WHERE device_id = ${deviceId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `
    }

    const unreadCountResult = await sql`
      SELECT COUNT(*)::int as count
      FROM notifications
      WHERE device_id = ${deviceId} AND status = 'unchecked'
    `
    const unreadCount = Number(unreadCountResult[0]?.count || 0)

    const formattedData: NotificationItem[] = rows.map((r: any) => ({
      id: r.id,
      device_id: r.device_id,
      company_id: r.company_id,
      type: r.type,
      title: r.title,
      message: r.message,
      internal_note: r.internal_note,
      data: typeof r.data === "string" ? JSON.parse(r.data) : r.data,
      status: r.status,
      created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      read_at: r.read_at ? new Date(r.read_at).toISOString() : null,
      created_by_staff_id: r.created_by_staff_id,
      created_by_staff_name: r.created_by_staff_name,
    }))

    return {
      success: true,
      data: formattedData,
      unreadCount,
    }
  } catch (error: any) {
    console.error("Error fetching notifications:", error)
    return { success: false, data: [], unreadCount: 0, message: error?.message || "Failed to fetch notifications" }
  }
}

/**
 * Get count of unread (unchecked) notifications
 */
export async function getUnreadNotificationCount(deviceId: number): Promise<{ success: boolean; count: number }> {
  try {
    if (!deviceId || isNaN(deviceId)) {
      return { success: false, count: 0 }
    }

    const result = await sql`
      SELECT COUNT(*)::int as count
      FROM notifications
      WHERE device_id = ${deviceId} AND status = 'unchecked'
    `
    return { success: true, count: Number(result[0]?.count || 0) }
  } catch (error) {
    console.error("Error getting unread notification count:", error)
    return { success: false, count: 0 }
  }
}

/**
 * Mark a single notification as checked
 */
export async function markNotificationAsChecked(
  notificationId: number,
  deviceId: number,
): Promise<{ success: boolean; unreadCount: number }> {
  try {
    await sql`
      UPDATE notifications
      SET status = 'checked', read_at = NOW()
      WHERE id = ${notificationId} AND device_id = ${deviceId}
    `
    const countRes = await getUnreadNotificationCount(deviceId)
    return { success: true, unreadCount: countRes.count }
  } catch (error) {
    console.error("Error marking notification as checked:", error)
    return { success: false, unreadCount: 0 }
  }
}

/**
 * Mark a single notification as unchecked
 */
export async function markNotificationAsUnchecked(
  notificationId: number,
  deviceId: number,
): Promise<{ success: boolean; unreadCount: number }> {
  try {
    await sql`
      UPDATE notifications
      SET status = 'unchecked', read_at = NULL
      WHERE id = ${notificationId} AND device_id = ${deviceId}
    `
    const countRes = await getUnreadNotificationCount(deviceId)
    return { success: true, unreadCount: countRes.count }
  } catch (error) {
    console.error("Error marking notification as unchecked:", error)
    return { success: false, unreadCount: 0 }
  }
}

/**
 * Mark all notifications for a device as checked
 */
export async function markAllNotificationsAsChecked(
  deviceId: number,
): Promise<{ success: boolean; unreadCount: number }> {
  try {
    await sql`
      UPDATE notifications
      SET status = 'checked', read_at = NOW()
      WHERE device_id = ${deviceId} AND status = 'unchecked'
    `
    return { success: true, unreadCount: 0 }
  } catch (error) {
    console.error("Error marking all notifications as checked:", error)
    return { success: false, unreadCount: 0 }
  }
}

export interface ProductDetailItem {
  productId: number
  productName: string
  variantName?: string
  sku?: string
  requiredQty?: number
  currentStock?: number
  price?: number
}

export interface CreatePurchaseActionNotificationParams {
  deviceId: number
  companyId?: number
  actionType: "order" | "postponed" | "reject" | "bulk_order"
  products: ProductDetailItem[]
  internalNote?: string | null
  staffId?: number
  staffName?: string
}

/**
 * Create a new notification for purchase manager actions:
 * Order, Postpone, Reject, or Bulk Order Proceed.
 * Emits real-time notification over socket immediately.
 */
export async function createPurchaseActionNotification(
  params: CreatePurchaseActionNotificationParams,
): Promise<{ success: boolean; notification?: NotificationItem; message?: string }> {
  try {
    const { deviceId, companyId, actionType, products, internalNote, staffId, staffName } = params

    if (!deviceId || !actionType || !products || products.length === 0) {
      return { success: false, message: "Missing required notification fields" }
    }

    let title = ""
    let message = ""
    const cleanNote = internalNote?.trim() ? internalNote.trim() : null

    if (actionType === "bulk_order") {
      title = `Bulk Purchase Proceed: ${products.length} Products`
      message = `Purchase Manager proceeded with bulk purchase order for ${products.length} products.`
    } else {
      const primaryProduct = products[0]
      const prodName = primaryProduct.variantName
        ? `${primaryProduct.productName} (${primaryProduct.variantName})`
        : primaryProduct.productName

      if (actionType === "order") {
        title = `Purchase Order: ${prodName}`
        const qty = primaryProduct.requiredQty ? ` (Qty: ${primaryProduct.requiredQty})` : ""
        message = `Purchase Manager placed order for ${prodName}${qty}.`
      } else if (actionType === "postponed") {
        title = `Purchase Postponed: ${prodName}`
        message = `Purchase Manager postponed purchase for ${prodName}.`
      } else if (actionType === "reject") {
        title = `Purchase Rejected: ${prodName}`
        message = `Purchase Manager rejected purchase for ${prodName}.`
      }
    }

    const dataPayload = {
      actionType,
      productCount: products.length,
      products,
      staffId: staffId || null,
      staffName: staffName || null,
    }

    const inserted = await sql`
      INSERT INTO notifications (
        device_id,
        company_id,
        type,
        title,
        message,
        internal_note,
        data,
        status,
        created_at,
        created_by_staff_id,
        created_by_staff_name
      ) VALUES (
        ${deviceId},
        ${companyId || null},
        ${actionType},
        ${title},
        ${message},
        ${cleanNote},
        ${JSON.stringify(dataPayload)},
        'unchecked',
        NOW(),
        ${staffId || null},
        ${staffName || null}
      )
      RETURNING *
    `

    if (!inserted || inserted.length === 0) {
      return { success: false, message: "Failed to insert notification" }
    }

    const row = inserted[0]
    const notification: NotificationItem = {
      id: row.id,
      device_id: row.device_id,
      company_id: row.company_id,
      type: row.type,
      title: row.title,
      message: row.message,
      internal_note: row.internal_note,
      data: dataPayload,
      status: row.status,
      created_at: new Date(row.created_at).toISOString(),
      read_at: null,
      created_by_staff_id: row.created_by_staff_id,
      created_by_staff_name: row.created_by_staff_name,
    }

    // Emit live notification through Socket.io and SSE
    emitNotificationToDevice(deviceId, notification)

    return { success: true, notification }
  } catch (error: any) {
    console.error("Error creating purchase action notification:", error)
    return { success: false, message: error?.message || "Failed to create notification" }
  }
}
