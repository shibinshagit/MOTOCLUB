import { sql } from "@/lib/db"

/**
 * Gets the total available stock for a given product and device,
 * abstracting away whether it is a legacy or variant product.
 */
export async function getDeviceProductStock(productId: number, deviceId: number): Promise<number> {
  const rows = await sql`
    SELECT 
      CASE 
        WHEN EXISTS (
          SELECT 1 FROM product_batch_device_stock pbds
          JOIN product_batches pb ON pb.id = pbds.batch_id
          JOIN product_variants pv ON pv.id = pb.product_variant_id
          WHERE pv.product_id = ${productId} AND pbds.device_id = ${deviceId}
        ) THEN COALESCE((
          SELECT SUM(pbds.stock)
          FROM product_batch_device_stock pbds
          JOIN product_batches pb ON pb.id = pbds.batch_id
          JOIN product_variants pv ON pv.id = pb.product_variant_id
          WHERE pv.product_id = ${productId} AND pbds.device_id = ${deviceId}
        ), 0)
        ELSE COALESCE((
          SELECT SUM(pds.stock)
          FROM product_device_stock pds
          WHERE pds.product_id = ${productId} AND pds.device_id = ${deviceId}
        ), 0)
      END as stock
  `
  return Number(rows[0]?.stock || 0)
}

/**
 * Gets the stock for a specific variant on a device.
 */
export async function getDeviceVariantStock(variantId: number, deviceId: number): Promise<number> {
  const rows = await sql`
    SELECT COALESCE(SUM(pbds.stock), 0) as stock
    FROM product_batch_device_stock pbds
    JOIN product_batches pb ON pb.id = pbds.batch_id
    WHERE pb.product_variant_id = ${variantId} AND pbds.device_id = ${deviceId}
  `
  return Number(rows[0]?.stock || 0)
}

/**
 * Adjusts the stock of a product, automatically routing the update 
 * to either the legacy table or the variant batch tables.
 * Stock values can be negative to support overselling/negative inventory.
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
    await query`
      INSERT INTO product_batch_device_stock (batch_id, device_id, stock, updated_at)
      VALUES (${effectiveBatchId}, ${deviceId}, ${quantityChange}, CURRENT_TIMESTAMP)
      ON CONFLICT (batch_id, device_id)
      DO UPDATE SET stock = product_batch_device_stock.stock + EXCLUDED.stock, updated_at = CURRENT_TIMESTAMP
    `
  } else {
    // Legacy stock fallback
    await query`
      INSERT INTO product_device_stock (product_id, device_id, stock, updated_at)
      VALUES (${productId}, ${deviceId}, ${quantityChange}, CURRENT_TIMESTAMP)
      ON CONFLICT (product_id, device_id)
      DO UPDATE SET stock = product_device_stock.stock + EXCLUDED.stock, updated_at = CURRENT_TIMESTAMP
    `
  }
}
