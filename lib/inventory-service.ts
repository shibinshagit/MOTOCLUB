import { sql } from "@/lib/db"

/**
 * Gets the total available stock for a given product and device,
 * abstracting away whether it is a legacy or variant product.
 */
export async function getDeviceProductStock(productId: number, deviceId: number): Promise<number> {
  const rows = await sql`
    SELECT 
      (
        COALESCE((
          SELECT SUM(pbds.stock)
          FROM product_batch_device_stock pbds
          JOIN product_batches pb ON pb.id = pbds.batch_id
          JOIN product_variants pv ON pv.id = pb.product_variant_id
          WHERE pv.product_id = ${productId} AND pbds.device_id = ${deviceId}
        ), 0)
        +
        COALESCE((
          SELECT SUM(pds.stock)
          FROM product_device_stock pds
          WHERE pds.product_id = ${productId} AND pds.device_id = ${deviceId}
        ), 0)
      ) as stock
  `
  return Number(rows[0]?.stock || 0)
}

/**
 * Adjusts the stock of a product, automatically routing the update 
 * to either the legacy table or the variant batch tables.
 */
export async function adjustDeviceProductStock(
  productId: number,
  variantId: number | null,
  batchId: number | null,
  deviceId: number,
  quantityChange: number,
  query: any = sql
) {
  const products = await query`SELECT id, has_variants FROM products WHERE id = ${productId}`
  if (!products.length) throw new Error("Product not found")

  let effectiveBatchId = batchId

  if (!effectiveBatchId) {
    let batchRows
    if (variantId) {
      batchRows = await query`
        SELECT id FROM product_batches 
        WHERE product_id = ${productId} AND product_variant_id = ${variantId}
        ORDER BY created_at ASC LIMIT 1
      `
    } else {
      batchRows = await query`
        SELECT id FROM product_batches 
        WHERE product_id = ${productId}
        ORDER BY created_at ASC LIMIT 1
      `
    }
    
    if (batchRows.length > 0) {
      effectiveBatchId = batchRows[0].id
    }
  }

  if (effectiveBatchId) {
    const batchStock = await query`
      SELECT id, stock FROM product_batch_device_stock
      WHERE batch_id = ${effectiveBatchId} AND device_id = ${deviceId}
      LIMIT 1
    `

    if (batchStock.length > 0) {
      await query`
        UPDATE product_batch_device_stock
        SET stock = stock + ${quantityChange}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${batchStock[0].id}
      `
    } else {
      await query`
        INSERT INTO product_batch_device_stock (batch_id, device_id, stock)
        VALUES (${effectiveBatchId}, ${deviceId}, ${quantityChange})
      `
    }
  } else {
    // Legacy stock fallback
    const legacyStock = await query`
      SELECT id, stock FROM product_device_stock
      WHERE product_id = ${productId} AND device_id = ${deviceId}
      LIMIT 1
    `

    if (legacyStock.length > 0) {
      await query`
        UPDATE product_device_stock
        SET stock = stock + ${quantityChange}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${legacyStock[0].id}
      `
    } else {
      await query`
        INSERT INTO product_device_stock (product_id, device_id, stock)
        VALUES (${productId}, ${deviceId}, ${quantityChange})
      `
    }
  }
}

