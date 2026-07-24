import { sql } from "@/lib/db"

/**
 * Gets the total available stock for a given product and device,
 * abstracting away whether it is a legacy or variant product.
 */
export async function getDeviceProductStock(productId: number, deviceId: number): Promise<number> {
  const products = await sql`SELECT has_variants FROM products WHERE id = ${productId}`
  if (!products.length) return 0
  
  if (products[0].has_variants) {
    const rows = await sql`
      SELECT COALESCE(SUM(pbds.stock), 0) as stock
      FROM product_batch_device_stock pbds
      JOIN product_batches pb ON pb.id = pbds.batch_id
      JOIN product_variants pv ON pv.id = pb.product_variant_id
      WHERE pv.product_id = ${productId} AND pbds.device_id = ${deviceId}
    `
    return Number(rows[0]?.stock || 0)
  } else {
    const rows = await sql`
      SELECT COALESCE(SUM(stock), 0) as stock
      FROM product_device_stock
      WHERE product_id = ${productId} AND device_id = ${deviceId}
    `
    return Number(rows[0]?.stock || 0)
  }
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
  const products = await query`SELECT has_variants FROM products WHERE id = ${productId}`
  if (!products.length) throw new Error("Product not found")

  if (products[0].has_variants) {
    if (!batchId) {
      throw new Error("Batch ID is required for variant product stock adjustment")
    }
    
    // Adjust batch stock
    const batchStock = await query`
      SELECT id, stock FROM product_batch_device_stock
      WHERE batch_id = ${batchId} AND device_id = ${deviceId}
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
        VALUES (${batchId}, ${deviceId}, ${quantityChange})
      `
    }
  } else {
    // Adjust legacy stock
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
