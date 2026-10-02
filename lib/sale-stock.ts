import "server-only"
import { sql } from "@/lib/db"
import { updateProductStock } from "@/app/actions/sale-actions"

/**
 * Moves a sale's stock between "deducted" and "not deducted" (a job card getting paid or shipped,
 * or a shipped order set back to pending). It works from the sale_items of the sale, using the exact
 * batch allocations when they exist and the sale line itself otherwise, so sales created without
 * allocation rows (job cards, non-batch products) are handled too.
 *
 * Stock itself still goes through the existing updateProductStock, and history uses the existing
 * product_stock_history table. Pass a transaction handle as `query` to make it atomic with the
 * caller's other writes. This lives outside the "use server" files so it is not a public endpoint.
 */
export async function applyStockTransition(
  saleId: number,
  deviceId: number,
  shouldDeduct: boolean,
  historyType: string,
  note: string,
  query: any = sql,
) {
  const items = await query`
    SELECT id, product_id, product_variant_id, batch_id, quantity
    FROM sale_items
    WHERE sale_id = ${saleId}
  `
  const allocs = await query`
    SELECT sba.sale_item_id, sba.batch_id, sba.quantity
    FROM sale_batch_allocations sba
    JOIN sale_items si ON si.id = sba.sale_item_id
    WHERE si.sale_id = ${saleId}
  `
  const allocByItem = new Map<number, { batch_id: number | null; quantity: number }[]>()
  for (const a of allocs as any[]) {
    const list = allocByItem.get(Number(a.sale_item_id)) || []
    list.push({ batch_id: a.batch_id ? Number(a.batch_id) : null, quantity: Number(a.quantity) })
    allocByItem.set(Number(a.sale_item_id), list)
  }

  for (const item of items as any[]) {
    if (!item.product_id) continue

    // Services have no stock
    const isProduct = await query`SELECT 1 FROM products WHERE id = ${item.product_id}`
    if (isProduct.length === 0) continue

    const lines = allocByItem.get(Number(item.id)) || [
      { batch_id: item.batch_id ? Number(item.batch_id) : null, quantity: Number(item.quantity) },
    ]
    for (const line of lines) {
      if (!line.quantity) continue
      const variantId = item.product_variant_id ? Number(item.product_variant_id) : null

      const result = await updateProductStock(
        Number(item.product_id),
        variantId,
        line.batch_id,
        line.quantity,
        shouldDeduct ? "subtract" : "add",
        deviceId,
        query,
      )
      if (!result?.success) {
        throw new Error(result?.message || `Stock update failed for product ${item.product_id}`)
      }

      await query`
        INSERT INTO product_stock_history (
          product_id, product_variant_id, batch_id, quantity, type, reference_id, reference_type, notes, created_by, device_id
        ) VALUES (
          ${item.product_id}, ${variantId}, ${line.batch_id}, ${shouldDeduct ? -line.quantity : line.quantity},
          ${historyType}, ${saleId}, 'sale', ${note}, ${deviceId}, ${deviceId}
        )
      `
    }
  }
}

export type SaleStockLine = {
  productId: number
  variantId: number | null
  batchId: number | null
  quantity: number
}

/** The stock-bearing lines of a sale, merged by product + variant + batch (exact allocations when present). */
export async function getSaleStockLines(
  saleId: number,
  query: any = sql,
  onlyWithoutAllocations = false,
): Promise<Map<string, SaleStockLine>> {
  const items = await query`
    SELECT id, product_id, product_variant_id, batch_id, quantity FROM sale_items WHERE sale_id = ${saleId}
  `
  const allocs = await query`
    SELECT sba.sale_item_id, sba.batch_id, sba.quantity
    FROM sale_batch_allocations sba JOIN sale_items si ON si.id = sba.sale_item_id
    WHERE si.sale_id = ${saleId}
  `
  const byItem = new Map<number, { batchId: number | null; quantity: number }[]>()
  for (const a of allocs as any[]) {
    const list = byItem.get(Number(a.sale_item_id)) || []
    list.push({ batchId: a.batch_id ? Number(a.batch_id) : null, quantity: Number(a.quantity) })
    byItem.set(Number(a.sale_item_id), list)
  }

  const lines = new Map<string, SaleStockLine>()
  for (const item of items as any[]) {
    if (!item.product_id) continue
    // Lines that carry allocation rows are handled by the allocation-based code path of the caller
    if (onlyWithoutAllocations && byItem.has(Number(item.id))) continue
    const isProduct = await query`SELECT 1 FROM products WHERE id = ${item.product_id}`
    if (isProduct.length === 0) continue
    const parts = byItem.get(Number(item.id)) || [
      { batchId: item.batch_id ? Number(item.batch_id) : null, quantity: Number(item.quantity) },
    ]
    for (const part of parts) {
      const variantId = item.product_variant_id ? Number(item.product_variant_id) : null
      const key = `${item.product_id}|${variantId ?? ""}|${part.batchId ?? ""}`
      const existing = lines.get(key)
      if (existing) existing.quantity += part.quantity
      else lines.set(key, { productId: Number(item.product_id), variantId, batchId: part.batchId, quantity: part.quantity })
    }
  }
  return lines
}

/**
 * Applies only the difference between two snapshots of a sale's lines: extra units are deducted,
 * removed units are put back, unchanged lines are not touched (so an edit 2 -> 5 moves 3, 5 -> 3 moves 2,
 * 3 -> 3 moves nothing). Same stock function and history table as everywhere else.
 */
export async function applyStockDelta(
  saleId: number,
  deviceId: number,
  before: Map<string, SaleStockLine>,
  after: Map<string, SaleStockLine>,
  note: string,
  query: any = sql,
) {
  const keys = new Set([...before.keys(), ...after.keys()])
  for (const key of keys) {
    const was = before.get(key)
    const now = after.get(key)
    const delta = (now?.quantity ?? 0) - (was?.quantity ?? 0)
    if (delta === 0) continue
    const line = (now ?? was)!

    const result = await updateProductStock(
      line.productId,
      line.variantId,
      line.batchId,
      Math.abs(delta),
      delta > 0 ? "subtract" : "add",
      deviceId,
      query,
    )
    if (!result?.success) throw new Error(result?.message || `Stock update failed for product ${line.productId}`)

    await query`
      INSERT INTO product_stock_history (
        product_id, product_variant_id, batch_id, quantity, type, reference_id, reference_type, notes, created_by, device_id
      ) VALUES (
        ${line.productId}, ${line.variantId}, ${line.batchId}, ${-delta},
        ${delta > 0 ? "sale_edited_deducted" : "sale_edited_restored"}, ${saleId}, 'sale', ${note}, ${deviceId}, ${deviceId}
      )
    `
  }
}
