"use server"

import { sql, getLastError, resetConnectionState } from "@/lib/db"
import { revalidatePath } from "next/cache"

type TransferItemInput = {
  product_id: number
  quantity: number
  unit_cost: number
}

type StockMoveItemInput = {
  product_id: number
  quantity: number
}

async function ensureTransferTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS stock_transfers (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      from_device_id INTEGER NOT NULL,
      to_device_id INTEGER NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'completed',
      total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      payment_status VARCHAR(30) NOT NULL DEFAULT 'unpaid',
      payment_method VARCHAR(50),
      paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      payment_notes TEXT,
      transfer_date TIMESTAMP DEFAULT NOW(),
      notes TEXT,
      created_by INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      cancelled_at TIMESTAMP,
      cancelled_by INTEGER
    )
  `

  await sql`ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS total_amount DECIMAL(12,2) NOT NULL DEFAULT 0`
  await sql`ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS payment_status VARCHAR(30) NOT NULL DEFAULT 'unpaid'`
  await sql`ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)`
  await sql`ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0`
  await sql`ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS payment_notes TEXT`
  await sql`ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS transfer_date TIMESTAMP DEFAULT NOW()`

  await sql`
    CREATE TABLE IF NOT EXISTS stock_transfer_items (
      id SERIAL PRIMARY KEY,
      transfer_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
      total_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `

  await sql`ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0`
  await sql`ALTER TABLE stock_transfer_items ADD COLUMN IF NOT EXISTS total_cost DECIMAL(12,2) NOT NULL DEFAULT 0`
}

async function ensureProductDeviceStockTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS product_device_stock (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL,
      device_id INTEGER NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(product_id, device_id)
    )
  `
}

function normalizeTransferItems(items: any[]): TransferItemInput[] {
  const itemMap = new Map<number, { quantity: number; unit_cost: number }>()

  for (const item of items || []) {
    const productId = Number(item?.product_id)
    const quantity = Number(item?.quantity)
    const unitCost = Number(item?.unit_cost ?? 0)
    if (!Number.isFinite(productId) || productId <= 0) continue
    if (!Number.isFinite(quantity) || quantity <= 0) continue

    const nextQuantity = Math.floor(quantity)
    const safeUnitCost = Number.isFinite(unitCost) && unitCost >= 0 ? unitCost : 0
    const existing = itemMap.get(productId)
    if (!existing) {
      itemMap.set(productId, { quantity: nextQuantity, unit_cost: safeUnitCost })
    } else {
      const totalQty = existing.quantity + nextQuantity
      const weightedCost =
        totalQty > 0
          ? (existing.unit_cost * existing.quantity + safeUnitCost * nextQuantity) / totalQty
          : safeUnitCost
      itemMap.set(productId, { quantity: totalQty, unit_cost: weightedCost })
    }
  }

  return Array.from(itemMap.entries()).map(([product_id, value]) => ({
    product_id,
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

async function getDeviceStockForUpdate(productId: number, deviceId: number): Promise<number> {
  const rows = (await sql`
    SELECT stock
    FROM product_device_stock
    WHERE product_id = ${productId} AND device_id = ${deviceId}
    FOR UPDATE
  `) as any[]
  return rows.length > 0 ? Number(rows[0].stock || 0) : 0
}

async function upsertDeviceStock(productId: number, deviceId: number, stock: number) {
  await sql`
    INSERT INTO product_device_stock (product_id, device_id, stock, updated_at)
    VALUES (${productId}, ${deviceId}, ${Math.max(0, stock)}, NOW())
    ON CONFLICT (product_id, device_id)
    DO UPDATE SET stock = ${Math.max(0, stock)}, updated_at = NOW()
  `
}

async function createTransferHistoryRows(
  transferId: number,
  productId: number,
  quantity: number,
  fromDeviceId: number,
  toDeviceId: number,
  actorDeviceId: number,
  notes?: string,
) {
  const noteText = notes || `Transfer #${transferId}`

  await sql`
    INSERT INTO product_stock_history (
      product_id, quantity, type, reference_id, reference_type, notes, created_by, device_id
    ) VALUES (
      ${productId}, ${-Math.abs(quantity)}, 'transfer_out', ${transferId}, 'transfer',
      ${noteText}, ${actorDeviceId}, ${fromDeviceId}
    )
  `

  await sql`
    INSERT INTO product_stock_history (
      product_id, quantity, type, reference_id, reference_type, notes, created_by, device_id
    ) VALUES (
      ${productId}, ${Math.abs(quantity)}, 'transfer_in', ${transferId}, 'transfer',
      ${noteText}, ${actorDeviceId}, ${toDeviceId}
    )
  `
}

async function moveStockBetweenDevices(
  productId: number,
  quantity: number,
  fromDeviceId: number,
  toDeviceId: number,
  transferId: number,
  actorDeviceId: number,
  historyNotes?: string,
) {
  const lockOrder = [fromDeviceId, toDeviceId].sort((a, b) => a - b)
  await getDeviceStockForUpdate(productId, lockOrder[0])
  if (lockOrder[1] !== lockOrder[0]) {
    await getDeviceStockForUpdate(productId, lockOrder[1])
  }

  const fromStock = await getDeviceStockForUpdate(productId, fromDeviceId)
  if (fromStock < quantity) {
    throw new Error(`Insufficient stock for product ID ${productId}. Available: ${fromStock}, required: ${quantity}.`)
  }

  const toStock = await getDeviceStockForUpdate(productId, toDeviceId)

  await upsertDeviceStock(productId, fromDeviceId, fromStock - quantity)
  await upsertDeviceStock(productId, toDeviceId, toStock + quantity)

  await createTransferHistoryRows(transferId, productId, quantity, fromDeviceId, toDeviceId, actorDeviceId, historyNotes)
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
    return { success: false, message: "User ID is required", data: { devices: [], products: [] } }
  }

  resetConnectionState()
  try {
    await ensureTransferTables()
    await ensureProductDeviceStockTable()

    const companyId = await getCompanyIdForDevice(userId)
    if (!companyId) {
      return { success: false, message: "Device/company not found", data: { devices: [], products: [] } }
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
        COALESCE(p.wholesale_price, 0) AS default_unit_cost,
        COALESCE(pds.stock, 0) AS source_stock
      FROM products p
      JOIN devices d ON d.id = p.created_by
      LEFT JOIN product_device_stock pds
        ON pds.product_id = p.id AND pds.device_id = ${sourceDeviceId}
      WHERE d.company_id = ${companyId}
      ORDER BY p.name ASC
    `) as any[]

    return {
      success: true,
      data: {
        devices: devices.map((d) => ({ id: Number(d.id), name: d.name })),
        products: products.map((p) => ({
          id: Number(p.id),
          name: p.name,
          barcode: p.barcode || "",
          default_unit_cost: Number(p.default_unit_cost || 0),
          source_stock: Number(p.source_stock || 0),
        })),
      },
    }
  } catch (error) {
    console.error("Get transfer form data error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}.`,
      data: { devices: [], products: [] },
    }
  }
}

export async function getWarehouseTransfers(userId: number, searchTerm?: string, statusFilter?: string) {
  if (!userId) {
    return { success: false, message: "User ID is required", data: [] }
  }

  resetConnectionState()
  try {
    await ensureTransferTables()
    const companyId = await getCompanyIdForDevice(userId)
    if (!companyId) return { success: false, message: "Device/company not found", data: [] }

    const search = (searchTerm || "").trim().toLowerCase()
    const status = (statusFilter || "all").trim().toLowerCase()
    const searchPattern = `%${search}%`

    const transfers = (await sql`
      SELECT
        t.id,
        t.from_device_id,
        t.to_device_id,
        t.status,
        COALESCE(t.total_amount, 0)::numeric AS total_amount,
        COALESCE(t.payment_status, 'unpaid') AS payment_status,
        COALESCE(t.payment_method, '') AS payment_method,
        COALESCE(t.paid_amount, 0)::numeric AS paid_amount,
        COALESCE(t.transfer_date, t.created_at) AS transfer_date,
        t.notes,
        t.created_by,
        t.created_at,
        t.updated_at,
        df.name AS from_device_name,
        dt.name AS to_device_name,
        COUNT(ti.id)::int AS item_count,
        COALESCE(SUM(ti.quantity), 0)::int AS total_quantity
      FROM stock_transfers t
      JOIN devices df ON df.id = t.from_device_id
      JOIN devices dt ON dt.id = t.to_device_id
      LEFT JOIN stock_transfer_items ti ON ti.transfer_id = t.id
      WHERE t.company_id = ${companyId}
        AND (${status} = 'all' OR LOWER(t.status) = ${status})
        AND (
          ${search} = ''
          OR CAST(t.id AS TEXT) LIKE ${searchPattern}
          OR LOWER(COALESCE(df.name, '')) LIKE ${searchPattern}
          OR LOWER(COALESCE(dt.name, '')) LIKE ${searchPattern}
          OR LOWER(COALESCE(t.notes, '')) LIKE ${searchPattern}
        )
      GROUP BY t.id, df.name, dt.name
      ORDER BY COALESCE(t.transfer_date, t.created_at) DESC, t.id DESC
      LIMIT 300
    `) as any[]

    return { success: true, data: transfers }
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
    await ensureTransferTables()
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
        ti.quantity,
        COALESCE(ti.unit_cost, 0)::numeric AS unit_cost,
        COALESCE(ti.total_cost, 0)::numeric AS total_cost,
        p.name AS product_name,
        p.barcode
      FROM stock_transfer_items ti
      LEFT JOIN products p ON p.id = ti.product_id
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
          quantity: Number(row.quantity),
          unit_cost: Number(row.unit_cost || 0),
          total_cost: Number(row.total_cost || 0),
          product_name: row.product_name || `Product #${row.product_id}`,
          barcode: row.barcode || "",
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
    await sql`BEGIN`
    await ensureTransferTables()
    await ensureProductDeviceStockTable()

    const actorCompanyId = await getCompanyIdForDevice(userId)
    const fromCompanyId = await getCompanyIdForDevice(fromDeviceId)
    const toCompanyId = await getCompanyIdForDevice(toDeviceId)
    if (!actorCompanyId || actorCompanyId !== fromCompanyId || actorCompanyId !== toCompanyId) {
      await sql`ROLLBACK`
      return { success: false, message: "Devices must belong to the same company" }
    }

    const totalAmount = Number(
      items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0), 0).toFixed(2),
    )
    if (paidAmount > totalAmount) {
      await sql`ROLLBACK`
      return { success: false, message: "Paid amount cannot exceed transfer amount" }
    }

    const transferRows = (await sql`
      INSERT INTO stock_transfers (
        company_id, from_device_id, to_device_id, status, total_amount, payment_status, payment_method, paid_amount, payment_notes, transfer_date, notes, created_by, created_at, updated_at
      ) VALUES (
        ${actorCompanyId}, ${fromDeviceId}, ${toDeviceId}, 'completed', ${totalAmount}, ${paymentStatus}, ${paymentMethod || null}, ${paidAmount}, ${paymentNotes || null}, COALESCE(${transferDate}::timestamp, NOW()), ${notes}, ${userId}, NOW(), NOW()
      )
      RETURNING id
    `) as any[]
    const transferId = Number(transferRows[0].id)

    for (const item of items) {
      await moveStockBetweenDevices(item.product_id, item.quantity, fromDeviceId, toDeviceId, transferId, userId)
      await sql`
        INSERT INTO stock_transfer_items (transfer_id, product_id, quantity, unit_cost, total_cost, created_at)
        VALUES (${transferId}, ${item.product_id}, ${item.quantity}, ${item.unit_cost}, ${Number((item.quantity * item.unit_cost).toFixed(2))}, NOW())
      `
    }

    await sql`COMMIT`
    revalidatePath("/dashboard")
    return { success: true, message: "Transfer completed successfully", data: { id: transferId } }
  } catch (error: any) {
    await sql`ROLLBACK`
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
    await sql`BEGIN`
    await ensureTransferTables()
    await ensureProductDeviceStockTable()

    const actorCompanyId = await getCompanyIdForDevice(userId)
    const fromCompanyId = await getCompanyIdForDevice(fromDeviceId)
    const toCompanyId = await getCompanyIdForDevice(toDeviceId)
    if (!actorCompanyId || actorCompanyId !== fromCompanyId || actorCompanyId !== toCompanyId) {
      await sql`ROLLBACK`
      return { success: false, message: "Devices must belong to the same company" }
    }

    const totalAmount = Number(
      items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_cost || 0), 0).toFixed(2),
    )
    if (paidAmount > totalAmount) {
      await sql`ROLLBACK`
      return { success: false, message: "Paid amount cannot exceed transfer amount" }
    }

    const transferRows = (await sql`
      SELECT id, status, from_device_id, to_device_id
      FROM stock_transfers
      WHERE id = ${transferId} AND company_id = ${actorCompanyId}
      LIMIT 1
    `) as any[]
    if (transferRows.length === 0) {
      await sql`ROLLBACK`
      return { success: false, message: "Transfer not found" }
    }

    const transfer = transferRows[0]
    if (String(transfer.status).toLowerCase() === "cancelled") {
      await sql`ROLLBACK`
      return { success: false, message: "Cancelled transfers cannot be edited" }
    }

    const existingItemsRows = (await sql`
      SELECT product_id, quantity
      FROM stock_transfer_items
      WHERE transfer_id = ${transferId}
      ORDER BY id ASC
    `) as any[]
    const existingItems = existingItemsRows.map((row) => ({
      product_id: Number(row.product_id),
      quantity: Number(row.quantity),
    }))

    const originalFromDeviceId = Number(transfer.from_device_id)
    const originalToDeviceId = Number(transfer.to_device_id)
    const isSameRoute = originalFromDeviceId === fromDeviceId && originalToDeviceId === toDeviceId

    if (isSameRoute) {
      const oldQtyMap = new Map<number, number>()
      for (const item of existingItems) {
        oldQtyMap.set(item.product_id, (oldQtyMap.get(item.product_id) || 0) + item.quantity)
      }

      const newQtyMap = new Map<number, number>()
      for (const item of items) {
        newQtyMap.set(item.product_id, (newQtyMap.get(item.product_id) || 0) + item.quantity)
      }

      const allProductIds = new Set([...oldQtyMap.keys(), ...newQtyMap.keys()])
      for (const productId of allProductIds) {
        const oldQty = oldQtyMap.get(productId) || 0
        const newQty = newQtyMap.get(productId) || 0
        const delta = newQty - oldQty
        if (delta === 0) continue

        if (delta > 0) {
          await moveStockBetweenDevices(
            productId,
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
        INSERT INTO stock_transfer_items (transfer_id, product_id, quantity, unit_cost, total_cost, created_at)
        VALUES (${transferId}, ${item.product_id}, ${item.quantity}, ${item.unit_cost}, ${Number((item.quantity * item.unit_cost).toFixed(2))}, NOW())
      `
    }

    await sql`COMMIT`
    revalidatePath("/dashboard")
    return { success: true, message: "Transfer updated successfully" }
  } catch (error: any) {
    await sql`ROLLBACK`
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
    await sql`BEGIN`
    await ensureTransferTables()
    await ensureProductDeviceStockTable()

    const actorCompanyId = await getCompanyIdForDevice(userId)
    if (!actorCompanyId) {
      await sql`ROLLBACK`
      return { success: false, message: "Device/company not found" }
    }

    const transferRows = (await sql`
      SELECT id, status, from_device_id, to_device_id
      FROM stock_transfers
      WHERE id = ${transferId} AND company_id = ${actorCompanyId}
      LIMIT 1
    `) as any[]
    if (transferRows.length === 0) {
      await sql`ROLLBACK`
      return { success: false, message: "Transfer not found" }
    }

    const transfer = transferRows[0]
    if (String(transfer.status).toLowerCase() === "cancelled") {
      await sql`ROLLBACK`
      return { success: false, message: "Transfer is already cancelled" }
    }

    const itemsRows = (await sql`
      SELECT product_id, quantity
      FROM stock_transfer_items
      WHERE transfer_id = ${transferId}
      ORDER BY id ASC
    `) as any[]

    const items = itemsRows.map((row) => ({
      product_id: Number(row.product_id),
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

    await sql`
      UPDATE stock_transfers
      SET status = 'cancelled',
          cancelled_at = NOW(),
          cancelled_by = ${userId},
          updated_at = NOW()
      WHERE id = ${transferId}
    `

    await sql`COMMIT`
    revalidatePath("/dashboard")
    return { success: true, message: "Transfer cancelled successfully" }
  } catch (error: any) {
    await sql`ROLLBACK`
    console.error("Cancel warehouse transfer error:", error)
    return {
      success: false,
      message: error?.message || `Database error: ${getLastError()?.message || "Unknown error"}.`,
    }
  }
}
