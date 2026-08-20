"use server"

import { sql } from "@/lib/db"
import { revalidatePath, unstable_noStore as noStore } from "next/cache"
import { resolveStaffSessionContext } from "@/lib/staff-restrictions-server"
import { updateProductStock } from "@/app/actions/sale-actions"

/**
 * Restores stock for products in a Return Request when marked as completed.
 * Guarantees idempotency (restores stock only once).
 */
export async function restoreStockForReturnRequest(returnId: number, deviceId: number = 1) {
  try {
    const reqRows = await sql`
      SELECT id, ecommerce_return_request_id, stock_restored, items FROM return_requests WHERE id = ${returnId} LIMIT 1
    `
    if (reqRows.length === 0) return { success: false, message: "Return request not found" }

    const req = reqRows[0]
    if (req.stock_restored) {
      return { success: true, message: "Stock was already restored for this return request" }
    }

    // Fetch items from return_request_items
    const dbItems = await sql`
      SELECT product_id, product_variant_id, quantity FROM return_request_items WHERE return_request_id = ${returnId}
    `

    let itemsToRestore: Array<{ productId: number; variantId?: number | null; quantity: number }> = []

    if (dbItems.length > 0) {
      itemsToRestore = dbItems.map((i: any) => ({
        productId: Number(i.product_id),
        variantId: i.product_variant_id ? Number(i.product_variant_id) : null,
        quantity: Number(i.quantity || 1),
      }))
    } else if (req.items) {
      let raw = req.items
      if (typeof raw === "string") {
        try { raw = JSON.parse(raw) } catch { raw = [] }
      }
      if (Array.isArray(raw)) {
        itemsToRestore = raw.map((i: any) => ({
          productId: Number(i.productId || i.product_id),
          variantId: (i.variantId || i.product_variant_id) ? Number(i.variantId || i.product_variant_id) : null,
          quantity: Number(i.quantity || 1),
        })).filter(i => i.productId > 0)
      }
    }

    let restoredCount = 0
    for (const item of itemsToRestore) {
      if (item.productId && item.quantity > 0) {
        await updateProductStock(
          item.productId,
          item.variantId || null,
          null,
          item.quantity,
          "add",
          deviceId
        )
        restoredCount++
      }
    }

    await sql`
      UPDATE return_requests
      SET stock_restored = true,
          updated_at = NOW()
      WHERE id = ${returnId}
    `

    await syncSaleStatusForReturnRequest(returnId, deviceId)

    return {
      success: true,
      message: `Stock successfully restored for ${restoredCount} product(s).`,
    }
  } catch (err: any) {
    console.error("restoreStockForReturnRequest Error:", err)
    return { success: false, message: err.message || "Failed to restore stock" }
  }
}

export async function syncSaleStatusForReturnRequest(returnRequestId: number, deviceId: number = 1) {
  try {
    const reqRows = await sql`
      SELECT id, sale_id, order_number, status FROM return_requests WHERE id = ${returnRequestId} LIMIT 1
    `
    if (reqRows.length === 0) return

    const req = reqRows[0]
    const status = String(req.status || "").toLowerCase()

    if (["approved", "completed", "received", "returned"].includes(status)) {
      let saleId = req.sale_id
      if (!saleId && req.order_number) {
        const sRows = await sql`
          SELECT id FROM sales 
          WHERE external_order_id = ${req.order_number} 
             OR id::text = ${req.order_number} 
             OR tracking_id = ${req.order_number}
          LIMIT 1
        `
        if (sRows.length > 0) saleId = sRows[0].id
      }

      if (saleId) {
        await sql`
          UPDATE sales
          SET delivery_status = 'Returned',
              status = 'Cancelled',
              updated_at = NOW()
          WHERE id = ${saleId}
        `
      }
    }
  } catch (err) {
    console.error("syncSaleStatusForReturnRequest Error:", err)
  }
}

/**
 * Idempotently synchronize an Ecommerce Return Request into the Accounting ERP.
 */
export async function syncEcommerceReturnRequest(payload: {
  returnRequestId: string
  ecommerceOrderId: string
  orderNumber?: string
  customerName?: string
  customerEmail?: string
  customerPhone?: string
  reason?: string
  notes?: string
  images?: string[]
  items?: Array<{
    productId?: number
    variantId?: number
    saleItemId?: number
    quantity: number
    reason?: string
    notes?: string
  }>
  requestedAt?: string
}) {
  try {
    const extReturnId = payload.returnRequestId
    const extOrderId = payload.orderNumber || payload.ecommerceOrderId

    // 1. Check if linked to an existing Accounting Sale
    let saleId: number | null = null
    let customerId: number | null = null
    let customerName: string | null = payload.customerName || null
    let customerEmail: string | null = payload.customerEmail || null
    let customerPhone: string | null = payload.customerPhone || null

    const saleCheck = await sql`
      SELECT id, customer_id FROM sales 
      WHERE external_order_id = ${extOrderId} OR tracking_token = ${extOrderId}
      LIMIT 1
    `
    if (saleCheck.length > 0) {
      saleId = saleCheck[0].id
      customerId = saleCheck[0].customer_id
    }

    if (customerId) {
      const custRows = await sql`SELECT name, email, phone FROM customers WHERE id = ${customerId} LIMIT 1`
      if (custRows.length > 0) {
        if (!customerName) customerName = custRows[0].name
        if (!customerEmail) customerEmail = custRows[0].email
        if (!customerPhone) customerPhone = custRows[0].phone
      }
    }

    const imagesJson = JSON.stringify(payload.images || [])
    const itemsJson = JSON.stringify(payload.items || [])
    const reqTimestamp = payload.requestedAt ? new Date(payload.requestedAt) : new Date()

    // 2. Idempotent check in return_requests table
    const existing = await sql`
      SELECT id, status FROM return_requests 
      WHERE ecommerce_return_request_id = ${extReturnId}
      LIMIT 1
    `

    let returnRequestId: number

    if (existing.length > 0) {
      returnRequestId = existing[0].id
      await sql`
        UPDATE return_requests
        SET order_number = ${extOrderId},
            sale_id = ${saleId},
            customer_id = ${customerId},
            customer_name = COALESCE(${customerName}, customer_name),
            customer_email = COALESCE(${customerEmail}, customer_email),
            customer_phone = COALESCE(${customerPhone}, customer_phone),
            reason = ${payload.reason || null},
            notes = ${payload.notes || null},
            images = ${imagesJson}::jsonb,
            items = ${itemsJson}::jsonb,
            requested_at = ${reqTimestamp},
            accounting_sync_status = 'synced',
            updated_at = NOW()
        WHERE id = ${returnRequestId}
      `
    } else {
      const newRows = await sql`
        INSERT INTO return_requests (
          ecommerce_return_request_id,
          order_number,
          sale_id,
          customer_id,
          customer_name,
          customer_email,
          customer_phone,
          status,
          reason,
          notes,
          images,
          items,
          accounting_sync_status,
          requested_at,
          created_at,
          updated_at
        ) VALUES (
          ${extReturnId},
          ${extOrderId},
          ${saleId},
          ${customerId},
          ${customerName},
          ${customerEmail},
          ${customerPhone},
          'pending',
          ${payload.reason || null},
          ${payload.notes || null},
          ${imagesJson}::jsonb,
          ${itemsJson}::jsonb,
          'synced',
          ${reqTimestamp},
          NOW(),
          NOW()
        )
        RETURNING id
      `
      returnRequestId = newRows[0].id
    }

    // 3. Upsert return line items into return_request_items table
    if (payload.items && payload.items.length > 0) {
      await sql`DELETE FROM return_request_items WHERE return_request_id = ${returnRequestId}`
      for (const item of payload.items) {
        let pName = item.notes || null
        if (item.productId) {
          const pRows = await sql`SELECT name FROM products WHERE id = ${item.productId} LIMIT 1`
          if (pRows.length > 0) pName = pRows[0].name
        }
        await sql`
          INSERT INTO return_request_items (
            return_request_id,
            product_id,
            product_variant_id,
            sale_item_id,
            product_name,
            quantity,
            reason,
            notes
          ) VALUES (
            ${returnRequestId},
            ${item.productId || null},
            ${item.variantId || null},
            ${item.saleItemId || null},
            ${pName},
            ${item.quantity || 1},
            ${item.reason || payload.reason || null},
            ${item.notes || payload.notes || null}
          )
        `
      }
    }

    try {
      revalidatePath("/admin/dashboard")
      revalidatePath("/staff/dashboard")
    } catch {}

    return {
      success: true,
      returnRequestId,
      ecommerceReturnRequestId: extReturnId,
      ecommerceOrderId: extOrderId,
      saleId,
      status: "pending",
      isDuplicate: existing.length > 0,
      message: `Return Request #${extReturnId} successfully synchronized to Accounting ERP.`,
    }
  } catch (error: any) {
    console.error("syncEcommerceReturnRequest Error:", error)
    return {
      success: false,
      message: error.message || "Failed to synchronize return request",
    }
  }
}

/**
 * Retrieves Return Requests with search, status filtering, date filtering, and counters.
 */
export async function getEcommerceReturnRequests(params?: {
  status?: string
  search?: string
  dateFilter?: "all" | "today" | "week" | "month" | "custom"
  startDate?: string
  endDate?: string
}) {
  try { noStore() } catch {}
  try {
    const statusFilter = params?.status && params.status !== "all" ? params.status.toLowerCase() : null
    const search = params?.search ? `%${params.search.trim().toLowerCase()}%` : null

    let rows: any[] = []
    if (statusFilter && search) {
      rows = await sql`
        SELECT 
          r.*,
          COALESCE(c.name, r.customer_name) AS customer_name,
          COALESCE(c.phone, r.customer_phone) AS customer_phone,
          COALESCE(c.email, r.customer_email) AS customer_email,
          st.name AS reviewer_name,
          COALESCE(
            (
              SELECT JSON_AGG(
                JSON_BUILD_OBJECT(
                  'id', ri.id,
                  'productId', ri.product_id,
                  'productName', COALESCE(p.name, ri.product_name),
                  'variantId', ri.product_variant_id,
                  'variantName', pv.name,
                  'quantity', ri.quantity,
                  'reason', ri.reason,
                  'price', ri.price
                )
              )
              FROM return_request_items ri
              LEFT JOIN products p ON p.id = ri.product_id
              LEFT JOIN product_variants pv ON pv.id = ri.product_variant_id
              WHERE ri.return_request_id = r.id
            ),
            '[]'::json
          ) AS db_items
        FROM return_requests r
        LEFT JOIN customers c ON c.id = r.customer_id
        LEFT JOIN staff st ON st.id = r.reviewed_by
        WHERE LOWER(r.status) = ${statusFilter}
          AND (
            LOWER(r.ecommerce_return_request_id) LIKE ${search} OR
            LOWER(COALESCE(r.order_number, '')) LIKE ${search} OR
            LOWER(COALESCE(c.name, r.customer_name, '')) LIKE ${search} OR
            LOWER(COALESCE(c.phone, r.customer_phone, '')) LIKE ${search} OR
            EXISTS (
              SELECT 1 FROM return_request_items ri2
              LEFT JOIN products p2 ON p2.id = ri2.product_id
              WHERE ri2.return_request_id = r.id AND (LOWER(COALESCE(p2.name, ri2.product_name, '')) LIKE ${search})
            )
          )
        ORDER BY r.created_at DESC
      `
    } else if (statusFilter) {
      rows = await sql`
        SELECT 
          r.*,
          COALESCE(c.name, r.customer_name) AS customer_name,
          COALESCE(c.phone, r.customer_phone) AS customer_phone,
          COALESCE(c.email, r.customer_email) AS customer_email,
          st.name AS reviewer_name,
          COALESCE(
            (
              SELECT JSON_AGG(
                JSON_BUILD_OBJECT(
                  'id', ri.id,
                  'productId', ri.product_id,
                  'productName', COALESCE(p.name, ri.product_name),
                  'variantId', ri.product_variant_id,
                  'variantName', pv.name,
                  'quantity', ri.quantity,
                  'reason', ri.reason,
                  'price', ri.price
                )
              )
              FROM return_request_items ri
              LEFT JOIN products p ON p.id = ri.product_id
              LEFT JOIN product_variants pv ON pv.id = ri.product_variant_id
              WHERE ri.return_request_id = r.id
            ),
            '[]'::json
          ) AS db_items
        FROM return_requests r
        LEFT JOIN customers c ON c.id = r.customer_id
        LEFT JOIN staff st ON st.id = r.reviewed_by
        WHERE LOWER(r.status) = ${statusFilter}
        ORDER BY r.created_at DESC
      `
    } else if (search) {
      rows = await sql`
        SELECT 
          r.*,
          COALESCE(c.name, r.customer_name) AS customer_name,
          COALESCE(c.phone, r.customer_phone) AS customer_phone,
          COALESCE(c.email, r.customer_email) AS customer_email,
          st.name AS reviewer_name,
          COALESCE(
            (
              SELECT JSON_AGG(
                JSON_BUILD_OBJECT(
                  'id', ri.id,
                  'productId', ri.product_id,
                  'productName', COALESCE(p.name, ri.product_name),
                  'variantId', ri.product_variant_id,
                  'variantName', pv.name,
                  'quantity', ri.quantity,
                  'reason', ri.reason,
                  'price', ri.price
                )
              )
              FROM return_request_items ri
              LEFT JOIN products p ON p.id = ri.product_id
              LEFT JOIN product_variants pv ON pv.id = ri.product_variant_id
              WHERE ri.return_request_id = r.id
            ),
            '[]'::json
          ) AS db_items
        FROM return_requests r
        LEFT JOIN customers c ON c.id = r.customer_id
        LEFT JOIN staff st ON st.id = r.reviewed_by
        WHERE LOWER(r.ecommerce_return_request_id) LIKE ${search} OR
              LOWER(COALESCE(r.order_number, '')) LIKE ${search} OR
              LOWER(COALESCE(c.name, r.customer_name, '')) LIKE ${search} OR
              LOWER(COALESCE(c.phone, r.customer_phone, '')) LIKE ${search} OR
              EXISTS (
                SELECT 1 FROM return_request_items ri2
                LEFT JOIN products p2 ON p2.id = ri2.product_id
                WHERE ri2.return_request_id = r.id AND (LOWER(COALESCE(p2.name, ri2.product_name, '')) LIKE ${search})
              )
        ORDER BY r.created_at DESC
      `
    } else {
      rows = await sql`
        SELECT 
          r.*,
          COALESCE(c.name, r.customer_name) AS customer_name,
          COALESCE(c.phone, r.customer_phone) AS customer_phone,
          COALESCE(c.email, r.customer_email) AS customer_email,
          st.name AS reviewer_name,
          COALESCE(
            (
              SELECT JSON_AGG(
                JSON_BUILD_OBJECT(
                  'id', ri.id,
                  'productId', ri.product_id,
                  'productName', COALESCE(p.name, ri.product_name),
                  'variantId', ri.product_variant_id,
                  'variantName', pv.name,
                  'quantity', ri.quantity,
                  'reason', ri.reason,
                  'price', ri.price
                )
              )
              FROM return_request_items ri
              LEFT JOIN products p ON p.id = ri.product_id
              LEFT JOIN product_variants pv ON pv.id = ri.product_variant_id
              WHERE ri.return_request_id = r.id
            ),
            '[]'::json
          ) AS db_items
        FROM return_requests r
        LEFT JOIN customers c ON c.id = r.customer_id
        LEFT JOIN staff st ON st.id = r.reviewed_by
        ORDER BY r.created_at DESC
      `
    }

    const statsRows = await sql`
      SELECT 
        COUNT(*) FILTER (WHERE LOWER(status) = 'pending')::int AS pending_count,
        COUNT(*) FILTER (WHERE LOWER(status) = 'approved')::int AS approved_count,
        COUNT(*) FILTER (WHERE LOWER(status) = 'rejected')::int AS rejected_count,
        COUNT(*) FILTER (WHERE LOWER(status) = 'received')::int AS received_count,
        COUNT(*) FILTER (WHERE LOWER(status) = 'completed')::int AS completed_count,
        COUNT(*)::int AS total_count
      FROM return_requests
    `

    const stats = statsRows[0] || {
      pending_count: 0,
      approved_count: 0,
      rejected_count: 0,
      received_count: 0,
      completed_count: 0,
      total_count: 0,
    }

    const mappedRows = rows.map((r: any) => {
      let finalItems = r.db_items
      if (!Array.isArray(finalItems) || finalItems.length === 0) {
        if (Array.isArray(r.items) && r.items.length > 0) {
          finalItems = r.items
        } else if (typeof r.items === "string") {
          try {
            const parsed = JSON.parse(r.items)
            if (Array.isArray(parsed)) finalItems = parsed
          } catch {}
        }
      }
      return {
        ...r,
        items: finalItems || [],
        ecommerce_order_id: r.order_number || (r.order_id ? `ORDER-${r.order_id}` : "N/A"),
      }
    })

    return {
      success: true,
      data: mappedRows,
      summary: {
        pending: stats.pending_count,
        approved: stats.approved_count,
        rejected: stats.rejected_count,
        received: stats.received_count,
        completed: stats.completed_count,
        total: stats.total_count,
      },
    }
  } catch (error: any) {
    console.error("getEcommerceReturnRequests Error:", error)
    return {
      success: false,
      message: error.message || "Failed to fetch return requests",
      data: [],
      summary: { pending: 0, approved: 0, rejected: 0, received: 0, completed: 0, total: 0 },
    }
  }
}

/**
 * Retrieves full details for a single return request.
 */
export async function getEcommerceReturnRequestById(id: number) {
  try { noStore() } catch {}
  try {
    const rows = await sql`
      SELECT 
        r.*,
        COALESCE(c.name, r.customer_name) AS customer_name,
        COALESCE(c.phone, r.customer_phone) AS customer_phone,
        COALESCE(c.email, r.customer_email) AS customer_email,
        c.address AS customer_address,
        s.created_at AS sale_date,
        s.total_amount AS sale_total,
        s.payment_status AS sale_payment_status,
        s.delivery_status AS sale_delivery_status,
        st.name AS reviewer_name
      FROM return_requests r
      LEFT JOIN customers c ON c.id = r.customer_id
      LEFT JOIN sales s ON s.id = r.sale_id
      LEFT JOIN staff st ON st.id = r.reviewed_by
      WHERE r.id = ${id}
      LIMIT 1
    `

    if (rows.length === 0) {
      return { success: false, message: "Return request not found." }
    }

    const returnReq = rows[0]

    // Fetch items from return_request_items
    const dbItems = await sql`
      SELECT 
        ri.*,
        COALESCE(p.name, ri.product_name) AS product_name,
        COALESCE(p.image_urls, CASE WHEN ri.product_image_url IS NOT NULL THEN JSONB_BUILD_ARRAY(ri.product_image_url) ELSE NULL END) AS product_images,
        COALESCE(pv.name, ri.variant_name) AS variant_name,
        COALESCE(ri.price, ri.unit_price, 0) AS original_unit_price,
        ri.quantity AS purchased_quantity
      FROM return_request_items ri
      LEFT JOIN products p ON p.id = ri.product_id
      LEFT JOIN product_variants pv ON pv.id = COALESCE(ri.product_variant_id, ri.variant_id)
      WHERE ri.return_request_id = ${id}
    `

    let parsedImages: string[] = []
    if (Array.isArray(returnReq.images)) {
      parsedImages = returnReq.images
    } else if (typeof returnReq.images === "string") {
      try {
        parsedImages = JSON.parse(returnReq.images)
      } catch {
        if (returnReq.images) parsedImages = [returnReq.images]
      }
    }

    let finalItems = dbItems
    if (!finalItems || finalItems.length === 0) {
      if (Array.isArray(returnReq.items) && returnReq.items.length > 0) {
        finalItems = returnReq.items
      } else if (typeof returnReq.items === "string") {
        try {
          const parsed = JSON.parse(returnReq.items)
          if (Array.isArray(parsed)) finalItems = parsed
        } catch {}
      }
    }

    return {
      success: true,
      data: {
        ...returnReq,
        ecommerce_order_id: returnReq.order_number || (returnReq.order_id ? `ORDER-${returnReq.order_id}` : "N/A"),
        images: parsedImages,
        items: finalItems || [],
      },
    }
  } catch (error: any) {
    console.error("getEcommerceReturnRequestById Error:", error)
    return { success: false, message: error.message || "Failed to fetch return request details" }
  }
}

/**
 * Approve a Return Request.
 */
export async function approveReturnRequest(id: number, deviceId: number = 1) {
  try { noStore() } catch {}
  try {
    const staffCtx = await resolveStaffSessionContext(deviceId)
    const staffId = staffCtx?.id || null

    const reqRows = await sql`
      SELECT id, ecommerce_return_request_id, order_number, status FROM return_requests WHERE id = ${id} LIMIT 1
    `
    if (reqRows.length === 0) {
      return { success: false, message: "Return request not found." }
    }

    const currentReq = reqRows[0]
    const currentStatus = (currentReq.status || "").toLowerCase()

    if (currentStatus === "approved") {
      return { success: false, message: "Return request is already approved." }
    }
    if (currentStatus === "rejected") {
      return { success: false, message: "Cannot approve a return request that has already been rejected." }
    }

    await sql`
      UPDATE return_requests
      SET status = 'approved',
          reviewed_by = ${staffId},
          reviewed_at = NOW(),
          accounting_sync_status = 'synced',
          updated_at = NOW()
      WHERE id = ${id}
    `

    notifyEcommerceStatus({
      returnRequestId: currentReq.ecommerce_return_request_id,
      orderNumber: currentReq.order_number || "",
      status: "approved",
      reviewedAt: new Date().toISOString(),
      reviewedBy: "Accounting Admin",
    })

    await syncSaleStatusForReturnRequest(id, deviceId)

    try {
      revalidatePath("/admin/dashboard")
      revalidatePath("/staff/dashboard")
    } catch {}

    return {
      success: true,
      message: `Return request #${currentReq.ecommerce_return_request_id} has been approved.`,
    }
  } catch (error: any) {
    console.error("approveReturnRequest Error:", error)
    return { success: false, message: error.message || "Failed to approve return request" }
  }
}

/**
 * Reject a Return Request. Requires mandatory rejection reason.
 */
export async function rejectReturnRequest(id: number, rejectionReason: string, deviceId: number = 1) {
  try { noStore() } catch {}
  try {
    if (!rejectionReason || !rejectionReason.trim()) {
      return { success: false, message: "Rejection reason is required." }
    }

    const staffCtx = await resolveStaffSessionContext(deviceId)
    const staffId = staffCtx?.id || null

    const reqRows = await sql`
      SELECT id, ecommerce_return_request_id, order_number, status FROM return_requests WHERE id = ${id} LIMIT 1
    `
    if (reqRows.length === 0) {
      return { success: false, message: "Return request not found." }
    }

    const currentReq = reqRows[0]
    const currentStatus = (currentReq.status || "").toLowerCase()

    if (currentStatus === "rejected") {
      return { success: false, message: "Return request is already rejected." }
    }
    if (currentStatus === "approved" || currentStatus === "completed" || currentStatus === "received") {
      return { success: false, message: `Cannot reject a return request that is already ${currentStatus}.` }
    }

    await sql`
      UPDATE return_requests
      SET status = 'rejected',
          rejection_reason = ${rejectionReason.trim()},
          reviewed_by = ${staffId},
          reviewed_at = NOW(),
          accounting_sync_status = 'synced',
          updated_at = NOW()
      WHERE id = ${id}
    `

    notifyEcommerceStatus({
      returnRequestId: currentReq.ecommerce_return_request_id,
      orderNumber: currentReq.order_number || "",
      status: "rejected",
      rejectionReason: rejectionReason.trim(),
      reviewedAt: new Date().toISOString(),
      reviewedBy: "Accounting Admin",
    })

    try {
      revalidatePath("/admin/dashboard")
      revalidatePath("/staff/dashboard")
    } catch {}

    return {
      success: true,
      message: `Return request #${currentReq.ecommerce_return_request_id} has been rejected.`,
    }
  } catch (error: any) {
    console.error("rejectReturnRequest Error:", error)
    return { success: false, message: error.message || "Failed to reject return request" }
  }
}

/**
 * Update Return Request Status (e.g. mark as received or completed).
 * Automatically restores stock when status is set to 'completed' or 'received'.
 */
export async function updateReturnRequestStatus(
  id: number,
  newStatus: "received" | "completed",
  notes?: string,
  deviceId: number = 1
) {
  try { noStore() } catch {}
  try {
    const staffCtx = await resolveStaffSessionContext(deviceId)
    const staffId = staffCtx?.id || null

    const reqRows = await sql`
      SELECT id, ecommerce_return_request_id, order_number, status FROM return_requests WHERE id = ${id} LIMIT 1
    `
    if (reqRows.length === 0) {
      return { success: false, message: "Return request not found." }
    }

    const currentReq = reqRows[0]

    await sql`
      UPDATE return_requests
      SET status = ${newStatus},
          reviewed_by = ${staffId},
          reviewed_at = NOW(),
          notes = COALESCE(${notes || null}, notes),
          accounting_sync_status = 'synced',
          updated_at = NOW()
      WHERE id = ${id}
    `

    let stockMsg = ""
    if (newStatus === "completed" || newStatus === "received") {
      const stockRes = await restoreStockForReturnRequest(id, deviceId)
      if (stockRes.success && stockRes.message) {
        stockMsg = ` (${stockRes.message})`
      }
    }

    notifyEcommerceStatus({
      returnRequestId: currentReq.ecommerce_return_request_id,
      orderNumber: currentReq.order_number || "",
      status: newStatus,
      reviewedAt: new Date().toISOString(),
      reviewedBy: "Accounting Admin",
    })

    await syncSaleStatusForReturnRequest(id, deviceId)

    try {
      revalidatePath("/admin/dashboard")
      revalidatePath("/staff/dashboard")
    } catch {}

    return {
      success: true,
      message: `Return request status updated to '${newStatus}'${stockMsg}.`,
    }
  } catch (error: any) {
    console.error("updateReturnRequestStatus Error:", error)
    return { success: false, message: error.message || "Failed to update return status" }
  }
}

/**
 * Permanently delete a Return Request.
 */
export async function deleteReturnRequest(id: number, deviceId?: number) {
  try { noStore() } catch {}
  try {
    const existing = await sql`
      SELECT id, ecommerce_return_request_id FROM return_requests WHERE id = ${id} LIMIT 1
    `
    if (existing.length === 0) {
      return { success: false, message: "Return request not found." }
    }

    const extId = existing[0].ecommerce_return_request_id

    await sql`DELETE FROM return_requests WHERE id = ${id}`

    try {
      revalidatePath("/admin/dashboard")
      revalidatePath("/staff/dashboard")
    } catch {}

    return {
      success: true,
      message: `Return request #${extId} permanently deleted.`,
    }
  } catch (error: any) {
    console.error("deleteReturnRequest Error:", error)
    return { success: false, message: error.message || "Failed to delete return request" }
  }
}

async function notifyEcommerceStatus(payload: {
  returnRequestId: string
  orderNumber: string
  status: string
  rejectionReason?: string
  reviewedAt: string
  reviewedBy: string
}) {
  const webhookUrl = process.env.ECOMMERCE_RETURN_CALLBACK_URL
  if (!webhookUrl) return

  try {
    const apiKey = process.env.ERP_API_KEY || "motoclub_erp_sec_key_2026"
    await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-erp-api-key": apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    console.error("Error sending status notification to Ecommerce:", err)
  }
}
