import "server-only"

/**
 * The only mutable inventory balance is product_batch_device_stock.stock.
 * Product, variant, and product_batches.remaining_quantity are projections
 * of that ledger. Callers must invoke this inside their database transaction.
 */
export async function applyBatchLedgerMovement(
  query: any,
  input: {
    batchId: number
    deviceId: number
    quantity: number
    productId: number
    variantId: number | null
    type: string
    referenceId?: number | null
    referenceType?: string | null
    notes?: string
    createdBy: number
  },
) {
  if (!Number.isFinite(input.quantity) || input.quantity === 0) {
    throw new Error("Inventory movement quantity must be non-zero")
  }

  const batches = await query`
    SELECT id, product_id, product_variant_id
    FROM product_batches
    WHERE id = ${input.batchId}
    FOR UPDATE
  `
  const batch = batches[0]
  if (!batch || Number(batch.product_id) !== input.productId ||
      (input.variantId != null && Number(batch.product_variant_id) !== Number(input.variantId))) {
    throw new Error("Batch does not belong to the selected product variant")
  }

  if (input.quantity < 0) {
    const rows = await query`
      UPDATE product_batch_device_stock
      SET stock = stock + ${input.quantity}, updated_at = NOW()
      WHERE batch_id = ${input.batchId}
        AND device_id = ${input.deviceId}
        AND stock + ${input.quantity} >= 0
      RETURNING stock
    `
    if (!rows.length) throw new Error("Insufficient stock in the selected batch")
  } else {
    await query`
      INSERT INTO product_batch_device_stock (batch_id, device_id, stock, updated_at)
      VALUES (${input.batchId}, ${input.deviceId}, ${input.quantity}, NOW())
      ON CONFLICT (batch_id, device_id)
      DO UPDATE SET stock = product_batch_device_stock.stock + EXCLUDED.stock, updated_at = NOW()
    `
  }

  await query`
    INSERT INTO product_stock_history (
      product_id, product_variant_id, batch_id, quantity, type,
      reference_id, reference_type, notes, created_by, device_id
    ) VALUES (
      ${input.productId}, ${input.variantId}, ${input.batchId}, ${input.quantity}, ${input.type},
      ${input.referenceId || null}, ${input.referenceType || null}, ${input.notes || ""},
      ${input.createdBy}, ${input.deviceId}
    )
  `
}
