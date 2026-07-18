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
  
  const variantsByProductId = new Map<number, any[]>()
  const batchesByProductId = new Map<number, any[]>()
  
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
        stock: Number(b.device_stock)
      })
    }
  }
  
  // Group variants
  for (const v of variants) {
    if (!variantsByProductId.has(v.product_id)) variantsByProductId.set(v.product_id, [])
    
    // Calculate device stock for this variant by summing its batches' device_stock
    const variantBatches = batches.filter(b => b.product_variant_id === v.id)
    const device_stock = variantBatches.reduce((sum, b) => sum + (b.device_stock ? Number(b.device_stock) : 0), 0)
    
    variantsByProductId.get(v.product_id)!.push({
      ...v,
      device_stock
    })
  }
  
  // Attach to products
  return products.map(p => {
    const pVariants = variantsByProductId.get(p.id) || []
    const pBatches = batchesByProductId.get(p.id) || []
    const total_stock = pVariants.reduce((sum, v) => sum + v.device_stock, 0)

    return {
      ...p,
      stock: total_stock,
      variants: pVariants,
      batches: pBatches
    }
  })
}

export async function getStaffInventory(searchTerm?: string) {
  try {
    const session = await getStaffSession()
    if (!session || !session.deviceId || !session.companyId) {
      return { success: false, message: "Unauthorized or device not assigned" }
    }
    const deviceId = session.deviceId
    const companyId = session.companyId

    let finalQuery;
    if (searchTerm) {
      const term = `%${searchTerm}%`
      finalQuery = await sql`
        SELECT 
          p.id, p.name, p.category, p.description, 
          p.image_url, p.has_variants, p.is_batch_managed,
          (SELECT name FROM devices WHERE id = ${deviceId}) as branch_name
        FROM products p
        WHERE p.created_by IN (SELECT id FROM devices WHERE company_id = ${companyId})
        AND (
          p.name ILIKE ${term} OR 
          p.category ILIKE ${term} OR
          EXISTS (
            SELECT 1 FROM product_variants pv 
            WHERE pv.product_id = p.id 
            AND (pv.barcode ILIKE ${term} OR pv.sku ILIKE ${term} OR pv.name ILIKE ${term})
          )
        )
        ORDER BY p.name ASC
      `
    } else {
      finalQuery = await sql`
        SELECT 
          p.id, p.name, p.category, p.description, 
          p.image_url, p.has_variants, p.is_batch_managed,
          (SELECT name FROM devices WHERE id = ${deviceId}) as branch_name
        FROM products p
        WHERE p.created_by IN (SELECT id FROM devices WHERE company_id = ${companyId})
        ORDER BY p.name ASC
      `
    }

    const finalProducts = await attachStaffVariantsAndBatches(finalQuery, deviceId)

    return { success: true, data: finalProducts }
  } catch (error) {
    console.error("Get staff inventory error:", error)
    return { success: false, message: "Failed to fetch inventory" }
  }
}
