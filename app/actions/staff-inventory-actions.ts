"use server"

import { neon } from "@neondatabase/serverless"
import { getStaffSession } from "@/lib/staff-session"

function getLastError() {
  return { message: "Unknown error" }
}

const sql = neon(process.env.DATABASE_URL!)

// Helper to attach ONLY staff-allowed variants and batches to products
async function attachStaffVariantsAndBatches(products: any[], deviceId: number) {
  if (!products || products.length === 0) return products
  
  const productIds = products.map((p) => p.id)
  
  // Get variants for all products
  const variants = await sql`
    SELECT id, product_id, name, sku, barcode, msp, wholesale_price as selling_price, image_url 
    FROM product_variants
    WHERE product_id = ANY(${productIds})
    ORDER BY id ASC
  `
  
  // Get batches for all products - NO COST PRICE OR PURCHASE PRICE
  const batches = await sql`
    SELECT 
      pb.id, pb.product_variant_id, pb.batch_no as batch_number, 
      pb.manufacture_date as mfg_date, pb.expiry_date, pb.selling_price,
      pbds.stock as device_stock, pbds.device_id, pv.name as variant_name, pv.product_id
    FROM product_batches pb
    LEFT JOIN product_batch_device_stock pbds ON pb.id = pbds.batch_id
    LEFT JOIN product_variants pv ON pb.product_variant_id = pv.id
    WHERE pv.product_id = ANY(${productIds})
    AND pbds.device_id = ${deviceId}
    ORDER BY pb.id ASC
  `

  // Get variant stocks for the device
  const variantStocks = await sql`
    SELECT pds.* FROM product_device_stock pds
    WHERE pds.product_id = ANY(${productIds}) 
    AND pds.product_variant_id IS NOT NULL
    AND pds.device_id = ${deviceId}
  `
  
  const variantsByProductId = new Map<number, any[]>()
  const batchesByProductId = new Map<number, any[]>()
  
  // Group variants
  for (const v of variants) {
    if (!variantsByProductId.has(v.product_id)) variantsByProductId.set(v.product_id, [])
    
    // Add device stock for this variant
    const stockRecord = variantStocks.find(
      s => s.product_id === v.product_id && s.product_variant_id === v.id
    )
    
    variantsByProductId.get(v.product_id)!.push({
      ...v,
      device_stock: stockRecord ? Number(stockRecord.stock) : 0,
    })
  }
  
  // Group batches
  for (const b of batches) {
    if (!batchesByProductId.has(b.product_id)) batchesByProductId.set(b.product_id, [])
    
    const productBatches = batchesByProductId.get(b.product_id)!
    let existingBatch = productBatches.find((pb: any) => pb.id === b.id)
    
    if (!existingBatch) {
      existingBatch = { ...b, stocks: [] }
      productBatches.push(existingBatch)
    }
    
    if (b.device_stock !== null) {
      existingBatch.stocks.push({
        device_id: b.device_id,
        stock: b.device_stock
      })
    }
  }
  
  // Attach to products
  return products.map(p => ({
    ...p,
    variants: variantsByProductId.get(p.id) || [],
    batches: batchesByProductId.get(p.id) || []
  }))
}

export async function getStaffInventory(searchTerm?: string) {
  try {
    const session = await getStaffSession()
    if (!session || !session.deviceId || !session.companyId) {
      return { success: false, message: "Unauthorized or device not assigned" }
    }
    const deviceId = session.deviceId
    const companyId = session.companyId

    let query = sql`
      SELECT 
        p.id, p.name, p.category, p.description, p.wholesale_price, p.msp, p.barcode, 
        p.image_url, p.has_variants, p.is_batch_managed,
        COALESCE(SUM(pds.stock), 0) as total_stock,
        MAX(d.name) as branch_name
      FROM products p
      LEFT JOIN product_device_stock pds ON p.id = pds.product_id AND pds.device_id = ${deviceId} AND pds.product_variant_id IS NULL
      LEFT JOIN devices d ON pds.device_id = d.id
      WHERE p.created_by IN (SELECT id FROM devices WHERE company_id = ${companyId})
    `

    if (searchTerm) {
      const term = `%${searchTerm}%`
      query = sql`
        SELECT 
          p.id, p.name, p.category, p.description, p.wholesale_price, p.msp, p.barcode, 
          p.image_url, p.has_variants, p.is_batch_managed,
          COALESCE(SUM(pds.stock), 0) as total_stock,
          MAX(d.name) as branch_name
        FROM products p
        LEFT JOIN product_device_stock pds ON p.id = pds.product_id AND pds.device_id = ${deviceId} AND pds.product_variant_id IS NULL
        LEFT JOIN devices d ON pds.device_id = d.id
        WHERE p.created_by IN (SELECT id FROM devices WHERE company_id = ${companyId})
        AND (
          p.name ILIKE ${term} OR 
          p.barcode ILIKE ${term} OR 
          p.category ILIKE ${term}
        )
      `
    }

    // Must append GROUP BY and ORDER BY depending on whether we searched or not
    // We can just construct the full query again to be safe with tagged templates
    let finalQuery;
    if (searchTerm) {
      const term = `%${searchTerm}%`
      finalQuery = await sql`
        SELECT 
          p.id, p.name, p.category, p.description, p.wholesale_price as selling_price, p.msp, p.barcode, 
          p.image_url, p.has_variants, p.is_batch_managed,
          COALESCE(SUM(pds.stock), 0) as total_stock,
          MAX(d.name) as branch_name
        FROM products p
        LEFT JOIN product_device_stock pds ON p.id = pds.product_id AND pds.device_id = ${deviceId} AND pds.product_variant_id IS NULL
        LEFT JOIN devices d ON pds.device_id = d.id
        WHERE p.created_by IN (SELECT id FROM devices WHERE company_id = ${companyId})
        AND (
          p.name ILIKE ${term} OR 
          p.barcode ILIKE ${term} OR 
          p.category ILIKE ${term}
        )
        GROUP BY p.id
        ORDER BY p.name ASC
      `
    } else {
      finalQuery = await sql`
        SELECT 
          p.id, p.name, p.category, p.description, p.wholesale_price as selling_price, p.msp, p.barcode, 
          p.image_url, p.has_variants, p.is_batch_managed,
          COALESCE(SUM(pds.stock), 0) as total_stock,
          MAX(d.name) as branch_name
        FROM products p
        LEFT JOIN product_device_stock pds ON p.id = pds.product_id AND pds.device_id = ${deviceId} AND pds.product_variant_id IS NULL
        LEFT JOIN devices d ON pds.device_id = d.id
        WHERE p.created_by IN (
          SELECT id FROM devices WHERE company_id = ${companyId}
        )
        GROUP BY p.id
        ORDER BY p.name ASC
      `
    }

    const productsWithStock = finalQuery.map(p => ({
      ...p,
      stock: Number(p.total_stock)
    }))

    const finalProducts = await attachStaffVariantsAndBatches(productsWithStock, deviceId)

    return { success: true, data: finalProducts }
  } catch (error) {
    console.error("Get staff inventory error:", error)
    return { success: false, message: "Failed to fetch inventory" }
  }
}
