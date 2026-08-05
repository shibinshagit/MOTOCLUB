"use server"

import { sql, getLastError, resetConnectionState } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { getDeviceProductStock, adjustDeviceProductStock } from "@/lib/inventory-service"

type TransferItemInput = {
  product_id: number
  product_variant_id: number | null
  batch_id: number | null
  quantity: number
  unit_cost: number
}

type StockMoveItemInput = {
  product_id: number
  product_variant_id: number | null
  batch_id: number | null
  quantity: number
}


async function resolveTransferAllocations(productId: number, variantId: number | null, batchId: number | null, deviceId: number, quantity: number) {
  let resolvedVariantId = variantId
  if (!resolvedVariantId) {
    const defaultVariant = await sql`SELECT id FROM product_variants WHERE product_id = ${productId} ORDER BY id ASC LIMIT 1`
    if (defaultVariant.length > 0) resolvedVariantId = defaultVariant[0].id
  }

  let allocations: {batchId: number | null, qty: number}[] = []
  
  if (batchId) {
    allocations.push({ batchId, qty: quantity })
  } else {
    // FIFO auto-allocate
    const availableBatches = await sql`
      SELECT pb.id, pbds.stock
      FROM product_batch_device_stock pbds
      JOIN product_batches pb ON pb.id = pbds.batch_id
      WHERE pb.product_variant_id = ${resolvedVariantId} 
        AND pbds.device_id = ${deviceId}
        AND pbds.stock > 0
      ORDER BY pb.manufacture_date ASC NULLS LAST, pb.created_at ASC
    `
    let remaining = quantity
    for (const batch of availableBatches) {
      if (remaining <= 0) break
      const available = Number(batch.stock)
      const take = Math.min(remaining, available)
      allocations.push({ batchId: batch.id, qty: take })
      remaining -= take
    }
    if (remaining > 0) {
      allocations.push({ batchId: null, qty: remaining })
    }
  }
  return { resolvedVariantId, allocations }
}

function normalizeTransferItems(items: any[]): TransferItemInput[] {
  const itemMap = new Map<string, { product_id: number; product_variant_id: number | null; batch_id: number | null; quantity: number; unit_cost: number }>()

  for (const item of items || []) {
    const productId = Number(item?.product_id)
    const variantId = Number(item?.product_variant_id || item?.variant_id || item?.variantId) || null
    const batchId = Number(item?.batch_id || item?.batchId) || null
    const quantity = Number(item?.quantity)
    const unitCost = Number(item?.unit_cost ?? 0)
    if (!Number.isFinite(productId) || productId <= 0) continue
    if (!Number.isFinite(quantity) || quantity <= 0) continue

    const nextQuantity = Math.floor(quantity)
    const safeUnitCost = Number.isFinite(unitCost) && unitCost >= 0 ? unitCost : 0
    const key = `${productId}_${variantId || ''}_${batchId || ''}`
    const existing = itemMap.get(key)
    if (!existing) {
      itemMap.set(key, { product_id: productId, product_variant_id: variantId, batch_id: batchId, quantity: nextQuantity, unit_cost: safeUnitCost })
    } else {
      const totalQty = existing.quantity + nextQuantity
      const weightedCost =
        totalQty > 0
          ? (existing.unit_cost * existing.quantity + safeUnitCost * nextQuantity) / totalQty
          : safeUnitCost
      itemMap.set(key, { product_id: productId, product_variant_id: variantId, batch_id: batchId, quantity: totalQty, unit_cost: weightedCost })
    }
  }

  return Array.from(itemMap.values()).map(value => ({
    product_id: value.product_id,
    product_variant_id: value.product_variant_id,
    batch_id: value.batch_id,
    quantity: value.quantity,
    unit_cost: Number(value.unit_cost.toFixed(2)),
  }))
}

function normalizeTransferDate(inputValue: unknown): string | null {
  const raw = String(inputValue || "").trim()
  if (!raw) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "__invalid__"
  return raw
}

async function getCompanyIdForDevice(deviceId: number): Promise<number | null> {
  const result = (await sql`
    SELECT company_id
    FROM devices
    WHERE id = ${deviceId}
    LIMIT 1
  `) as any[]
  return result.length > 0 ? Number(result[0].company_id) : null
}

async function getDeviceStockForUpdate(productId: number, variantId: number | null, deviceId: number): Promise<number> {
  return await getDeviceProductStock(productId, deviceId);
}

async function getDeviceBatchStockForUpdate(batchId: number, deviceId: number): Promise<number> {
  const rows = (await sql`
    SELECT stock
    FROM product_batch_device_stock
    WHERE batch_id = ${batchId} AND device_id = ${deviceId}
    FOR UPDATE
  `) as any[]
  return rows.length > 0 ? Number(rows[0].stock || 0) : 0
}



async function createTransferHistoryRows(
  transferId: number,
  productId: number,
  variantId: number | null,
  batchId: number | null,
  quantity: number,
  fromDeviceId: number,
  toDeviceId: number,
  actorDeviceId: number,
  notes?: string,
) {
  const noteText = notes || `Transfer #${transferId}`

  await sql`
    INSERT INTO product_stock_history (
      product_id, product_variant_id, batch_id, quantity, type, reference_id, reference_type, notes, created_by, device_id
    ) VALUES (
      ${productId}, ${variantId || null}, ${batchId || null}, ${-Math.abs(quantity)}, 'transfer_out', ${transferId}, 'transfer',
      ${noteText}, ${actorDeviceId}, ${fromDeviceId}
    )
  `

  await sql`
    INSERT INTO product_stock_history (
      product_id, product_variant_id, batch_id, quantity, type, reference_id, reference_type, notes, created_by, device_id
    ) VALUES (
      ${productId}, ${variantId || null}, ${batchId || null}, ${Math.abs(quantity)}, 'transfer_in', ${transferId}, 'transfer',
      ${noteText}, ${actorDeviceId}, ${toDeviceId}
    )
  `
}

async function moveStockBetweenDevices(
  productId: number,
  variantId: number | null,
  batchId: number | null,
  quantity: number,
  fromDeviceId: number,
  toDeviceId: number,
  transferId: number,
  actorDeviceId: number,
  historyNotes?: string,
) {
  const lockOrder = [fromDeviceId, toDeviceId].sort((a, b) => a - b)
  await getDeviceStockForUpdate(productId, variantId, lockOrder[0])
  if (lockOrder[1] !== lockOrder[0]) {
    await getDeviceStockForUpdate(productId, variantId, lockOrder[1])
  }

  let resolvedVariantId = variantId
  if (!resolvedVariantId) {
    const defaultVariant = await sql`
      SELECT id FROM product_variants WHERE product_id = ${productId} ORDER BY id ASC LIMIT 1
    `
    if (defaultVariant.length > 0) {
      resolvedVariantId = defaultVariant[0].id
    } else {
      throw new Error(`No product variant found for product ID ${productId}`)
    }
  }

  if (batchId) {
    const fromBatchStock = await getDeviceBatchStockForUpdate(batchId, fromDeviceId)
    if (fromBatchStock < quantity) {
      throw new Error(`Insufficient batch stock for product ID ${productId}. Available: ${fromBatchStock}, required: ${quantity}.`)
    }
  } else {
    const fromStock = await getDeviceStockForUpdate(productId, resolvedVariantId, fromDeviceId)
    if (fromStock < quantity) {
      throw new Error(`Insufficient stock for product ID ${productId}. Available: ${fromStock}, required: ${quantity}.`)
    }
  }

  await adjustDeviceProductStock(productId, resolvedVariantId, batchId, fromDeviceId, -quantity)
  await adjustDeviceProductStock(productId, resolvedVariantId, batchId, toDeviceId, quantity)

  await createTransferHistoryRows(transferId, productId, resolvedVariantId, batchId, quantity, fromDeviceId, toDeviceId, actorDeviceId, historyNotes)
}

async function getDeviceNames(fromDeviceId: number, toDeviceId: number): Promise<{ from: string; to: string }> {
  const rows = (await sql`
    SELECT id, name FROM devices WHERE id = ${fromDeviceId} OR id = ${toDeviceId}
  `) as any[]
  const map = new Map<number, string>()
  for (const row of rows) map.set(Number(row.id), row.name)
  return {
    from: map.get(fromDeviceId) || `Warehouse #${fromDeviceId}`,
    to: map.get(toDeviceId) || `Warehouse #${toDeviceId}`,
  }
}

// Remove any ledger rows previously recorded for this transfer (both sides).
async function deleteTransferLedger(transferId: number) {
  await sql`
    DELETE FROM financial_transactions
    WHERE reference_type = 'transfer' AND reference_id = ${transferId}
  `
}

// Record the transfer in the shared financial ledger as a two-sided entry:
//  - Sending warehouse: money IN (treated like a sale / receivable)
//  - Receiving warehouse: money OUT (treated like a purchase / payable)
async function recordTransferLedger(params: {
  transferId: number
  companyId: number
  fromDeviceId: number
  toDeviceId: number
  totalAmount: number
  paidAmount: number
  paymentStatus: string
  paymentMethod: string
  paymentNotes: string
  userId: number
  transferDate: string | null
}) {
  // Nothing meaningful to record for a zero-value, fully-unpaid transfer.
  if (Number(params.totalAmount) <= 0 && Number(params.paidAmount) <= 0) return

  const { from: fromName, to: toName } = await getDeviceNames(params.fromDeviceId, params.toDeviceId)
  const statusLabel = params.paymentStatus
    ? params.paymentStatus.charAt(0).toUpperCase() + params.paymentStatus.slice(1)
    : "Unpaid"
  const txDate = params.transferDate ? `${params.transferDate} 00:00:00` : new Date().toISOString()
  const method = params.paymentMethod || null
  const notes = params.paymentNotes || null

  // Sending warehouse — money in
  await sql`
    INSERT INTO financial_transactions (
      transaction_type, reference_type, reference_id,
      amount, received_amount, cost_amount, debit_amount, credit_amount,
      status, payment_method, description, notes, device_id, company_id, created_by, transaction_date
    ) VALUES (
      'transfer', 'transfer', ${params.transferId},
      ${params.totalAmount}, ${params.paidAmount}, 0, 0, ${params.paidAmount},
      ${statusLabel}, ${method}, ${`Transfer #${params.transferId} - Sent to ${toName}`}, ${notes},
      ${params.fromDeviceId}, ${params.companyId}, ${params.userId}, ${txDate}
    )
  `

  // Receiving warehouse — money out
  await sql`
    INSERT INTO financial_transactions (
      transaction_type, reference_type, reference_id,
      amount, received_amount, cost_amount, debit_amount, credit_amount,
      status, payment_method, description, notes, device_id, company_id, created_by, transaction_date
    ) VALUES (
      'transfer', 'transfer', ${params.transferId},
      ${params.totalAmount}, ${params.paidAmount}, 0, ${params.paidAmount}, 0,
      ${statusLabel}, ${method}, ${`Transfer #${params.transferId} - Received from ${fromName}`}, ${notes},
      ${params.toDeviceId}, ${params.companyId}, ${params.userId}, ${txDate}
    )
  `
}

async function reverseTransferItems(
  transferId: number,
  items: StockMoveItemInput[],
  originalFromDeviceId: number,
  originalToDeviceId: number,
  actorDeviceId: number,
  notePrefix: string,
) {
  for (const item of items) {
    await moveStockBetweenDevices(
      item.product_id,
      item.product_variant_id,
      item.batch_id,
      item.quantity,
      originalToDeviceId,
      originalFromDeviceId,
      transferId,
      actorDeviceId,
      `${notePrefix} #${transferId}`,
    )
  }
}

export async function getTransferFormData(userId: number, fromDeviceId?: number) {
  if (!userId) {
    return { success: false, message: "User ID is required", data: { devices: [], products: [], categories: [] } }
  }

  resetConnectionState()
  try {
    const companyId = await getCompanyIdForDevice(userId)
    if (!companyId) {
      return { success: false, message: "Device/company not found", data: { devices: [], products: [], categories: [] } }
    }

    const sourceDeviceId = Number(fromDeviceId || userId)

    const devices = (await sql`
      SELECT id, name
      FROM devices
      WHERE company_id = ${companyId}
      ORDER BY name ASC
    `) as any[]

    const products = (await sql`
      SELECT DISTINCT
        p.id,
        p.name,
        p.barcode,
        p.has_variants,
        p.is_batch_managed,
        p.category_id,
        COALESCE(pc.name, 'Uncategorized') AS category_name,
        COALESCE(p.wholesale_price, 0) AS default_unit_cost,
        COALESCE(pds.stock, 0) AS source_stock
      FROM products p
      JOIN devices d ON d.id = p.created_by
      LEFT JOIN product_categories pc ON pc.id = p.category_id
      LEFT JOIN (
        SELECT product_id, device_id, SUM(stock) as stock
        FROM (
          SELECT pv.product_id, pbds.device_id, SUM(pbds.stock) as stock
          FROM product_batch_device_stock pbds
          JOIN product_batches pb ON pb.id = pbds.batch_id
          JOIN product_variants pv ON pv.id = pb.product_variant_id
          GROUP BY pv.product_id, pbds.device_id
          UNION ALL
          SELECT pds.product_id, pds.device_id, SUM(pds.stock) as stock
          FROM product_device_stock pds
          GROUP BY pds.product_id, pds.device_id
        ) combined
        GROUP BY product_id, device_id
      ) pds ON pds.product_id = p.id AND pds.device_id = ${sourceDeviceId}
      WHERE d.company_id = ${companyId}
      ORDER BY p.name ASC
    `) as any[]

    if (products.length > 0) {
      const productIds = products.map((p) => p.id)
      
      const variants = await sql`
        SELECT pv.*, COALESCE(pbds_agg.stock, 0) as stock
        FROM product_variants pv
        LEFT JOIN (
          SELECT pb.product_variant_id, SUM(pbds.stock) as stock
          FROM product_batch_device_stock pbds
          JOIN product_batches pb ON pb.id = pbds.batch_id
          WHERE pbds.device_id = ${sourceDeviceId}
          GROUP BY pb.product_variant_id
        ) pbds_agg ON pv.id = pbds_agg.product_variant_id
        WHERE pv.product_id = ANY(${productIds})
        ORDER BY pv.id ASC
      `
      
      const variantsByProductId = new Map<number, any[]>()
      for (const variant of variants) {
        const pid = Number(variant.product_id)
        if (!variantsByProductId.has(pid)) {
          variantsByProductId.set(pid, [])
        }
        variantsByProductId.get(pid)!.push({
          id: Number(variant.id),
          variant_name: variant.variant_name,
          sku: variant.sku,
          barcode: variant.barcode,
          price: variant.price !== null ? Number(variant.price) : null,
          wholesale_price: variant.wholesale_price !== null ? Number(variant.wholesale_price) : null,
          stock: Number(variant.stock || 0),
        })
      }

      const batches = await sql`
        SELECT pb.*, pv.product_id as product_id, pv.name as variant_name, COALESCE(pbds.stock, 0) as stock
        FROM product_batches pb
        JOIN product_variants pv ON pb.product_variant_id = pv.id
        LEFT JOIN product_batch_device_stock pbds ON pb.id = pbds.batch_id AND pbds.device_id = ${sourceDeviceId}
        WHERE pv.product_id = ANY(${productIds})
        ORDER BY pb.id ASC
      `

      const legacyStocks = await sql`
        SELECT pds.product_id, pds.stock
        FROM product_device_stock pds
        JOIN products p ON p.id = pds.product_id
        WHERE pds.device_id = ${sourceDeviceId} AND p.has_variants = false AND p.id = ANY(${productIds})
      `

      const batchesByProductId = new Map<number, any[]>()
      for (const batch of batches) {
        const pid = Number(batch.product_id)
        if (!batchesByProductId.has(pid)) {
          batchesByProductId.set(pid, [])
        }
        batchesByProductId.get(pid)!.push({
          id: Number(batch.id),
          batch_number: batch.batch_number,
          product_variant_id: batch.product_variant_id ? Number(batch.product_variant_id) : null,
          variant_name: batch.variant_name || null,
          mfg_date: batch.mfg_date,
          expiry_date: batch.expiry_date,
          purchase_price: batch.purchase_price !== null ? Number(batch.purchase_price) : 0,
          selling_price: batch.selling_price !== null ? Number(batch.selling_price) : 0,
          stock: Number(batch.stock || 0),
        })
      }

      for (const p of products) {
        p.variants = variantsByProductId.get(p.id) || []
        p.batches = batchesByProductId.get(p.id) || []
      }
    }

    // Build unique category list from the products
    const categoryMap = new Map<number | null, string>()
    for (const p of products) {
      const catId = p.category_id ? Number(p.category_id) : null
      if (!categoryMap.has(catId)) {
        categoryMap.set(catId, p.category_name || "Uncategorized")
      }
    }
    const categories = Array.from(categoryMap.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => {
        if (a.id === null) return 1
        if (b.id === null) return -1
        return a.name.localeCompare(b.name)
      })

    return {
      success: true,
      data: {
        devices: devices.map((d) => ({ id: Number(d.id), name: d.name })),
        categories,
        products: products.map((p) => ({
          id: Number(p.id),
          name: p.name,
          barcode: p.barcode || "",
          category_id: p.category_id ? Number(p.category_id) : null,
          category_name: p.category_name || "Uncategorized",
          default_unit_cost: Number(p.default_unit_cost || 0),
          source_stock: Number(p.source_stock || 0),
          has_variants: Boolean(p.has_variants),
          is_batch_managed: Boolean(p.is_batch_managed),
          variants: p.variants || [],
          batches: p.batches || [],
        })),
      },
    }
  } catch (error) {
    console.error("Get transfer form data error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}.`,
      data: { devices: [], products: [], categories: [] },
    }
  }
}

function getDateBounds(preset?: string, customStart?: string, customEnd?: string): { startDate: string | null; endDate: string | null } {
  if (!preset || preset === "all") {
    return { startDate: null, endDate: null }
  }

  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)

  if (preset === "today") {
    return { startDate: `${todayStr} 00:00:00`, endDate: `${todayStr} 23:59:59` }
  }

  if (preset === "yesterday") {
    const yest = new Date(now)
    yest.setDate(yest.getDate() - 1)
    const yestStr = yest.toISOString().slice(0, 10)
    return { startDate: `${yestStr} 00:00:00`, endDate: `${yestStr} 23:59:59` }
  }

  if (preset === "this_week") {
    const dayOfWeek = now.getDay()
    const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek
    const monday = new Date(now)
    monday.setDate(now.getDate() + diffToMonday)
    const mondayStr = monday.toISOString().slice(0, 10)
    return { startDate: `${mondayStr} 00:00:00`, endDate: `${todayStr} 23:59:59` }
  }

  if (preset === "this_month") {
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const startStr = `${year}-${month}-01`
    return { startDate: `${startStr} 00:00:00`, endDate: `${todayStr} 23:59:59` }
  }

  if (preset === "custom") {
    const start = customStart && /^\d{4}-\d{2}-\d{2}$/.test(customStart) ? `${customStart} 00:00:00` : null
    const end = customEnd && /^\d{4}-\d{2}-\d{2}$/.test(customEnd) ? `${customEnd} 23:59:59` : null
    return { startDate: start, endDate: end }
  }

  return { startDate: null, endDate: null }
}

export async function getWarehouseTransfers(
  userId: number,
  searchTerm?: string,
  statusFilter?: string,
  datePreset?: string,
  customStart?: string,
  customEnd?: string,
  fromDeviceIdFilter?: number,
  toDeviceIdFilter?: number,
) {
  if (!userId) {
    return { success: false, message: "User ID is required", data: [] }
  }

  resetConnectionState()
  try {
    const companyId = await getCompanyIdForDevice(userId)
    if (!companyId) return { success: false, message: "Device/company not found", data: [] }

    const search = (searchTerm || "").trim().toLowerCase()
    const status = (statusFilter || "all").trim().toLowerCase()
    const searchPattern = `%${search}%`
    const { startDate, endDate } = getDateBounds(datePreset, customStart, customEnd)

    const fromId = Number(fromDeviceIdFilter || 0)
    const toId = Number(toDeviceIdFilter || 0)

    const transfers = (await sql`
      SELECT
        t.id,
        t.from_device_id,
        t.to_device_id,
        COALESCE(t.approval_status, t.status) AS status,
        COALESCE(t.approval_status, t.status) AS approval_status,
        COALESCE(t.total_amount, 0)::numeric AS total_amount,
        COALESCE(t.payment_status, 'unpaid') AS payment_status,
        COALESCE(t.payment_method, '') AS payment_method,
        COALESCE(t.paid_amount, 0)::numeric AS paid_amount,
        COALESCE(t.transfer_date, t.created_at) AS transfer_date,
        t.notes,
        t.rejection_reason,
        t.created_by,
        t.approved_by,
        t.approved_at,
        t.rejected_by,
        t.rejected_at,
        t.created_at,
        t.updated_at,
        df.name AS from_device_name,
        dt.name AS to_device_name,
        u_create.name AS created_by_name,
        u_approve.name AS approved_by_name,
        u_reject.name AS rejected_by_name,
        COUNT(ti.id)::int AS item_count,
        COALESCE(SUM(ti.quantity), 0)::int AS total_quantity
      FROM stock_transfers t
      JOIN devices df ON df.id = t.from_device_id
      JOIN devices dt ON dt.id = t.to_device_id
      LEFT JOIN devices u_create ON u_create.id = t.created_by
      LEFT JOIN devices u_approve ON u_approve.id = t.approved_by
      LEFT JOIN devices u_reject ON u_reject.id = t.rejected_by
      LEFT JOIN stock_transfer_items ti ON ti.transfer_id = t.id
      WHERE t.company_id = ${companyId}
        AND (t.from_device_id = ${userId} OR t.to_device_id = ${userId})
        AND (${fromId} = 0 OR t.from_device_id = ${fromId})
        AND (${toId} = 0 OR t.to_device_id = ${toId})
        AND (
          ${status} = 'all'
          OR LOWER(COALESCE(t.approval_status, t.status)) = ${status}
          OR (${status} = 'pending' AND LOWER(COALESCE(t.approval_status, t.status)) IN ('pending', 'pending_approval'))
        )
        AND (${startDate}::timestamp IS NULL OR COALESCE(t.transfer_date, t.created_at) >= ${startDate}::timestamp)
        AND (${endDate}::timestamp IS NULL OR COALESCE(t.transfer_date, t.created_at) <= ${endDate}::timestamp)
        AND (
          ${search} = ''
          OR CAST(t.id AS TEXT) LIKE ${searchPattern}
          OR LOWER(COALESCE(df.name, '')) LIKE ${searchPattern}
          OR LOWER(COALESCE(dt.name, '')) LIKE ${searchPattern}
          OR LOWER(COALESCE(t.notes, '')) LIKE ${searchPattern}
        )
      GROUP BY t.id, df.name, dt.name, u_create.name, u_approve.name, u_reject.name
      ORDER BY COALESCE(t.transfer_date, t.created_at) DESC, t.id DESC
      LIMIT 300
    `) as any[]

    const transferIds = transfers.map((t: any) => Number(t.id))
    let transferItems: any[] = []
    if (transferIds.length > 0) {
      transferItems = (await sql`
        SELECT
          ti.id,
          ti.transfer_id,
          ti.product_id,
          ti.product_variant_id,
          ti.batch_id,
          ti.quantity,
          COALESCE(ti.unit_cost, 0)::numeric AS unit_cost,
          COALESCE(ti.total_cost, 0)::numeric AS total_cost,
          p.name AS product_name,
          p.barcode,
          pv.name AS variant_name,
          pb.batch_no AS batch_number
        FROM stock_transfer_items ti
        LEFT JOIN products p ON p.id = ti.product_id
        LEFT JOIN product_variants pv ON pv.id = ti.product_variant_id
        LEFT JOIN product_batches pb ON pb.id = ti.batch_id
        WHERE ti.transfer_id = ANY(${transferIds})
        ORDER BY ti.id ASC
      `) as any[]
    }

    const transfersWithItems = transfers.map((t: any) => {
      const tId = Number(t.id)
      const items = transferItems
        .filter((item: any) => Number(item.transfer_id) === tId)
        .map((row: any) => ({
          id: Number(row.id),
          product_id: Number(row.product_id),
          product_variant_id: row.product_variant_id ? Number(row.product_variant_id) : null,
          batch_id: row.batch_id ? Number(row.batch_id) : null,
          quantity: Number(row.quantity),
          unit_cost: Number(row.unit_cost || 0),
          total_cost: Number(row.total_cost || 0),
          product_name: row.product_name || `Product #${row.product_id}`,
          barcode: row.barcode || "",
          variant_name: row.variant_name || null,
          batch_number: row.batch_number || null,
        }))
      return {
        ...t,
        items,
      }
    })

    return { success: true, data: transfersWithItems }
  } catch (error) {
    console.error("Get warehouse transfers error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}.`,
      data: [],
    }
  }
}

export async function getWarehouseTransferById(transferId: number, userId: number) {
  if (!transferId || !userId) {
    return { success: false, message: "Transfer ID and User ID are required", data: null }
  }

  resetConnectionState()
  try {
    const companyId = await getCompanyIdForDevice(userId)
    if (!companyId) return { success: false, message: "Device/company not found", data: null }

    const transferRows = (await sql`
      SELECT
        t.*,
        df.name AS from_device_name,
        dt.name AS to_device_name
      FROM stock_transfers t
      JOIN devices df ON df.id = t.from_device_id
      JOIN devices dt ON dt.id = t.to_device_id
      WHERE t.id = ${transferId} AND t.company_id = ${companyId}
      LIMIT 1
    `) as any[]

    if (transferRows.length === 0) {
      return { success: false, message: "Transfer not found", data: null }
    }

    const items = (await sql`
      SELECT
        ti.id,
        ti.product_id,
        ti.product_variant_id,
        ti.batch_id,
        ti.quantity,
        COALESCE(ti.unit_cost, 0)::numeric AS unit_cost,
        COALESCE(ti.total_cost, 0)::numeric AS total_cost,
        p.name AS product_name,
        p.barcode,
        pv.name AS variant_name,
        pb.batch_no AS batch_number
      FROM stock_transfer_items ti
      LEFT JOIN products p ON p.id = ti.product_id
      LEFT JOIN product_variants pv ON pv.id = ti.product_variant_id
      LEFT JOIN product_batches pb ON pb.id = ti.batch_id
      WHERE ti.transfer_id = ${transferId}
      ORDER BY ti.id ASC
    `) as any[]

    return {
      success: true,
      data: {
        transfer: transferRows[0],
        items: items.map((row) => ({
          id: Number(row.id),
          product_id: Number(row.product_id),
          product_variant_id: row.product_variant_id ? Number(row.product_variant_id) : null,
          batch_id: row.batch_id ? Number(row.batch_id) : null,
          quantity: Number(row.quantity),
          unit_cost: Number(row.unit_cost || 0),
          total_cost: Number(row.total_cost || 0),
          product_name: row.product_name || `Product #${row.product_id}`,
          barcode: row.barcode || "",
          variant_name: row.variant_name || null,
          batch_number: row.batch_number || null,
        })),
      },
    }
  } catch (error) {
    console.error("Get warehouse transfer by ID error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}.`,
      data: null,
    }
  }
}

export async function createWarehouseTransfer(formData: FormData) {
  const userId = Number(formData.get("user_id"))
  const fromDeviceId = Number(formData.get("from_device_id"))
  const toDeviceId = Number(formData.get("to_device_id"))
  const notes = String(formData.get("notes") || "").trim()
  const paymentStatus = String(formData.get("payment_status") || "unpaid").trim().toLowerCase()
  const paymentMethod = String(formData.get("payment_method") || "").trim()
  const paymentNotes = String(formData.get("payment_notes") || "").trim()
  const paidAmount = Number(formData.get("paid_amount") || 0)
  const transferDate = normalizeTransferDate(formData.get("transfer_date"))
  const itemsRaw = String(formData.get("items") || "[]")

  let parsedItems: any[] = []
  try {
    parsedItems = JSON.parse(itemsRaw)
  } catch {
    return { success: false, message: "Invalid transfer items format" }
  }

  const items = normalizeTransferItems(parsedItems)

  if (!userId || !fromDeviceId || !toDeviceId) {
    return { success: false, message: "User, source device, and destination device are required" }
  }
  if (fromDeviceId === toDeviceId) {
    return { success: false, message: "Source and destination warehouse cannot be the same" }
  }
  if (items.length === 0) {
    return { success: false, message: "At least one valid product is required" }
  }
  const allowedPaymentStatuses = new Set(["unpaid", "partial", "paid"])
  if (!allowedPaymentStatuses.has(paymentStatus)) {
    return { success: false, message: "Invalid payment status" }
  }
  if (!Number.isFinite(paidAmount) || paidAmount < 0) {
    return { success: false, message: "Paid amount must be a valid non-negative number" }
  }
  if (transferDate === "__invalid__") {
    return { success: false, message: "Transfer date must be in YYYY-MM-DD format" }
  }

  resetConnectionState()
  try {
    // await sql`BEGIN`
    const actorCompanyId = await getCompanyIdForDevice(userId)
    const fromCompanyId = await getCompanyIdForDevice(fromDeviceId)
    const toCompanyId = await getCompanyIdForDevice(toDeviceId)
    if (!actorCompanyId || actorCompanyId !== fromCompanyId || actorCompanyId !== toCompanyId) {
      // await sql`ROLLBACK`
      return { success: false, message: "Devices must belong to the same company" }
    }

    const totalAmount = Number(
      items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0), 0).toFixed(2),
    )
    if (paidAmount > totalAmount) {
      // await sql`ROLLBACK`
      return { success: false, message: "Paid amount cannot exceed transfer amount" }
    }

    // A transfer is a "request" (pending the sender's approval) whenever the
    // creating device is NOT the source warehouse. When the source warehouse
    // itself creates the transfer (pushing its own stock out), it completes
    // immediately.
    const initialStatus = "pending_approval"

    const transferRows = (await sql`
      INSERT INTO stock_transfers (
        company_id, from_device_id, to_device_id, status, approval_status, total_amount, payment_status, payment_method, paid_amount, payment_notes, transfer_date, notes, created_by, created_at, updated_at
      ) VALUES (
        ${actorCompanyId}, ${fromDeviceId}, ${toDeviceId}, ${initialStatus}, ${initialStatus}, ${totalAmount}, ${paymentStatus}, ${paymentMethod || null}, ${paidAmount}, ${paymentNotes || null}, COALESCE(${transferDate}::timestamp, NOW()), ${notes}, ${userId}, NOW(), NOW()
      )
      RETURNING id
    `) as any[]
    const transferId = Number(transferRows[0].id)

    for (const item of items) {
      await sql`
        INSERT INTO stock_transfer_items (transfer_id, product_id, product_variant_id, batch_id, quantity, unit_cost, total_cost, created_at)
        VALUES (${transferId}, ${item.product_id}, ${item.product_variant_id || null}, ${item.batch_id || null}, ${item.quantity}, ${item.unit_cost}, ${Number((item.quantity * item.unit_cost).toFixed(2))}, NOW())
      `
    }

    revalidatePath("/dashboard")
    return {
      success: true,
      message: "Transfer request created successfully and sent for approval",
      data: { id: transferId, status: initialStatus },
    }
  } catch (error: any) {
    // await sql`ROLLBACK`
    console.error("Create warehouse transfer error:", error)
    return {
      success: false,
      message: error?.message || `Database error: ${getLastError()?.message || "Unknown error"}.`,
    }
  }
}

export async function updateWarehouseTransfer(formData: FormData) {
  const transferId = Number(formData.get("transfer_id"))
  const userId = Number(formData.get("user_id"))
  const fromDeviceId = Number(formData.get("from_device_id"))
  const toDeviceId = Number(formData.get("to_device_id"))
  const notes = String(formData.get("notes") || "").trim()
  const paymentStatus = String(formData.get("payment_status") || "unpaid").trim().toLowerCase()
  const paymentMethod = String(formData.get("payment_method") || "").trim()
  const paymentNotes = String(formData.get("payment_notes") || "").trim()
  const paidAmount = Number(formData.get("paid_amount") || 0)
  const transferDate = normalizeTransferDate(formData.get("transfer_date"))
  const itemsRaw = String(formData.get("items") || "[]")

  let parsedItems: any[] = []
  try {
    parsedItems = JSON.parse(itemsRaw)
  } catch {
    return { success: false, message: "Invalid transfer items format" }
  }

  const items = normalizeTransferItems(parsedItems)

  if (!transferId || !userId || !fromDeviceId || !toDeviceId) {
    return { success: false, message: "Transfer, user, source, and destination are required" }
  }
  if (fromDeviceId === toDeviceId) {
    return { success: false, message: "Source and destination warehouse cannot be the same" }
  }
  if (items.length === 0) {
    return { success: false, message: "At least one valid product is required" }
  }
  const allowedPaymentStatuses = new Set(["unpaid", "partial", "paid"])
  if (!allowedPaymentStatuses.has(paymentStatus)) {
    return { success: false, message: "Invalid payment status" }
  }
  if (!Number.isFinite(paidAmount) || paidAmount < 0) {
    return { success: false, message: "Paid amount must be a valid non-negative number" }
  }
  if (transferDate === "__invalid__") {
    return { success: false, message: "Transfer date must be in YYYY-MM-DD format" }
  }

  resetConnectionState()
  try {
    // await sql`BEGIN`
    const actorCompanyId = await getCompanyIdForDevice(userId)
    const fromCompanyId = await getCompanyIdForDevice(fromDeviceId)
    const toCompanyId = await getCompanyIdForDevice(toDeviceId)
    if (!actorCompanyId || actorCompanyId !== fromCompanyId || actorCompanyId !== toCompanyId) {
      // await sql`ROLLBACK`
      return { success: false, message: "Devices must belong to the same company" }
    }

    const totalAmount = Number(
      items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0), 0).toFixed(2),
    )
    if (paidAmount > totalAmount) {
      // await sql`ROLLBACK`
      return { success: false, message: "Paid amount cannot exceed transfer amount" }
    }

    const transferRows = (await sql`
      SELECT id, status, from_device_id, to_device_id
      FROM stock_transfers
      WHERE id = ${transferId} AND company_id = ${actorCompanyId}
      LIMIT 1
    `) as any[]
    if (transferRows.length === 0) {
      // await sql`ROLLBACK`
      return { success: false, message: "Transfer not found" }
    }

    const transfer = transferRows[0]
    const currentStatus = String(transfer.status).toLowerCase()
    if (currentStatus === "cancelled") {
      // await sql`ROLLBACK`
      return { success: false, message: "Cancelled transfers cannot be edited" }
    }
    if (currentStatus === "rejected") {
      // await sql`ROLLBACK`
      return { success: false, message: "Rejected transfers cannot be edited" }
    }

    // A pending request hasn't moved any stock or recorded any financials yet,
    // so editing it only updates the proposed details/items.
    const isPending = currentStatus === "pending"

    const existingItemsRows = (await sql`
      SELECT product_id, product_variant_id, batch_id, quantity
      FROM stock_transfer_items
      WHERE transfer_id = ${transferId}
      ORDER BY id ASC
    `) as any[]
    const existingItems = existingItemsRows.map((row) => ({
      product_id: Number(row.product_id),
      product_variant_id: row.product_variant_id ? Number(row.product_variant_id) : null,
      batch_id: row.batch_id ? Number(row.batch_id) : null,
      quantity: Number(row.quantity),
    }))

    const originalFromDeviceId = Number(transfer.from_device_id)
    const originalToDeviceId = Number(transfer.to_device_id)
    const isSameRoute = originalFromDeviceId === fromDeviceId && originalToDeviceId === toDeviceId

    if (isPending) {
      // No stock has moved for a pending request — nothing to reconcile here.
    } else if (isSameRoute) {
      const oldQtyMap = new Map<string, number>()
      for (const item of existingItems) {
        const key = `${item.product_id}_${item.product_variant_id || ''}_${item.batch_id || ''}`
        oldQtyMap.set(key, (oldQtyMap.get(key) || 0) + item.quantity)
      }

      const newQtyMap = new Map<string, number>()
      for (const item of items) {
        const key = `${item.product_id}_${item.product_variant_id || ''}_${item.batch_id || ''}`
        newQtyMap.set(key, (newQtyMap.get(key) || 0) + item.quantity)
      }

      const allKeys = new Set([...oldQtyMap.keys(), ...newQtyMap.keys()])
      for (const key of allKeys) {
        const parts = key.split("_")
        const productId = Number(parts[0])
        const variantId = parts[1] ? Number(parts[1]) : null
        const batchId = parts[2] ? Number(parts[2]) : null

        const oldQty = oldQtyMap.get(key) || 0
        const newQty = newQtyMap.get(key) || 0
        const delta = newQty - oldQty
        if (delta === 0) continue

        if (delta > 0) {
          await moveStockBetweenDevices(
            productId,
            variantId,
            batchId,
            delta,
            fromDeviceId,
            toDeviceId,
            transferId,
            userId,
            `Transfer edit change +${delta} #${transferId}`,
          )
        } else {
          await moveStockBetweenDevices(
            productId,
            variantId,
            batchId,
            Math.abs(delta),
            toDeviceId,
            fromDeviceId,
            transferId,
            userId,
            `Transfer edit change ${delta} #${transferId}`,
          )
        }
      }
    } else {
      await reverseTransferItems(
        transferId,
        existingItems,
        originalFromDeviceId,
        originalToDeviceId,
        userId,
        "Transfer edit reversal",
      )

      for (const item of items) {
        await moveStockBetweenDevices(
          item.product_id,
          item.product_variant_id,
          item.batch_id,
          item.quantity,
          fromDeviceId,
          toDeviceId,
          transferId,
          userId,
          `Transfer edit apply #${transferId}`,
        )
      }
    }

    await sql`DELETE FROM stock_transfer_items WHERE transfer_id = ${transferId}`

    await sql`
      UPDATE stock_transfers
      SET from_device_id = ${fromDeviceId},
          to_device_id = ${toDeviceId},
          total_amount = ${totalAmount},
          payment_status = ${paymentStatus},
          payment_method = ${paymentMethod || null},
          paid_amount = ${paidAmount},
          payment_notes = ${paymentNotes || null},
          transfer_date = COALESCE(${transferDate}::timestamp, transfer_date, NOW()),
          notes = ${notes},
          updated_at = NOW()
      WHERE id = ${transferId}
    `

    for (const item of items) {
      await sql`
        INSERT INTO stock_transfer_items (transfer_id, product_id, product_variant_id, batch_id, quantity, unit_cost, total_cost, created_at)
        VALUES (${transferId}, ${item.product_id}, ${item.product_variant_id || null}, ${item.batch_id || null}, ${item.quantity}, ${item.unit_cost}, ${Number((item.quantity * item.unit_cost).toFixed(2))}, NOW())
      `
    }

    if (!isPending) {
      await deleteTransferLedger(transferId)
      await recordTransferLedger({
        transferId,
        companyId: actorCompanyId,
        fromDeviceId,
        toDeviceId,
        totalAmount,
        paidAmount,
        paymentStatus,
        paymentMethod,
        paymentNotes,
        userId,
        transferDate,
      })
    }

    // await sql`COMMIT`
    revalidatePath("/dashboard")
    return { success: true, message: "Transfer updated successfully" }
  } catch (error: any) {
    // await sql`ROLLBACK`
    console.error("Update warehouse transfer error:", error)
    return {
      success: false,
      message: error?.message || `Database error: ${getLastError()?.message || "Unknown error"}.`,
    }
  }
}

export async function cancelWarehouseTransfer(transferId: number, userId: number) {
  if (!transferId || !userId) {
    return { success: false, message: "Transfer ID and user ID are required" }
  }

  resetConnectionState()
  try {
    // await sql`BEGIN`
    const actorCompanyId = await getCompanyIdForDevice(userId)
    if (!actorCompanyId) {
      // await sql`ROLLBACK`
      return { success: false, message: "Device/company not found" }
    }

    const transferRows = (await sql`
      SELECT id, status, from_device_id, to_device_id
      FROM stock_transfers
      WHERE id = ${transferId} AND company_id = ${actorCompanyId}
      LIMIT 1
    `) as any[]
    if (transferRows.length === 0) {
      // await sql`ROLLBACK`
      return { success: false, message: "Transfer not found" }
    }

    const transfer = transferRows[0]
    const cancelStatus = String(transfer.status).toLowerCase()
    if (cancelStatus === "cancelled") {
      // await sql`ROLLBACK`
      return { success: false, message: "Transfer is already cancelled" }
    }
    if (cancelStatus === "rejected") {
      // await sql`ROLLBACK`
      return { success: false, message: "Rejected transfers cannot be cancelled" }
    }

    // Only completed transfers have moved stock / recorded financials that need
    // to be reversed. Pending requests have done neither.
    if (cancelStatus !== "pending") {
      const itemsRows = (await sql`
        SELECT product_id, product_variant_id, batch_id, quantity
        FROM stock_transfer_items
        WHERE transfer_id = ${transferId}
        ORDER BY id ASC
      `) as any[]

      const items = itemsRows.map((row) => ({
        product_id: Number(row.product_id),
        product_variant_id: row.product_variant_id ? Number(row.product_variant_id) : null,
        batch_id: row.batch_id ? Number(row.batch_id) : null,
        quantity: Number(row.quantity),
      }))

      await reverseTransferItems(
        transferId,
        items,
        Number(transfer.from_device_id),
        Number(transfer.to_device_id),
        userId,
        "Transfer cancellation reversal",
      )

      await deleteTransferLedger(transferId)
    }

    await sql`
      UPDATE stock_transfers
      SET status = 'cancelled',
          cancelled_at = NOW(),
          cancelled_by = ${userId},
          updated_at = NOW()
      WHERE id = ${transferId}
    `

    // await sql`COMMIT`
    revalidatePath("/dashboard")
    return { success: true, message: "Transfer cancelled successfully" }
  } catch (error: any) {
    // await sql`ROLLBACK`
    console.error("Cancel warehouse transfer error:", error)
    return {
      success: false,
      message: error?.message || `Database error: ${getLastError()?.message || "Unknown error"}.`,
    }
  }
}

// Sender (source warehouse) approves a pending transfer request: the stock
// physically moves now and the financial entries are recorded.
export async function acceptWarehouseTransfer(transferId: number, userId: number) {
  if (!transferId || !userId) {
    return { success: false, message: "Transfer ID and user ID are required" }
  }

  resetConnectionState()
  try {
    const actorCompanyId = await getCompanyIdForDevice(userId)
    if (!actorCompanyId) {
      return { success: false, message: "Device/company not found" }
    }

    const transferRows = (await sql`
      SELECT id, status, approval_status, from_device_id, to_device_id, total_amount, paid_amount,
             payment_status, payment_method, payment_notes,
             TO_CHAR(COALESCE(transfer_date, created_at), 'YYYY-MM-DD') AS transfer_date_str
      FROM stock_transfers
      WHERE id = ${transferId} AND company_id = ${actorCompanyId}
      LIMIT 1
    `) as any[]
    if (transferRows.length === 0) {
      return { success: false, message: "Transfer not found" }
    }

    const transfer = transferRows[0]
    const currentStatus = String(transfer.approval_status || transfer.status).toLowerCase()
    if (currentStatus !== "pending" && currentStatus !== "pending_approval") {
      return { success: false, message: "Only pending requests can be approved" }
    }

    const fromDeviceId = Number(transfer.from_device_id)
    const toDeviceId = Number(transfer.to_device_id)

    if (toDeviceId !== userId) {
      return { success: false, message: "Only the destination device can approve this transfer request" }
    }

    const itemsRows = (await sql`
      SELECT product_id, product_variant_id, batch_id, quantity
      FROM stock_transfer_items
      WHERE transfer_id = ${transferId}
      ORDER BY id ASC
    `) as any[]
    const items = itemsRows.map((row) => ({
      product_id: Number(row.product_id),
      product_variant_id: row.product_variant_id ? Number(row.product_variant_id) : null,
      batch_id: row.batch_id ? Number(row.batch_id) : null,
      quantity: Number(row.quantity),
    }))

    if (items.length === 0) {
      return { success: false, message: "This request has no items to transfer" }
    }

    // Authoritative stock check + movement happens here, at acceptance time.
    for (const item of items) {
      await moveStockBetweenDevices(
        item.product_id,
        item.product_variant_id,
        item.batch_id,
        item.quantity,
        fromDeviceId,
        toDeviceId,
        transferId,
        userId,
        `Transfer request accepted #${transferId}`,
      )
    }

    await recordTransferLedger({
      transferId,
      companyId: actorCompanyId,
      fromDeviceId,
      toDeviceId,
      totalAmount: Number(transfer.total_amount || 0),
      paidAmount: Number(transfer.paid_amount || 0),
      paymentStatus: String(transfer.payment_status || "unpaid"),
      paymentMethod: String(transfer.payment_method || ""),
      paymentNotes: String(transfer.payment_notes || ""),
      userId,
      transferDate: transfer.transfer_date_str || null,
    })

    await sql`
      UPDATE stock_transfers
      SET status = 'approved',
          approval_status = 'approved',
          approved_by = ${userId},
          approved_at = NOW(),
          updated_at = NOW()
      WHERE id = ${transferId}
    `

    revalidatePath("/dashboard")
    return { success: true, message: "Transfer request approved successfully" }
  } catch (error: any) {
    console.error("Accept warehouse transfer error:", error)
    return {
      success: false,
      message: error?.message || `Database error: ${getLastError()?.message || "Unknown error"}.`,
    }
  }
}

// Destination or source device rejects a pending request with a reason. No stock or money moves.
export async function rejectWarehouseTransfer(transferId: number, userId: number, reason: string) {
  if (!transferId || !userId) {
    return { success: false, message: "Transfer ID and user ID are required" }
  }

  const rejectionReason = String(reason || "").trim()
  if (!rejectionReason) {
    return { success: false, message: "A reason is required to reject a request" }
  }

  resetConnectionState()
  try {
    const actorCompanyId = await getCompanyIdForDevice(userId)
    if (!actorCompanyId) {
      return { success: false, message: "Device/company not found" }
    }

    const transferRows = (await sql`
      SELECT id, status, approval_status, from_device_id, to_device_id
      FROM stock_transfers
      WHERE id = ${transferId} AND company_id = ${actorCompanyId}
      LIMIT 1
    `) as any[]
    if (transferRows.length === 0) {
      return { success: false, message: "Transfer not found" }
    }

    const transfer = transferRows[0]
    const currentStatus = String(transfer.approval_status || transfer.status).toLowerCase()
    if (currentStatus !== "pending" && currentStatus !== "pending_approval") {
      return { success: false, message: "Only pending requests can be rejected" }
    }

    const toDeviceId = Number(transfer.to_device_id)
    if (toDeviceId !== userId) {
      return { success: false, message: "Only the destination device can reject this transfer request" }
    }

    await sql`
      UPDATE stock_transfers
      SET status = 'rejected',
          approval_status = 'rejected',
          rejection_reason = ${rejectionReason},
          rejected_by = ${userId},
          rejected_at = NOW(),
          updated_at = NOW()
      WHERE id = ${transferId}
    `

    // await sql`COMMIT`
    revalidatePath("/dashboard")
    return { success: true, message: "Transfer request rejected" }
  } catch (error: any) {
    // await sql`ROLLBACK`
    console.error("Reject warehouse transfer error:", error)
    return {
      success: false,
      message: error?.message || `Database error: ${getLastError()?.message || "Unknown error"}.`,
    }
  }
}

function derivePaymentStatus(totalAmount: number, paidAmount: number): string {
  if (paidAmount <= 0) return "unpaid"
  if (paidAmount >= totalAmount - 0.01) return "paid"
  return "partial"
}

export async function refreshTransferPaymentLedger(transferId: number, userId: number) {
  const companyId = await getCompanyIdForDevice(userId)
  if (!companyId) throw new Error("Device/company not found")

  const rows = (await sql`
    SELECT
      id, from_device_id, to_device_id,
      COALESCE(total_amount, 0)::numeric AS total_amount,
      COALESCE(paid_amount, 0)::numeric AS paid_amount,
      COALESCE(payment_status, 'unpaid') AS payment_status,
      COALESCE(payment_method, '') AS payment_method,
      COALESCE(payment_notes, '') AS payment_notes,
      TO_CHAR(COALESCE(transfer_date, created_at), 'YYYY-MM-DD') AS transfer_date_str
    FROM stock_transfers
    WHERE id = ${transferId} AND company_id = ${companyId} AND LOWER(status) = 'completed'
    LIMIT 1
  `) as any[]

  if (rows.length === 0) return

  const transfer = rows[0]
  await deleteTransferLedger(transferId)
  await recordTransferLedger({
    transferId: Number(transfer.id),
    companyId,
    fromDeviceId: Number(transfer.from_device_id),
    toDeviceId: Number(transfer.to_device_id),
    totalAmount: Number(transfer.total_amount || 0),
    paidAmount: Number(transfer.paid_amount || 0),
    paymentStatus: String(transfer.payment_status || "unpaid"),
    paymentMethod: String(transfer.payment_method || ""),
    paymentNotes: String(transfer.payment_notes || ""),
    userId,
    transferDate: transfer.transfer_date_str || null,
  })
}

export type WarehouseSettlementSummary = {
  warehouse_id: number
  warehouse_name: string
  total_received: number
  paid_to_them: number
  we_owe: number
  payable_transfer_count: number
  total_sent: number
  collected_from_them: number
  they_owe_us: number
  receivable_transfer_count: number
}

export async function getWarehouseSettlementSummaries(deviceId: number) {
  if (!deviceId) {
    return { success: false, message: "Device ID is required", data: [] as WarehouseSettlementSummary[] }
  }

  resetConnectionState()
  try {
    const companyId = await getCompanyIdForDevice(deviceId)
    if (!companyId) {
      return { success: false, message: "Device/company not found", data: [] as WarehouseSettlementSummary[] }
    }

    const rows = (await sql`
      WITH partners AS (
        SELECT DISTINCT
          CASE
            WHEN from_device_id = ${deviceId} THEN to_device_id
            ELSE from_device_id
          END AS partner_id
        FROM stock_transfers
        WHERE company_id = ${companyId}
          AND LOWER(status) = 'completed'
          AND (from_device_id = ${deviceId} OR to_device_id = ${deviceId})
      ),
      payable AS (
        SELECT
          from_device_id AS partner_id,
          SUM(COALESCE(total_amount, 0))::numeric AS total_received,
          SUM(COALESCE(paid_amount, 0))::numeric AS paid_to_them,
          SUM(GREATEST(COALESCE(total_amount, 0) - COALESCE(paid_amount, 0), 0))::numeric AS we_owe,
          COUNT(*) FILTER (
            WHERE COALESCE(total_amount, 0) - COALESCE(paid_amount, 0) > 0.01
          )::int AS payable_transfer_count
        FROM stock_transfers
        WHERE company_id = ${companyId}
          AND LOWER(status) = 'completed'
          AND to_device_id = ${deviceId}
        GROUP BY from_device_id
      ),
      receivable AS (
        SELECT
          to_device_id AS partner_id,
          SUM(COALESCE(total_amount, 0))::numeric AS total_sent,
          SUM(COALESCE(paid_amount, 0))::numeric AS collected_from_them,
          SUM(GREATEST(COALESCE(total_amount, 0) - COALESCE(paid_amount, 0), 0))::numeric AS they_owe_us,
          COUNT(*) FILTER (
            WHERE COALESCE(total_amount, 0) - COALESCE(paid_amount, 0) > 0.01
          )::int AS receivable_transfer_count
        FROM stock_transfers
        WHERE company_id = ${companyId}
          AND LOWER(status) = 'completed'
          AND from_device_id = ${deviceId}
        GROUP BY to_device_id
      )
      SELECT
        p.partner_id AS warehouse_id,
        d.name AS warehouse_name,
        COALESCE(pb.total_received, 0)::numeric AS total_received,
        COALESCE(pb.paid_to_them, 0)::numeric AS paid_to_them,
        COALESCE(pb.we_owe, 0)::numeric AS we_owe,
        COALESCE(pb.payable_transfer_count, 0)::int AS payable_transfer_count,
        COALESCE(rb.total_sent, 0)::numeric AS total_sent,
        COALESCE(rb.collected_from_them, 0)::numeric AS collected_from_them,
        COALESCE(rb.they_owe_us, 0)::numeric AS they_owe_us,
        COALESCE(rb.receivable_transfer_count, 0)::int AS receivable_transfer_count
      FROM partners p
      JOIN devices d ON d.id = p.partner_id
      LEFT JOIN payable pb ON pb.partner_id = p.partner_id
      LEFT JOIN receivable rb ON rb.partner_id = p.partner_id
      WHERE p.partner_id != ${deviceId}
      ORDER BY COALESCE(pb.we_owe, 0) DESC, COALESCE(rb.they_owe_us, 0) DESC, d.name ASC
    `) as any[]

    const data: WarehouseSettlementSummary[] = rows.map((row) => ({
      warehouse_id: Number(row.warehouse_id),
      warehouse_name: row.warehouse_name || `Warehouse #${row.warehouse_id}`,
      total_received: Number(row.total_received || 0),
      paid_to_them: Number(row.paid_to_them || 0),
      we_owe: Number(row.we_owe || 0),
      payable_transfer_count: Number(row.payable_transfer_count || 0),
      total_sent: Number(row.total_sent || 0),
      collected_from_them: Number(row.collected_from_them || 0),
      they_owe_us: Number(row.they_owe_us || 0),
      receivable_transfer_count: Number(row.receivable_transfer_count || 0),
    }))

    return { success: true, data }
  } catch (error) {
    console.error("Get warehouse settlement summaries error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}.`,
      data: [] as WarehouseSettlementSummary[],
    }
  }
}

export async function getTransferDashboardStats(userId: number) {
  if (!userId) {
    return { success: false, data: { pendingApprovals: 0, approvedToday: 0, rejectedToday: 0, transferValueToday: 0 } }
  }

  resetConnectionState()
  try {
    const companyId = await getCompanyIdForDevice(userId)
    if (!companyId) return { success: false, data: { pendingApprovals: 0, approvedToday: 0, rejectedToday: 0, transferValueToday: 0 } }

    const pendingRows = (await sql`
      SELECT COUNT(*)::int as count
      FROM stock_transfers
      WHERE company_id = ${companyId}
        AND to_device_id = ${userId}
        AND LOWER(COALESCE(approval_status, status)) IN ('pending', 'pending_approval')
    `) as any[]

    const approvedTodayRows = (await sql`
      SELECT COUNT(*)::int as count
      FROM stock_transfers
      WHERE company_id = ${companyId}
        AND (from_device_id = ${userId} OR to_device_id = ${userId})
        AND LOWER(COALESCE(approval_status, status)) IN ('approved', 'completed')
        AND approved_at >= CURRENT_DATE
    `) as any[]

    const rejectedTodayRows = (await sql`
      SELECT COUNT(*)::int as count
      FROM stock_transfers
      WHERE company_id = ${companyId}
        AND (from_device_id = ${userId} OR to_device_id = ${userId})
        AND LOWER(COALESCE(approval_status, status)) = 'rejected'
        AND rejected_at >= CURRENT_DATE
    `) as any[]

    const valueTodayRows = (await sql`
      SELECT COALESCE(SUM(total_amount), 0)::numeric as total
      FROM stock_transfers
      WHERE company_id = ${companyId}
        AND (from_device_id = ${userId} OR to_device_id = ${userId})
        AND created_at >= CURRENT_DATE
    `) as any[]

    return {
      success: true,
      data: {
        pendingApprovals: Number(pendingRows[0]?.count || 0),
        approvedToday: Number(approvedTodayRows[0]?.count || 0),
        rejectedToday: Number(rejectedTodayRows[0]?.count || 0),
        transferValueToday: Number(valueTodayRows[0]?.total || 0),
      },
    }
  } catch (err) {
    console.error("Get transfer dashboard stats error:", err)
    return { success: false, data: { pendingApprovals: 0, approvedToday: 0, rejectedToday: 0, transferValueToday: 0 } }
  }
}

export { derivePaymentStatus }
