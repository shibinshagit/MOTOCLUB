"use server"

import { addDays, parseISO, format } from "date-fns"
import { sql, getLastError, resetConnectionState, executeWithRetry } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { recordSaleTransaction, recordSaleAdjustment, deleteSaleTransaction, syncSaleShippingTransactions } from "./simplified-accounting"
import { filterSalesForStaff } from "@/lib/staff-restrictions-server"
import { normalizeSaleShippingInput } from "@/lib/sale-shipping"

function getShippingAmounts(shipping: ReturnType<typeof normalizeSaleShippingInput>) {
  if (shipping.fulfillment_type !== "ship") {
    return { courierPaidExtra: 0, expenseCourier: 0, expensePacking: 0 }
  }

  return {
    courierPaidExtra: Number(shipping.courier_paid_extra) || 0,
    expenseCourier: Number(shipping.expense_courier) || 0,
    expensePacking: Number(shipping.expense_packing) || 0,
  }
}

async function resolveCourierServiceName(
  deviceId: number,
  courierServiceId?: number | null,
  fallbackName?: string | null,
) {
  if (fallbackName?.trim()) return fallbackName.trim()
  if (!courierServiceId || !deviceId) return null

  const rows = await sql`
    SELECT name
    FROM master_data
    WHERE id = ${courierServiceId}
      AND device_id = ${deviceId}
    LIMIT 1
  `

  return rows[0]?.name || null
}

async function resolvePackagingTypeName(
  deviceId: number,
  packagingTypeId?: number | null,
  fallbackName?: string | null,
) {
  if (fallbackName?.trim()) return fallbackName.trim()
  if (!packagingTypeId || !deviceId) return null

  const rows = await sql`
    SELECT name
    FROM master_data
    WHERE id = ${packagingTypeId}
      AND device_id = ${deviceId}
    LIMIT 1
  `

  return rows[0]?.name || null
}

async function buildShippingFieldsForSave(saleData: any, deviceId: number, existing?: any) {
  const normalized = normalizeSaleShippingInput(saleData)

  if (normalized.fulfillment_type === "ship") {
    normalized.courier_service_name = await resolveCourierServiceName(
      deviceId,
      normalized.courier_service_id,
      normalized.courier_service_name,
    )
    normalized.packaging_type_name = await resolvePackagingTypeName(
      deviceId,
      normalized.packaging_type_id,
      normalized.packaging_type_name,
    )

    if (existing?.shipped_at) {
      normalized.shipped_at = existing.shipped_at
    }
    if (existing?.delivered_at) {
      normalized.delivered_at = existing.delivered_at
    }

    if (
      ["Shipped", "In transit", "Delivered"].includes(String(normalized.delivery_status)) &&
      !normalized.shipped_at
    ) {
      normalized.shipped_at = new Date().toISOString()
    }
    if (normalized.delivery_status === "Delivered" && !normalized.delivered_at) {
      normalized.delivered_at = new Date().toISOString()
    }
  }

  return normalized
}

function shippingFieldsChanged(original: any, shipping: ReturnType<typeof normalizeSaleShippingInput>) {
  return (
    (original.fulfillment_type || "pickup") !== shipping.fulfillment_type ||
    (original.delivery_status || null) !== shipping.delivery_status ||
    (original.courier_service_id || null) !== shipping.courier_service_id ||
    (original.courier_service_name || null) !== shipping.courier_service_name ||
    (original.packaging_type_id || null) !== shipping.packaging_type_id ||
    (original.packaging_type_name || null) !== shipping.packaging_type_name ||
    (original.tracking_id || null) !== shipping.tracking_id ||
    (original.shipping_address || null) !== shipping.shipping_address ||
    Number(original.weight_kg || 0) !== Number(shipping.weight_kg || 0) ||
    Number(original.length_cm || 0) !== Number(shipping.length_cm || 0) ||
    Number(original.width_cm || 0) !== Number(shipping.width_cm || 0) ||
    Number(original.height_cm || 0) !== Number(shipping.height_cm || 0) ||
    Number(original.courier_paid_extra || 0) !== Number(shipping.courier_paid_extra || 0) ||
    Number(original.expense_courier || 0) !== Number(shipping.expense_courier || 0) ||
    Number(original.expense_packing || 0) !== Number(shipping.expense_packing || 0) ||
    (original.shipping_notes || null) !== shipping.shipping_notes
  )
}

// Helper function to safely update product stock with proper validation
async function updateProductStock(
  productId: number,
  variantId: number | null,
  batchId: number | null,
  quantityChange: number,
  operation: "subtract" | "add",
  deviceId: number,
) {
  try {
    // First, verify this is actually a product (not a service)
    const productCheck = await sql`
      SELECT id, name FROM products WHERE id = ${productId}
    `

    if (productCheck.length === 0) {
      console.log(`Skipping stock update for ID ${productId} - not found in products table (likely a service)`)
      return { success: true, message: "Item is not a product, stock update skipped" }
    }

    const product = productCheck[0]

    if (!product.has_variants) {
      const devStock = await sql`SELECT id, stock FROM product_device_stock WHERE product_id = ${productId} AND device_id = ${deviceId} LIMIT 1`
      const currentLegacyStock = devStock.length > 0 ? Number(devStock[0].stock || 0) : 0
      const nextLegacyStock = operation === "subtract" ? currentLegacyStock - quantityChange : currentLegacyStock + quantityChange
      
      if (devStock.length > 0) {
        await sql`UPDATE product_device_stock SET stock = ${nextLegacyStock}, updated_at = NOW() WHERE id = ${devStock[0].id}`
      } else {
        await sql`INSERT INTO product_device_stock (product_id, device_id, stock) VALUES (${productId}, ${deviceId}, ${nextLegacyStock})`
      }
      return { success: true, message: "Legacy stock updated" }
    }

    let resolvedVariantId = variantId
    if (!resolvedVariantId) {
      const defaultVariant = await sql`
        SELECT id FROM product_variants WHERE product_id = ${productId} ORDER BY id ASC LIMIT 1
      `
      if (defaultVariant.length > 0) {
        resolvedVariantId = defaultVariant[0].id
      } else {
        return { success: false, message: "No product variants configured" }
      }
    }

    if (batchId) {
      // 1. Update batch stock
      const batchStockRows = await sql`
        SELECT stock FROM product_batch_device_stock
        WHERE batch_id = ${batchId} AND device_id = ${deviceId}
        LIMIT 1
      `
      const currentBatchStock = batchStockRows.length > 0 ? Number(batchStockRows[0].stock || 0) : 0
      let nextBatchStock = operation === "subtract" ? currentBatchStock - quantityChange : currentBatchStock + quantityChange
      nextBatchStock = Math.max(0, nextBatchStock)

      await sql`
        INSERT INTO product_batch_device_stock (batch_id, device_id, stock, updated_at)
        VALUES (${batchId}, ${deviceId}, ${nextBatchStock}, NOW())
        ON CONFLICT (batch_id, device_id)
        DO UPDATE SET stock = ${nextBatchStock}, updated_at = NOW()
      `

      // remaining_quantity is a derived database value synchronized by the
      // product_batch_device_stock trigger. Never mutate it here.

      // 2. Aggregate variant stock from batches
      const totalStockRows = await sql`
        SELECT COALESCE(SUM(stock), 0) as total_stock
        FROM product_batch_device_stock pbds
        JOIN product_batches pb ON pbds.batch_id = pb.id
        WHERE pb.product_variant_id = ${resolvedVariantId} AND pbds.device_id = ${deviceId}
      `
      const nextVariantStock = Number(totalStockRows[0]?.total_stock || 0)
      
      // 3. Update variant stock in product_device_stock
      /* Legacy product_device_stock insert removed */
    } else if (operation === "subtract") {
      let remaining = quantityChange
      const availableBatches = await sql`
        SELECT pbds.batch_id, pbds.stock
        FROM product_batch_device_stock pbds
        JOIN product_batches pb ON pb.id = pbds.batch_id
        WHERE pb.product_variant_id = ${resolvedVariantId} 
          AND pbds.device_id = ${deviceId}
          AND pbds.stock > 0
        ORDER BY pb.created_at ASC
      `
      for (const batch of availableBatches) {
        if (remaining <= 0) break
        const take = Math.min(remaining, Number(batch.stock))
        const nextStock = Number(batch.stock) - take
        remaining -= take

        await sql`
          UPDATE product_batch_device_stock
          SET stock = ${nextStock}, updated_at = NOW()
          WHERE batch_id = ${batch.batch_id} AND device_id = ${deviceId}
        `
      }
    } else if (operation === "add") {
      // For returns without a specific batch, create an adjustment batch
      const adjBatchNo = `RET-${productId}-${Date.now().toString().slice(-6)}`
      const adjBatch = await sql`
        INSERT INTO product_batches (
          product_id, product_variant_id, batch_no, cost_price, selling_price, quantity_purchased, remaining_quantity, status
        ) VALUES (
          ${productId}, ${resolvedVariantId}, ${adjBatchNo}, 0, 0, ${quantityChange}, ${quantityChange}, 'active'
        ) RETURNING id
      `
      const adjBatchId = adjBatch[0].id
      await sql`
        INSERT INTO product_batch_device_stock (batch_id, device_id, stock, updated_at)
        VALUES (${adjBatchId}, ${deviceId}, ${quantityChange}, NOW())
      `
    }

    // Log stock history
    try {
      await sql`
        INSERT INTO product_stock_history (
          product_id, product_product_variant_id, batch_id, quantity, type, reference_type, notes, created_by, device_id
        ) VALUES (
          ${productId}, ${resolvedVariantId}, ${batchId || null}, ${quantityChange}, ${operation === "subtract" ? "adjustment" : "adjustment"}, 'sale', 'POS Checkout', ${deviceId}, ${deviceId}
        )
      `
    } catch (historyErr) {
      console.error("Failed to write sale stock history:", historyErr)
    }

    return { success: true, message: "Stock updated successfully" }
  } catch (error) {
    console.error(`Error updating stock for product ${productId}:`, error)
    return { success: false, message: error instanceof Error ? error.message : String(error) }
  }
}

// Add this helper function at the top of the file, after the existing helper functions
async function createStockHistoryEntry(
  productId: number,
  variantId: number | null,
  batchId: number | null,
  changeType: string,
  quantity: number,
  referenceId: number,
  referenceType: string,
  deviceId: number,
  notes?: string,
) {
  try {
    // Check if it's actually a product (not a service)
    const productCheck = await sql`
      SELECT id, name FROM products WHERE id = ${productId}
    `

    if (productCheck.length === 0) {
      console.log(`Skipping stock history for ID ${productId} - not found in products table (likely a service)`)
      return { success: true, message: "Item is not a product, stock history skipped" }
    }

    let resolvedVariantId = variantId
    if (!resolvedVariantId) {
      const defaultVariant = await sql`
        SELECT id FROM product_variants WHERE product_id = ${productId} ORDER BY id ASC LIMIT 1
      `
      if (defaultVariant.length > 0) {
        resolvedVariantId = defaultVariant[0].id
      }
    }

    await sql`
      INSERT INTO product_stock_history (
        product_id, product_product_variant_id, batch_id, quantity, type, reference_id, reference_type, notes, created_by, device_id
      ) VALUES (
        ${productId},
        ${resolvedVariantId || null},
        ${batchId || null},
        ${quantity},
        ${changeType},
        ${referenceId},
        ${referenceType},
        ${notes || ""},
        ${deviceId},
        ${deviceId}
      )
    `

    console.log(
      `Stock history created for product ${productId} (variant: ${resolvedVariantId}): ${changeType} ${quantity} units (${referenceType} #${referenceId}, device ${deviceId})`,
    )
    return { success: true, message: "Stock history created successfully" }
  } catch (error) {
    console.error(`Error creating stock history for product ${productId}:`, error)
    return { success: false, message: error instanceof Error ? error.message : String(error) }
  }
}

// Calculate COGS for sale items using actual sale item costs (including services)
async function calculateCOGS(items: any[], saleId?: number) {
  let totalCogs = 0

  if (saleId) {
    try {
      // Updated query to include service costs and use actual costs from sale_items with variant fallback
      const saleItems = await sql`
        SELECT 
          si.quantity, 
          COALESCE(si.cost, pv.wholesale_price, p.wholesale_price, 0) as cost_price,
          CASE 
            WHEN s.id IS NOT NULL THEN 'service'
            WHEN p.id IS NOT NULL THEN 'product'
            ELSE 'unknown'
          END as item_type
        FROM sale_items si
        LEFT JOIN products p ON si.product_id = p.id AND NOT EXISTS (SELECT 1 FROM services s WHERE s.id = si.product_id)
        LEFT JOIN product_variants pv ON si.product_variant_id = pv.id
        LEFT JOIN services s ON si.product_id = s.id
        WHERE si.sale_id = ${saleId}
      `

      totalCogs = saleItems.reduce((sum: number, item: any) => {
        return sum + Number(item.quantity) * Number(item.cost_price)
      }, 0)
    } catch (error) {
      console.error("Error calculating COGS from sale_items:", error)
      // Fallback to items array if database query fails
      for (const item of items) {
        const costPrice = Number(item.cost || item.wholesalePrice || 0)
        totalCogs += costPrice * Number(item.quantity)
      }
    }
  } else {
    // Calculate from items array (includes both products and services)
    for (const item of items) {
      const costPrice = Number(item.cost || item.wholesalePrice || 0)
      totalCogs += costPrice * Number(item.quantity)
    }
  }

  return totalCogs
}

export type GetUserSalesOptions = {
  limit?: number
  searchTerm?: string
  dateFrom?: string
  dateTo?: string
}

function getExclusiveEndDate(dateTo: string): string {
  return format(addDays(parseISO(dateTo), 1), "yyyy-MM-dd")
}

async function queryDeviceSales(deviceId: number, options: GetUserSalesOptions = {}) {
  const { limit, searchTerm, dateFrom, dateTo } = options
  const searchPattern = searchTerm?.trim() ? `%${searchTerm.trim().toLowerCase()}%` : null
  const endExclusive = dateTo ? getExclusiveEndDate(dateTo) : null

  if (dateFrom && endExclusive && !searchPattern && !limit) {
    return sql`
      SELECT s.*, c.name as customer_name, st.name as staff_name,
      COALESCE(
        (SELECT SUM(si.quantity * COALESCE(si.cost, si.wholesale_price, 0))
         FROM sale_items si 
         WHERE si.sale_id = s.id), 0
      ) as total_cost
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN staff st ON s.staff_id = st.id
      WHERE s.device_id = ${deviceId}
        AND s.sale_date >= ${dateFrom}
        AND s.sale_date < ${endExclusive}
      ORDER BY s.sale_date DESC, s.id DESC
    `
  }

  if (dateFrom && endExclusive && searchPattern && limit) {
    return sql`
      SELECT s.*, c.name as customer_name, st.name as staff_name,
      COALESCE(
        (SELECT SUM(si.quantity * COALESCE(si.cost, si.wholesale_price, 0))
         FROM sale_items si 
         WHERE si.sale_id = s.id), 0
      ) as total_cost
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN staff st ON s.staff_id = st.id
      WHERE s.device_id = ${deviceId}
        AND s.sale_date >= ${dateFrom}
        AND s.sale_date < ${endExclusive}
        AND (
          LOWER(c.name) LIKE ${searchPattern}
          OR CAST(s.id AS TEXT) LIKE ${searchPattern}
          OR LOWER(s.status) LIKE ${searchPattern}
          OR CAST(s.total_amount AS TEXT) LIKE ${searchPattern}
        )
      ORDER BY s.sale_date DESC, s.id DESC
      LIMIT ${limit}
    `
  }

  if (dateFrom && endExclusive && searchPattern) {
    return sql`
      SELECT s.*, c.name as customer_name, st.name as staff_name,
      COALESCE(
        (SELECT SUM(si.quantity * COALESCE(si.cost, si.wholesale_price, 0))
         FROM sale_items si 
         WHERE si.sale_id = s.id), 0
      ) as total_cost
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN staff st ON s.staff_id = st.id
      WHERE s.device_id = ${deviceId}
        AND s.sale_date >= ${dateFrom}
        AND s.sale_date < ${endExclusive}
        AND (
          LOWER(c.name) LIKE ${searchPattern}
          OR CAST(s.id AS TEXT) LIKE ${searchPattern}
          OR LOWER(s.status) LIKE ${searchPattern}
          OR CAST(s.total_amount AS TEXT) LIKE ${searchPattern}
        )
      ORDER BY s.sale_date DESC, s.id DESC
    `
  }

  if (dateFrom && endExclusive && limit) {
    return sql`
      SELECT s.*, c.name as customer_name, st.name as staff_name,
      COALESCE(
        (SELECT SUM(si.quantity * COALESCE(si.cost, si.wholesale_price, 0))
         FROM sale_items si 
         WHERE si.sale_id = s.id), 0
      ) as total_cost
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN staff st ON s.staff_id = st.id
      WHERE s.device_id = ${deviceId}
        AND s.sale_date >= ${dateFrom}
        AND s.sale_date < ${endExclusive}
      ORDER BY s.sale_date DESC, s.id DESC
      LIMIT ${limit}
    `
  }

  if (searchPattern && limit) {
    return sql`
      SELECT s.*, c.name as customer_name, st.name as staff_name,
      COALESCE(
        (SELECT SUM(si.quantity * COALESCE(si.cost, si.wholesale_price, 0))
         FROM sale_items si 
         WHERE si.sale_id = s.id), 0
      ) as total_cost
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN staff st ON s.staff_id = st.id
      WHERE s.device_id = ${deviceId}
        AND (
          LOWER(c.name) LIKE ${searchPattern}
          OR CAST(s.id AS TEXT) LIKE ${searchPattern}
          OR LOWER(s.status) LIKE ${searchPattern}
          OR CAST(s.total_amount AS TEXT) LIKE ${searchPattern}
        )
      ORDER BY s.sale_date DESC, s.id DESC
      LIMIT ${limit}
    `
  }

  if (searchPattern) {
    return sql`
      SELECT s.*, c.name as customer_name, st.name as staff_name,
      COALESCE(
        (SELECT SUM(si.quantity * COALESCE(si.cost, si.wholesale_price, 0))
         FROM sale_items si 
         WHERE si.sale_id = s.id), 0
      ) as total_cost
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN staff st ON s.staff_id = st.id
      WHERE s.device_id = ${deviceId}
        AND (
          LOWER(c.name) LIKE ${searchPattern}
          OR CAST(s.id AS TEXT) LIKE ${searchPattern}
          OR LOWER(s.status) LIKE ${searchPattern}
          OR CAST(s.total_amount AS TEXT) LIKE ${searchPattern}
        )
      ORDER BY s.sale_date DESC, s.id DESC
    `
  }

  if (limit) {
    return sql`
      SELECT s.*, c.name as customer_name, st.name as staff_name,
      COALESCE(
        (SELECT SUM(si.quantity * COALESCE(si.cost, si.wholesale_price, 0))
         FROM sale_items si 
         WHERE si.sale_id = s.id), 0
      ) as total_cost
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN staff st ON s.staff_id = st.id
      WHERE s.device_id = ${deviceId}
      ORDER BY s.sale_date DESC, s.id DESC
      LIMIT ${limit}
    `
  }

  return sql`
    SELECT s.*, c.name as customer_name, st.name as staff_name,
    COALESCE(
      (SELECT SUM(si.quantity * COALESCE(si.cost, si.wholesale_price, 0))
       FROM sale_items si 
       WHERE si.sale_id = s.id), 0
    ) as total_cost
    FROM sales s
    LEFT JOIN customers c ON s.customer_id = c.id
    LEFT JOIN staff st ON s.staff_id = st.id
    WHERE s.device_id = ${deviceId}
    ORDER BY s.sale_date DESC, s.id DESC
  `
}

export async function getUserSales(deviceId: number, options: GetUserSalesOptions = {}) {
  if (!deviceId) {
    return { success: false, message: "Device ID is required", data: [] }
  }

  resetConnectionState()

  try {
    const sales = await executeWithRetry(async () => queryDeviceSales(deviceId, options))

    return { success: true, data: await filterSalesForStaff(sales, deviceId) }
  } catch (error) {
    console.error("Get device sales error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
      data: [],
    }
  }
}

export async function getSaleDetails(saleId: number) {
  if (!saleId) {
    return { success: false, message: "Sale ID is required" }
  }

  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    const saleResult = await executeWithRetry(async () => {
      return await sql`
        SELECT 
          s.*,
          c.name as customer_name,
          c.phone as customer_phone,
          c.email as customer_email,
          c.address as customer_address,
          st.name as staff_name,
          md.tracking_url_template as tracking_url_template
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        LEFT JOIN staff st ON s.staff_id = st.id
        LEFT JOIN master_data md ON md.id = s.courier_service_id
        WHERE s.id = ${saleId}
      `
    })

    if (saleResult.length === 0) {
      return { success: false, message: "Sale not found" }
    }

    // Enhanced items query to properly distinguish between products and services and include actual costs
    const stockDeviceId = Number(saleResult[0].device_id || saleResult[0].created_by || 0)
    const itemsResult = await executeWithRetry(async () => {
      return await sql`
        SELECT 
          si.*,
          p.name as product_name,
          p.category as product_category,
          COALESCE((
            SELECT SUM(pbds.stock)
            FROM product_batch_device_stock pbds
            JOIN product_batches stock_batch ON stock_batch.id = pbds.batch_id
            WHERE stock_batch.product_id = p.id
              AND pbds.device_id = ${stockDeviceId}
          ), 0) as stock,
          pv.barcode,
          p.description as product_description,
          pv.wholesale_price as product_wholesale_price,
          COALESCE(si.cost, pv.wholesale_price, 0) as actual_cost,
          pv.name as variant_name,
          pb.batch_no as batch_number,
          s.name as service_name,
          s.category as service_category,
          s.description as service_description,
          s.duration_minutes,
          si.notes,
          CASE 
            WHEN s.id IS NOT NULL THEN 'service'
            WHEN p.id IS NOT NULL THEN 'product'
            ELSE 'unknown'
          END as item_type
        FROM sale_items si
        LEFT JOIN products p ON si.product_id = p.id AND NOT EXISTS (SELECT 1 FROM services s WHERE s.id = si.product_id)
        LEFT JOIN product_variants pv ON si.product_variant_id = pv.id
        LEFT JOIN product_batches pb ON si.batch_id = pb.id
        LEFT JOIN services s ON si.product_id = s.id
        WHERE si.sale_id = ${saleId}
        ORDER BY si.id
      `
    })

    const allocationsResult = await executeWithRetry(async () => {
      return await sql`
        SELECT 
          sba.*, pb.batch_no
        FROM sale_batch_allocations sba
        JOIN sale_items si ON sba.sale_item_id = si.id
        LEFT JOIN product_batches pb ON sba.batch_id = pb.id
        WHERE si.sale_id = ${saleId}
      `
    })

    // Attach allocations to items
    for (const item of itemsResult) {
      item.allocations = allocationsResult
        .filter((a: any) => a.sale_item_id === item.id)
        .map((a: any) => ({
          batchId: a.batch_id,
          batchNumber: a.batch_no,
          quantity: a.quantity,
          costPrice: a.cost_price,
          sellingPrice: a.selling_price
        }))
    }

    // Calculate subtotal from items
    const subtotal = itemsResult.reduce((sum: number, item: any) => sum + Number(item.quantity) * Number(item.price), 0)

    const discountValue =
      saleResult[0].discount !== null && saleResult[0].discount !== undefined
        ? Number(saleResult[0].discount)
        : Math.max(0, subtotal - Number(saleResult[0].total_amount))

    // Calculate outstanding amount
    const totalAmount = Number(saleResult[0].total_amount)
    const receivedAmount = Number(saleResult[0].received_amount || 0)
    const outstandingAmount = totalAmount - receivedAmount

    // Add calculated values to sale data
    const saleData = {
      ...saleResult[0],
      discount: discountValue,
      subtotal: subtotal,
      outstanding_amount: outstandingAmount,
    }

    console.log("Sale details fetched successfully:", {
      saleId,
      customerName: saleData.customer_name,
      itemsCount: itemsResult.length,
      totalAmount: saleData.total_amount,
      receivedAmount: saleData.received_amount,
      outstandingAmount: saleData.outstanding_amount,
      discount: discountValue,
    })

    return {
      success: true,
      data: {
        sale: saleData,
        items: itemsResult,
      },
    }
  } catch (error) {
    console.error("Get sale details error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
    }
  }
}

// FIXED addSale function with proper partial payment support for credit sales
export async function addSale(saleData: any) {
  let saleId: number | null = null

  try {
    console.log("Adding sale with data:", JSON.stringify(saleData, null, 2))

    // Calculate totals once
    const subtotal = saleData.items.reduce(
      (sum: number, item: any) => sum + Number.parseFloat(item.price) * Number.parseInt(item.quantity),
      0,
    )
    const discountAmount = Number(saleData.discount) || 0
    const shipping = await buildShippingFieldsForSave(saleData, saleData.deviceId)
    const { courierPaidExtra, expenseCourier, expensePacking } = getShippingAmounts(shipping)
    const productTotal = Math.max(0, subtotal - discountAmount)
    const total = productTotal + courierPaidExtra

    let newOrderStatus = saleData.status || "Completed"
    let newPaymentMethod = saleData.paymentMethod || "Cash"

    let advanceAmount = 0
    let receivedAmount = 0
    let balanceAmount = 0
    let newPaymentStatus = saleData.paymentStatus || "Pending"

    if (newPaymentMethod.toUpperCase() === "COD") {
      advanceAmount = Number(saleData.advanceAmount) || 0
      
      const explicitlyReceived = Number(saleData.receivedAmount) || 0
      receivedAmount = explicitlyReceived > advanceAmount ? explicitlyReceived : advanceAmount
      balanceAmount = Math.max(0, total - receivedAmount)
      
      if (receivedAmount >= total && total > 0) {
        newPaymentStatus = "Paid"
        balanceAmount = 0
        receivedAmount = total
      } else if (receivedAmount > 0) {
        newPaymentStatus = "Partial"
      } else {
        newPaymentStatus = "Pending"
      }
    } else if (["Cash", "Card", "UPI", "Bank Transfer"].includes(newPaymentMethod)) {
      // Immediate full payments
      advanceAmount = 0
      receivedAmount = total
      balanceAmount = 0
      newPaymentStatus = "Paid"
    } else {
      // Legacy Credit / other methods logic
      const requestedReceived = Number(saleData.receivedAmount) || 0
      receivedAmount = Math.min(requestedReceived, total)
      balanceAmount = total - receivedAmount
      
      if (receivedAmount >= total && total > 0) {
        newPaymentStatus = "Paid"
        balanceAmount = 0
      } else if (receivedAmount > 0) {
        newPaymentStatus = "Partial"
      } else {
        newPaymentStatus = "Pending"
      }
    }
    // 1. Ensure Payment Status and amounts are consistent
    if (
      newPaymentStatus.toLowerCase() === "paid" || 
      newPaymentStatus.toLowerCase() === "completed" || 
      receivedAmount >= total || 
      balanceAmount <= 0
    ) {
      if (newOrderStatus.toLowerCase() !== "cancelled") {
        newPaymentStatus = "Paid"
        receivedAmount = total
        balanceAmount = 0
      }
    }

    // 2. Automatically derive Sales Status from actual payment state
    if (newOrderStatus.toLowerCase() !== "cancelled") {
      if (newPaymentStatus.toLowerCase() === "paid" || (balanceAmount <= 0 && receivedAmount > 0)) {
        newOrderStatus = "Completed"
      } else {
        newOrderStatus = "Pending"
      }
    }

    // Delivery Status sync logic (independent from Payment Status "Paid" logic)
    if (newOrderStatus.toLowerCase() !== "cancelled") {
      const isCodApproved = newPaymentMethod.toUpperCase() === "COD" && receivedAmount > 0;
      const isStandardApproved = newPaymentStatus.toLowerCase() === "paid" || newPaymentStatus.toLowerCase() === "completed";
      
      if (isCodApproved || isStandardApproved) {
        if (!shipping.delivery_status || shipping.delivery_status.toLowerCase() === "pending") {
          shipping.delivery_status = "Paid";
        }
      }
    }

    const saleResult = await sql`
      INSERT INTO sales (
        customer_id, created_by, total_amount, status, payment_status, sale_date,
        device_id, payment_method, discount, received_amount, staff_id, sale_type,
        fulfillment_type, delivery_status, courier_service_id, courier_service_name,
        packaging_type_id, packaging_type_name,
        tracking_id, shipping_address, weight_kg, length_cm, width_cm, height_cm,
        courier_paid_extra, expense_courier, expense_packing, shipped_at, delivered_at, shipping_notes,
        advance_amount, balance_amount
      )
      VALUES (
        ${saleData.customerId || null},
        ${saleData.userId},
        ${total},
        ${newOrderStatus},
        ${newPaymentStatus},
        ${saleData.saleDate || new Date()},
        ${saleData.deviceId},
        ${saleData.paymentMethod || "Cash"},
        ${discountAmount},
        ${receivedAmount},
        ${saleData.staffId || null},
        ${saleData.saleType || "product"},
        ${shipping.fulfillment_type},
        ${shipping.delivery_status},
        ${shipping.courier_service_id},
        ${shipping.courier_service_name},
        ${shipping.packaging_type_id},
        ${shipping.packaging_type_name},
        ${shipping.tracking_id},
        ${shipping.shipping_address},
        ${shipping.weight_kg},
        ${shipping.length_cm},
        ${shipping.width_cm},
        ${shipping.height_cm},
        ${shipping.courier_paid_extra},
        ${shipping.expense_courier},
        ${shipping.expense_packing},
        ${shipping.shipped_at},
        ${shipping.delivered_at},
        ${shipping.shipping_notes},
        ${advanceAmount},
        ${balanceAmount}
      )
      RETURNING id
    `

    const sale = saleResult[0]
    saleId = sale.id

    // Insert sale items individually and update stock with improved validation
    const saleItems = []
    for (const item of saleData.items) {
      // Validate that the product/service exists before inserting
      let itemExists = false
      let isService = false
      let itemName = "Unknown Item"

      try {
        // Check if it's a product first
        const productCheck = await sql`SELECT id, name FROM products WHERE id = ${item.productId}`
        if (productCheck.length > 0) {
          itemExists = true
          isService = false
          itemName = productCheck[0].name
        } else {
          // Check if it's a service
          const serviceCheck = await sql`SELECT id, name FROM services WHERE id = ${item.productId}`
          if (serviceCheck.length > 0) {
            itemExists = true
            isService = true
            itemName = serviceCheck[0].name
          }
        }
      } catch (checkError) {
        console.error("Error checking product/service existence:", checkError)
      }

      if (!itemExists) {
        await sql`DELETE FROM sale_items WHERE sale_id = ${saleId}`
        await sql`DELETE FROM sales WHERE id = ${saleId}`
        return {
          success: false,
          message: `Item with ID ${item.productId} not found in products or services`,
        }
      }

      let variantId = item.variantId || item.productVariantId || item.product_variant_id || null
      const requestedBatchId = item.batchId || item.batch_id || null

      if (!variantId && !isService) {
        const defaultVariant = await sql`
          SELECT id FROM product_variants WHERE product_id = ${item.productId} ORDER BY id ASC LIMIT 1
        `
        if (defaultVariant.length > 0) {
          variantId = defaultVariant[0].id
        }
      }

      // Check if product is batch managed
      let isBatchManaged = false
      if (!isService) {
        const prodData = await sql`SELECT is_batch_managed FROM products WHERE id = ${item.productId}`
        if (prodData.length > 0) {
          isBatchManaged = prodData[0].is_batch_managed
        }
      }

      let allocations: {batchId: number | null, quantity: number, costPrice?: number, sellingPrice?: number}[] = Array.isArray(item.allocations) && item.allocations.length > 0 ? item.allocations : []
      let remainingQty = Number(item.quantity)

      if (allocations.length === 0) {
        if (isService || !isBatchManaged) {
           allocations.push({ batchId: requestedBatchId, quantity: remainingQty })
        } else {
           if (requestedBatchId) {
              allocations.push({ batchId: requestedBatchId, quantity: remainingQty })
              remainingQty = 0
           } else {
              const availableBatches = await sql`
                SELECT pb.id, pbds.stock, pb.cost_price, pb.selling_price
                FROM product_batch_device_stock pbds
                JOIN product_batches pb ON pb.id = pbds.batch_id
                WHERE pb.product_variant_id = ${variantId} 
                  AND pbds.device_id = ${saleData.deviceId}
                  AND pbds.stock > 0
                ORDER BY pb.manufacture_date ASC NULLS LAST, pb.created_at ASC
              `
              
              for (const batch of availableBatches) {
                 if (remainingQty <= 0) break
                 const stockAvailable = Number(batch.stock)
                 const qtyFromBatch = Math.min(remainingQty, stockAvailable)
                 allocations.push({ batchId: batch.id, quantity: qtyFromBatch, costPrice: Number(batch.cost_price) || 0, sellingPrice: Number(batch.selling_price) || 0 })
                 remainingQty -= qtyFromBatch
              }
              
              if (remainingQty > 0) {
                 allocations.push({ batchId: null, quantity: remainingQty })
              }
           }
        }
      }

      // Allocation input may come from an older client or a crafted request.
      // Enforce the Product -> Variant -> Batch boundary on the server too.
      if (!isService && isBatchManaged) {
        for (const allocation of allocations) {
          if (!allocation.batchId || allocation.quantity <= 0) continue
          const batch = await sql`
            SELECT id FROM product_batches
            WHERE id = ${allocation.batchId}
              AND product_id = ${item.productId}
              AND product_variant_id = ${variantId}
          `
          if (batch.length === 0) {
            throw new Error("Selected batch does not belong to the selected product variant")
          }
        }
      }

      const hasCostColumn = true
      const hasNotesColumn = true

      try {
        let itemResult
        if (hasCostColumn && hasNotesColumn) {
          itemResult = await sql`
            INSERT INTO sale_items (sale_id, product_id, product_variant_id, batch_id, quantity, price, cost, notes)
            VALUES (${saleId}, ${item.productId}, ${variantId || null}, ${requestedBatchId || null}, ${item.quantity}, ${item.price}, ${item.cost || 0}, ${item.notes || ""})
            RETURNING *
          `
        } else if (hasCostColumn) {
          itemResult = await sql`
            INSERT INTO sale_items (sale_id, product_id, product_variant_id, batch_id, quantity, price, cost)
            VALUES (${saleId}, ${item.productId}, ${variantId || null}, ${requestedBatchId || null}, ${item.quantity}, ${item.price}, ${item.cost || 0})
            RETURNING *
          `
        } else {
          itemResult = await sql`
            INSERT INTO sale_items (sale_id, product_id, product_variant_id, batch_id, quantity, price)
            VALUES (${saleId}, ${item.productId}, ${variantId || null}, ${requestedBatchId || null}, ${item.quantity}, ${item.price})
            RETURNING *
          `
        }

        const insertedItemId = itemResult[0].id
        itemResult[0].product_name = itemName
        itemResult[0].item_type = isService ? "service" : "product"
        saleItems.push(itemResult[0])

        for (const alloc of allocations) {
          if (alloc.quantity <= 0) continue;
          
          if (!isService && isBatchManaged) {
            await sql`
              INSERT INTO sale_batch_allocations (sale_item_id, batch_id, quantity, cost_price, selling_price)
              VALUES (${insertedItemId}, ${alloc.batchId}, ${alloc.quantity}, ${alloc.costPrice || item.cost || 0}, ${alloc.sellingPrice || item.price})
            `
          }

          const isNowDeducted = ["shipped", "delivered"].includes(String(shipping.delivery_status || "").toLowerCase())

          if (saleData.status !== "Cancelled" && !isService && isNowDeducted) {
            const stockResult = await updateProductStock(item.productId, variantId, alloc.batchId, alloc.quantity, "subtract", saleData.deviceId)
            if (!stockResult.success) {
              console.warn(`Stock update warning for product ${itemName}:`, stockResult.message)
            }
          }
        }
        console.log(`Successfully added ${isService ? "service" : "product"}: ${itemName} (ID: ${item.productId})`)
      } catch (insertError) {
        console.error("Error inserting sale item:", insertError)
        await sql`DELETE FROM sale_items WHERE sale_id = ${saleId}`
        await sql`DELETE FROM sales WHERE id = ${saleId}`
        return {
          success: false,
          message: `Failed to add item to sale: ${insertError instanceof Error ? insertError.message : "Unknown error"}`,
        }
      }
    }

    // Determine sale type - check if any items are services
    let saleType = "product"
    try {
      const serviceCheck = await sql`
        SELECT COUNT(*) as service_count
        FROM sale_items si
        WHERE si.sale_id = ${saleId}
        AND EXISTS (SELECT 1 FROM services s WHERE s.id = si.product_id)
      `

      if (serviceCheck[0]?.service_count > 0) {
        saleType = "service"
      }

      await sql`
        UPDATE sales 
        SET sale_type = ${saleType}
        WHERE id = ${saleId}
      `
    } catch (err) {
      console.log("Error determining sale type, defaulting to product type")
    }

    // Calculate COGS using the actual wholesale prices from the sale items
    const cogsAmount = await calculateCOGS(saleData.items)

    // Record simplified accounting transaction with new logic
    try {
      console.log("Recording accounting transaction for sale:", saleId, "with status:", saleData.paymentStatus)

      const accountingResult = await recordSaleTransaction({
        saleId: sale.id,
        totalAmount: total,
        cogsAmount,
        receivedAmount,
        outstandingAmount: balanceAmount,
        status: saleData.paymentStatus || "Completed",
        paymentMethod: saleData.paymentMethod || "Cash",
        deviceId: saleData.deviceId,
        userId: saleData.userId,
        customerId: saleData.customerId,
        saleDate: new Date(saleData.saleDate || new Date()),
        productCreditAmount: productTotal,
      })

      console.log("Accounting transaction result:", accountingResult)

      if (!accountingResult.success) {
        console.error("Failed to record accounting transaction:", accountingResult.error)
      }

      const shippingAccountingResult = await syncSaleShippingTransactions({
        saleId: sale.id,
        deviceId: saleData.deviceId,
        userId: saleData.userId,
        saleDate: new Date(saleData.saleDate || new Date()),
        paymentMethod: saleData.paymentMethod || "Cash",
        status: saleData.paymentStatus || "Completed",
        fulfillmentType: shipping.fulfillment_type,
        courierPaidExtra,
        expenseCourier,
        expensePacking,
        receivedAmount,
        totalAmount: total,
        productCreditAmount: productTotal,
      })

      if (!shippingAccountingResult.success) {
        console.error("Failed to record shipping accounting:", shippingAccountingResult.error)
      }
    } catch (accountingError) {
      console.error("Error recording accounting transaction:", accountingError)
      // Don't fail the sale if accounting fails, but log the detailed error
      if (accountingError instanceof Error) {
        console.error("Accounting error details:", {
          message: accountingError.message,
          stack: accountingError.stack,
          saleData: {
            saleId,
            deviceId: saleData.deviceId,
            userId: saleData.userId,
            totalAmount: total,
          },
        })
      }
    }

    revalidatePath("/dashboard")

    console.log(`Sale ${saleId} created successfully with ${saleItems.length} items (${saleType} sale)`)
    console.log(`Sale financial summary: Total=${total}, Received=${receivedAmount}, Outstanding=${balanceAmount}, Status=${saleData.paymentStatus}`)

    return {
      success: true,
      message: "Sale added successfully",
      data: {
        sale: {
          ...sale,
          discount: discountAmount,
          received_amount: receivedAmount,
          outstanding_amount: balanceAmount,
        },
        items: saleItems,
      },
    }
  } catch (error) {
    if (saleId) {
      try {
        await sql`DELETE FROM sale_items WHERE sale_id = ${saleId}`
        await sql`DELETE FROM sales WHERE id = ${saleId}`
      } catch (cleanupError) {
        console.error("Failed to clean up partial sale:", cleanupError)
      }
    }

    console.error("Database query error:", error)
    return {
      success: false,
      message: `Database error: ${error instanceof Error ? error.message : "Unknown error"}. Please try again later.`,
    }
  }
}

// CORRECTED Helper function to calculate all changes in one place
function calculateSaleChanges(
  original: any,
  newData: any,
  originalItems: any[],
  newItems: any[],
  shipping?: ReturnType<typeof normalizeSaleShippingInput>,
) {
  const subtotal = newData.items.reduce(
    (sum: number, item: any) => sum + Number.parseFloat(item.price) * Number.parseInt(item.quantity),
    0,
  )
  const newDiscountAmount = Number(newData.discount) || 0
  const courierPaidExtra =
    shipping?.fulfillment_type === "ship" ? Number(shipping.courier_paid_extra) || 0 : 0
  const productTotal = Math.max(0, subtotal - newDiscountAmount)
  const newTotal = productTotal + courierPaidExtra

  // Use explicit paymentStatus if provided, otherwise fallback to "Paid"
  let newOrderStatus = newData.status || original.status || "Completed"
  let newPaymentMethod = newData.paymentMethod || original.payment_method || "Cash"
  let newPaymentStatus = newData.paymentStatus || "Paid"
  
  let advanceAmount = 0
  let newReceivedAmount = 0
  let balanceAmount = 0

  if (newPaymentMethod.toUpperCase() === "COD") {
    advanceAmount = Number(newData.advanceAmount) || 0
    
    const explicitlyReceived = Number(newData.receivedAmount) || 0
    newReceivedAmount = explicitlyReceived > advanceAmount ? explicitlyReceived : advanceAmount
    balanceAmount = Math.max(0, newTotal - newReceivedAmount)

    if (newReceivedAmount >= newTotal && newTotal > 0) {
      newPaymentStatus = "Paid"
      balanceAmount = 0
      newReceivedAmount = newTotal
    } else if (newReceivedAmount > 0) {
      newPaymentStatus = "Partial"
    } else {
      newPaymentStatus = "Pending"
    }
  } else {
    // For Cash, Card, Bank Transfer, UPI, Credit, etc.
    const explicitlyReceived = Number(newData.receivedAmount) || 0
    newReceivedAmount = explicitlyReceived

    if (newReceivedAmount < 0) {
      throw new Error("Received amount cannot be negative")
    }
    if (newReceivedAmount > newTotal) {
      throw new Error(`Received amount (${newReceivedAmount}) cannot be greater than total amount (${newTotal})`)
    }

    balanceAmount = Math.max(0, newTotal - newReceivedAmount)
    
    if (newReceivedAmount >= newTotal && newTotal > 0) {
      newPaymentStatus = "Paid"
      balanceAmount = 0
    } else if (newReceivedAmount > 0) {
      newPaymentStatus = "Partial"
    } else {
      newPaymentStatus = "Pending"
    }
  }

  // Preserve tracking ID if not provided in update but exists in DB
  if (shipping && !shipping.tracking_id && original.tracking_id) {
    shipping.tracking_id = original.tracking_id
  }

  const originalSubtotal = originalItems.reduce(
    (sum: number, item: any) => sum + Number(item.price) * Number(item.quantity),
    0,
  )
  const originalCourierExtra =
    original.fulfillment_type === "ship" ? Number(original.courier_paid_extra) || 0 : 0
  const originalProductTotal = Number(original.total_amount) - originalCourierExtra
  const originalDiscountAmount = Math.max(0, originalSubtotal - originalProductTotal)

  let outstandingAmount = balanceAmount

  // 1. Ensure Payment Status and amounts are consistent
  if (
    newPaymentStatus.toLowerCase() === "paid" ||
    newPaymentStatus.toLowerCase() === "completed" ||
    newReceivedAmount >= newTotal ||
    outstandingAmount <= 0
  ) {
    if (newOrderStatus.toLowerCase() !== "cancelled") {
      newPaymentStatus = "Paid"
      newReceivedAmount = newTotal
      outstandingAmount = 0
      balanceAmount = 0
    }
  }

  // 2. Automatically derive Sales Status from actual payment state
  if (newOrderStatus.toLowerCase() !== "cancelled") {
    if (newPaymentStatus.toLowerCase() === "paid" || (balanceAmount <= 0 && newReceivedAmount > 0)) {
      newOrderStatus = "Completed"
    } else {
      newOrderStatus = "Pending"
    }
  }

  // Delivery Status sync logic (independent from Payment Status "Paid" logic)
  if (newOrderStatus.toLowerCase() !== "cancelled") {
    const isCodApproved = newPaymentMethod.toUpperCase() === "COD" && newReceivedAmount > 0;
    const isStandardApproved = newPaymentStatus.toLowerCase() === "paid" || newPaymentStatus.toLowerCase() === "completed";
    
    if (isCodApproved || isStandardApproved) {
      if (shipping && (!shipping.delivery_status || shipping.delivery_status.toLowerCase() === "pending")) {
        shipping.delivery_status = "Paid";
      }
    }
  }

  return {
    dateChanged: new Date(original.sale_date).getTime() !== new Date(newData.saleDate).getTime(),
    statusChanged: original.status !== newOrderStatus || original.payment_status !== newPaymentStatus,
    totalChanged: Number(original.total_amount) !== newTotal,
    discountChanged: originalDiscountAmount !== newDiscountAmount,
    receivedChanged: Number(original.received_amount || 0) !== newReceivedAmount,
    itemsChanged: JSON.stringify(originalItems) !== JSON.stringify(newItems),

    originalDate: new Date(original.sale_date),
    newDate: new Date(newData.saleDate),
    originalStatus: original.status,
    newStatus: newOrderStatus,
    originalPaymentStatus: original.payment_status,
    newPaymentStatus: newPaymentStatus,
    originalTotal: Number(original.total_amount),
    newTotal: newTotal,
    originalDiscount: originalDiscountAmount,
    newDiscount: newDiscountAmount,
    originalReceived: Number(original.received_amount || 0),
    newReceived: newReceivedAmount,

    // Product revenue (excludes courier charge collected)
    productTotal,

    // Differences
    totalDiff: newTotal - Number(original.total_amount),
    discountDiff: newDiscountAmount - originalDiscountAmount,
    receivedDiff: newReceivedAmount - Number(original.received_amount || 0),
    outstandingAmount: outstandingAmount,
    advanceAmount,
    balanceAmount,
  }
}

// Helper function to generate comprehensive description
function generateSaleUpdateDescription(saleId: number, changes: any): string {
  const today = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })

  let description = `Sale #${saleId} - Updated on ${today}\n`

  // Add specific changes
  if (changes.dateChanged) {
    description += `Date: ${changes.originalDate.toLocaleDateString("en-GB")} → ${changes.newDate.toLocaleDateString("en-GB")}\n`
  }

  if (changes.statusChanged) {
    description += `Status: ${changes.originalStatus} → ${changes.newStatus}\n`
  }

  if (changes.totalChanged) {
    description += `Total: ${changes.originalTotal} → ${changes.newTotal}\n`
  }

  if (changes.discountChanged) {
    description += `Discount: ${changes.originalDiscount} → ${changes.newDiscount}\n`
  }

  if (changes.receivedChanged) {
    description += `Received: ${changes.originalReceived} → ${changes.newReceived}\n`
  }

  description += `Outstanding: ${changes.outstandingAmount}`

  return description
}

// Helper function to calculate net accounting impact
function calculateNetAccountingImpact(changes: any): { debitAmount: number; creditAmount: number } {
  let debitAmount = 0
  let creditAmount = 0

  // Primary logic: base on received amount difference
  if (changes.receivedDiff > 0) {
    // More money received: CREDIT
    creditAmount = changes.receivedDiff
  } else if (changes.receivedDiff < 0) {
    // Money refunded: DEBIT
    debitAmount = Math.abs(changes.receivedDiff)
  }

  // Special case: if status changed to cancelled, ensure proper refund recording
  if (changes.statusChanged && changes.newStatus.toLowerCase() === "cancelled") {
    // Override with full refund if status changed to cancelled
    debitAmount = changes.originalReceived
    creditAmount = 0
  }

  return { debitAmount, creditAmount }
}

// FIXED updateSale function with proper partial payment support for credit sales
export async function updateSale(saleData: any) {
  try {
    console.log("Updating sale with consolidated approach:", JSON.stringify(saleData, null, 2))

    // 1. Get the original sale
    let originalSale
    if (saleData.deviceId) {
      originalSale = await sql`
        SELECT * FROM sales WHERE id = ${saleData.id} AND device_id = ${saleData.deviceId}
      `
    } else {
      originalSale = await sql`
        SELECT * FROM sales WHERE id = ${saleData.id}
      `
    }

    if (originalSale.length === 0) {
      return { success: false, message: "Sale not found" }
    }

    const original = originalSale[0]
    const shipping = await buildShippingFieldsForSave(saleData, saleData.deviceId || original.device_id, original)

    // Get original sale items for comparison
    const originalItems = await sql`
      SELECT id, product_id, quantity, price FROM sale_items WHERE sale_id = ${saleData.id}
    `

    // Calculate original and new COGS using the sale ID to get actual wholesale prices
    const originalCogs = await calculateCOGS([], saleData.id)
    const newCogs = await calculateCOGS(saleData.items)

    // 2. Calculate all changes in one place
    const changes = calculateSaleChanges(original, saleData, originalItems, saleData.items, shipping)

    // 3. Check if there are any actual changes
    const hasActualChanges =
      changes.dateChanged ||
      changes.statusChanged ||
      changes.totalChanged ||
      changes.discountChanged ||
      changes.receivedChanged ||
      changes.itemsChanged ||
      shippingFieldsChanged(original, shipping)

    if (!hasActualChanges) {
      return {
        success: true,
        message: "No changes detected",
        data: {
          discount: changes.newDiscount,
          received_amount: changes.newReceived,
          outstanding_amount: changes.outstandingAmount,
        },
      }
    }

    // 4. CORRECTED: Validate received amount for credit sales with proper logic
    const isCredit = changes.newStatus.toLowerCase() === "credit"

    if (isCredit && changes.newReceived > changes.newTotal) {
      return {
        success: false,
        message: `Received amount (${changes.newReceived}) cannot be greater than total amount (${changes.newTotal})`,
      }
    }

    const updateSaleRecord = async (whereDeviceScoped: boolean) => {
        if (whereDeviceScoped) {
          await sql`
            UPDATE sales 
            SET customer_id = ${saleData.customerId || null},
                total_amount = ${changes.newTotal},
                status = ${changes.newStatus},
                payment_status = ${changes.newPaymentStatus},
                sale_date = ${changes.newDate},
                updated_at = ${new Date()},
                payment_method = ${saleData.paymentMethod || "Cash"},
                discount = ${changes.newDiscount},
                received_amount = ${changes.newReceived},
                staff_id = ${saleData.staffId || null},
                fulfillment_type = ${shipping.fulfillment_type},
                delivery_status = ${shipping.delivery_status},
                courier_service_id = ${shipping.courier_service_id},
                courier_service_name = ${shipping.courier_service_name},
                packaging_type_id = ${shipping.packaging_type_id},
                packaging_type_name = ${shipping.packaging_type_name},
                tracking_id = ${shipping.tracking_id},
                shipping_address = ${shipping.shipping_address},
                weight_kg = ${shipping.weight_kg},
                length_cm = ${shipping.length_cm},
                width_cm = ${shipping.width_cm},
                height_cm = ${shipping.height_cm},
                courier_paid_extra = ${shipping.courier_paid_extra},
                expense_courier = ${shipping.expense_courier},
                expense_packing = ${shipping.expense_packing},
                shipped_at = ${shipping.shipped_at},
                delivered_at = ${shipping.delivered_at},
                shipping_notes = ${shipping.shipping_notes},
                advance_amount = ${changes.advanceAmount},
                balance_amount = ${changes.balanceAmount}
            WHERE id = ${saleData.id} AND device_id = ${saleData.deviceId}
          `
        } else {
          await sql`
            UPDATE sales 
            SET customer_id = ${saleData.customerId || null},
                total_amount = ${changes.newTotal},
                status = ${changes.newStatus},
                payment_status = ${changes.newPaymentStatus},
                sale_date = ${changes.newDate},
                updated_at = ${new Date()},
                payment_method = ${saleData.paymentMethod || "Cash"},
                discount = ${changes.newDiscount},
                received_amount = ${changes.newReceived},
                staff_id = ${saleData.staffId || null},
                fulfillment_type = ${shipping.fulfillment_type},
                delivery_status = ${shipping.delivery_status},
                courier_service_id = ${shipping.courier_service_id},
                courier_service_name = ${shipping.courier_service_name},
                packaging_type_id = ${shipping.packaging_type_id},
                packaging_type_name = ${shipping.packaging_type_name},
                tracking_id = ${shipping.tracking_id},
                shipping_address = ${shipping.shipping_address},
                weight_kg = ${shipping.weight_kg},
                length_cm = ${shipping.length_cm},
                width_cm = ${shipping.width_cm},
                height_cm = ${shipping.height_cm},
                courier_paid_extra = ${shipping.courier_paid_extra},
                expense_courier = ${shipping.expense_courier},
                expense_packing = ${shipping.expense_packing},
                shipped_at = ${shipping.shipped_at},
                delivered_at = ${shipping.delivered_at},
                shipping_notes = ${shipping.shipping_notes},
                advance_amount = ${changes.advanceAmount},
                balance_amount = ${changes.balanceAmount}
            WHERE id = ${saleData.id}
          `
        }
      }

      await updateSaleRecord(Boolean(saleData.deviceId))

    // 7. Handle sale items updates with MULTI-BATCH logic
    console.log("Updating sale items with multi-batch stock tracking...")

      const wasCancelled = changes.originalStatus.toLowerCase() === "cancelled"
      const isNowCancelled = changes.newStatus.toLowerCase() === "cancelled"
      const wasDeducted = ["shipped", "delivered"].includes(String(original.delivery_status || "").toLowerCase()) && !wasCancelled
      const isNowDeducted = ["shipped", "delivered"].includes(String(shipping.delivery_status || "").toLowerCase()) && !isNowCancelled

      console.log("Status change analysis:", {
        wasDeducted,
        wasCancelled,
        isNowDeducted,
        isNowCancelled,
        statusChanged: changes.statusChanged,
      })

      // Fetch all existing sale items and their allocations
      const existingItems = await sql`
        SELECT id, product_id, product_variant_id FROM sale_items WHERE sale_id = ${saleData.id}
      `
      
      const existingAllocations = await sql`
        SELECT sba.*, si.product_id, si.product_variant_id 
        FROM sale_batch_allocations sba 
        JOIN sale_items si ON sba.sale_item_id = si.id 
        WHERE si.sale_id = ${saleData.id}
      `

      // RESTORE STOCK: If the sale WAS deducted, we restore all allocated stock back to inventory
      if (wasDeducted) {
        console.log("Restoring stock from previous allocations...")
        for (const alloc of existingAllocations) {
          const stockResult = await updateProductStock(
            alloc.product_id, 
            alloc.product_variant_id, 
            alloc.batch_id, 
            alloc.quantity, 
            "add", 
            saleData.deviceId
          )
          if (stockResult.success) {
            await createStockHistoryEntry(
              alloc.product_id,
              alloc.product_variant_id,
              alloc.batch_id,
              "sale_edited_restored",
              alloc.quantity,
              saleData.id,
              "sale",
              saleData.deviceId,
              `Sale #${saleData.id} edited - stock temporarily restored`
            )
          }
        }
      }

      // DELETE old allocations (we will recreate them)
      if (existingItems.length > 0) {
        await sql`DELETE FROM sale_batch_allocations WHERE sale_item_id IN (SELECT id FROM sale_items WHERE sale_id = ${saleData.id})`
      }

      const processedItemIds = new Set()

      // Process items (UPDATE existing, INSERT new)
      for (const item of saleData.items) {
        const variantId = item.variantId || item.productVariantId || item.product_variant_id || null
        let resolvedVariantId = variantId
        
        if (!resolvedVariantId) {
          const defaultVariant = await sql`
            SELECT id FROM product_variants WHERE product_id = ${item.productId} ORDER BY id ASC LIMIT 1
          `
          if (defaultVariant.length > 0) {
            resolvedVariantId = defaultVariant[0].id
          }
        }

        let insertedItemId = item.id;
        
        if (item.id) {
          // Update existing item
          await sql`
            UPDATE sale_items SET
              product_id = ${item.productId},
              product_variant_id = ${resolvedVariantId || null},
              batch_id = null,
              quantity = ${item.quantity},
              price = ${item.price},
              cost = ${item.cost || 0},
              notes = ${item.notes || ""}
            WHERE id = ${item.id}
          `
          processedItemIds.add(item.id)
        } else {
          // Insert new item
          const itemResult = await sql`
            INSERT INTO sale_items (
              sale_id, product_id, product_variant_id, batch_id, quantity, price, cost, notes
            ) VALUES (
              ${saleData.id}, ${item.productId}, ${resolvedVariantId || null}, null, ${item.quantity}, ${item.price}, ${item.cost || 0}, ${item.notes || ""}
            ) RETURNING id
          `
          insertedItemId = itemResult[0].id;
        }

        // RE-ALLOCATE: Always create new allocations. Deduct stock if it is currently DEDUCTED (Shipped/Delivered).
        if (!isNowCancelled) {
          const allocations = item.allocations || [];
          
          for (const alloc of allocations) {
            if (alloc.quantity <= 0) continue;
            if (!alloc.batchId) {
              throw new Error("A batch-managed sale allocation requires a batch")
            }
            const batch = await sql`
              SELECT id FROM product_batches
              WHERE id = ${alloc.batchId}
                AND product_id = ${item.productId}
                AND product_variant_id = ${resolvedVariantId}
            `
            if (batch.length === 0) {
              throw new Error("Selected batch does not belong to the selected product variant")
            }
            
            // Insert allocation
            await sql`
              INSERT INTO sale_batch_allocations (sale_item_id, batch_id, quantity, cost_price, selling_price)
              VALUES (${insertedItemId}, ${alloc.batchId}, ${alloc.quantity}, ${alloc.costPrice || item.cost || 0}, ${alloc.sellingPrice || item.price})
            `
            
            
            // Deduct stock if applicable
            if (isNowDeducted) {
              const stockResult = await updateProductStock(
                item.productId, 
                resolvedVariantId, 
                alloc.batchId, 
                alloc.quantity, 
                "subtract", 
                saleData.deviceId
              )
              
              if (stockResult.success) {
                await createStockHistoryEntry(
                  item.productId,
                  resolvedVariantId,
                  alloc.batchId,
                  "sale_edited_deducted",
                  -alloc.quantity,
                  saleData.id,
                  "sale",
                  saleData.deviceId,
                  `Sale #${saleData.id} edited - stock deducted for allocation`
                )
              }
            }
          }
        }
      }

      // Handle deleted items
      for (const item of existingItems) {
        if (!processedItemIds.has(item.id)) {
          await sql`DELETE FROM sale_items WHERE id = ${item.id}`
        }
      }

      console.log("Sale items and batch allocations updated successfully")

      // 7.5. Update sale type based on current items
      try {
        const serviceCheck = await sql`
          SELECT COUNT(*) as service_count
          FROM sale_items si
          WHERE si.sale_id = ${saleData.id}
          AND EXISTS (SELECT 1 FROM services s WHERE s.id = si.product_id)
        `

        const newSaleType = serviceCheck[0]?.service_count > 0 ? "service" : "product"

        await sql`
          UPDATE sales 
          SET sale_type = ${newSaleType}
          WHERE id = ${saleData.id}
        `

        console.log(`Sale type updated to: ${newSaleType} (has ${serviceCheck[0]?.service_count || 0} services)`)
      } catch (err) {
        console.log("Error updating sale type:", err)
      }

      // 8. FIXED: Create accounting entry only if there are actual financial changes
      try {
        // Generate appropriate description for returns
        let adjustmentDescription = `Sale #${saleData.id} updated with changes`

        if (
          changes.statusChanged &&
          changes.originalStatus.toLowerCase() === "completed" &&
          changes.newStatus.toLowerCase() === "cancelled"
        ) {
          adjustmentDescription = `Sale #${saleData.id} RETURNED - Status changed from ${changes.originalStatus} to ${changes.newStatus} - Stock restored`
        } else if (changes.statusChanged) {
          adjustmentDescription = `Sale #${saleData.id} status changed from ${changes.originalStatus} to ${changes.newStatus}`
        }

        // Record accounting when cash, bill, or cost changes
        const hasAccountingChange =
          changes.receivedDiff !== 0 ||
          changes.discountChanged ||
          changes.totalChanged ||
          changes.itemsChanged ||
          (changes.statusChanged &&
            changes.originalStatus.toLowerCase() === "completed" &&
            changes.newStatus.toLowerCase() === "cancelled")

        if (hasAccountingChange) {
          const accountingResult = await recordSaleAdjustment({
            saleId: saleData.id,
            changeType: "consolidated_edit",
            previousValues: {
              totalAmount: changes.originalTotal,
              receivedAmount: changes.originalReceived,
              status: changes.originalStatus,
              cogsAmount: originalCogs,
              discount: changes.originalDiscount,
            },
            newValues: {
              totalAmount: changes.newTotal,
              cogsAmount: newCogs,
              receivedAmount: changes.newReceived,
              outstandingAmount: changes.outstandingAmount,
              status: changes.newStatus,
              customerId: saleData.customerId,
              discount: changes.newDiscount,
            },
            deviceId: saleData.deviceId,
            userId: saleData.userId,
            description: adjustmentDescription,
            adjustmentDate: new Date(),
          })

          if (accountingResult.success && accountingResult.transactionId) {
            console.log("Accounting entry created for sale update:", accountingResult.transactionId)
          } else if (accountingResult.message) {
            console.log("Accounting:", accountingResult.message)
          }
        } else {
          console.log("No accounting changes detected, skipping accounting entry")
        }

        const { courierPaidExtra, expenseCourier, expensePacking } = getShippingAmounts(shipping)
        const shippingAccountingResult = await syncSaleShippingTransactions({
          saleId: saleData.id,
          deviceId: saleData.deviceId,
          userId: saleData.userId,
          saleDate: changes.newDate,
          paymentMethod: saleData.paymentMethod || "Cash",
          status: changes.newStatus,
          fulfillmentType: shipping.fulfillment_type,
          courierPaidExtra,
          expenseCourier,
          expensePacking,
          receivedAmount: changes.newReceived,
          totalAmount: changes.newTotal,
          productCreditAmount: changes.productTotal,
        })

        if (!shippingAccountingResult.success) {
          console.error("Failed to sync shipping accounting:", shippingAccountingResult.error)
        }
      } catch (accountingError) {
        console.error("Error creating accounting entry:", accountingError)
        // Don't fail the sale update if accounting fails
      }

    // 9. Revalidate the dashboard page to show the updated sale
    revalidatePath("/dashboard")

    console.log(`Sale ${saleData.id} updated successfully:`, {
      status: changes.newStatus,
      total: changes.newTotal,
      received: changes.newReceived,
      outstanding: changes.outstandingAmount,
    })

    return {
      success: true,
      message: "Sale updated successfully",
      data: {
        discount: changes.newDiscount,
        received_amount: changes.newReceived,
        outstanding_amount: changes.outstandingAmount,
      },
    }
  } catch (error) {
    console.error("Database query error:", error)
    return {
      success: false,
      message: `Database error: ${error instanceof Error ? error.message : "Unknown error"}. Please try again later.`,
    }
  }
}

export async function updateSaleDeliveryStatus(
  saleId: number,
  deviceId: number,
  deliveryStatus: string,
) {
  if (!saleId || !deviceId) {
    return { success: false as const, message: "Sale ID and device ID are required" }
  }

  try {
    const rows = await sql`
      SELECT delivery_status, status, fulfillment_type, shipped_at, delivered_at, payment_status, tracking_id, sale_type
      FROM sales
      WHERE id = ${saleId}
        AND device_id = ${deviceId}
      LIMIT 1
    `

    if (rows.length === 0) {
      return { success: false as const, message: "Sale not found" }
    }

    const shippedAt =
      rows[0].shipped_at ||
      (["Shipped", "In transit", "Delivered"].includes(deliveryStatus) ? new Date() : null)
    const deliveredAt =
      rows[0].delivered_at || (deliveryStatus === "Delivered" ? new Date() : null)

    const originalDeliveryStatus = rows[0].delivery_status || "Pending"
    const originalStatus = rows[0].status || "Completed"
    const paymentStatus = rows[0].payment_status || "Pending"
    const isJobCard = rows[0].sale_type === 'job_card'

    const isPaid = paymentStatus.toLowerCase() === "paid" || paymentStatus.toLowerCase() === "completed"
    if (!isJobCard && !isPaid) {
      return { success: false as const, message: "Delivery process cannot begin until payment is completed." }
    }

    const VALID_TRANSITIONS: Record<string, string[]> = {
      "Pending": isJobCard ? ["Shipped"] : [], // No manual exits allowed except for Job Cards
      "Paid": ["Packed"],
      "Packed": ["Sent"],
      "Sent": ["Shipped"],
      "Shipped": ["Delivered"],
      "Delivered": [],
      "Returned": [],
      "Failed": []
    }

    if (deliveryStatus === "Paid") {
      return { success: false as const, message: "Delivery Status 'Paid' can only be assigned automatically when payment is completed." }
    }

    if (deliveryStatus !== originalDeliveryStatus && !(VALID_TRANSITIONS[originalDeliveryStatus] || []).includes(deliveryStatus)) {
      return { success: false as const, message: `Cannot move delivery status from ${originalDeliveryStatus} to ${deliveryStatus}. Invalid transition.` }
    }

    const wasCancelled = originalStatus.toLowerCase() === "cancelled"
    const wasDeducted = ["shipped", "delivered"].includes(String(originalDeliveryStatus).toLowerCase()) && !wasCancelled
    const isNowDeducted = ["shipped", "delivered"].includes(String(deliveryStatus).toLowerCase()) && !wasCancelled

    // If there is a transition in deduction state, we need to fetch items and allocations
    if (wasDeducted !== isNowDeducted) {
      const existingAllocations = await sql`
        SELECT sba.*, si.product_id, si.product_variant_id 
        FROM sale_batch_allocations sba 
        JOIN sale_items si ON sba.sale_item_id = si.id 
        WHERE si.sale_id = ${saleId}
      `

      for (const alloc of existingAllocations) {
        const operation = isNowDeducted ? "subtract" : "add"
        const stockResult = await updateProductStock(
          alloc.product_id, 
          alloc.product_variant_id, 
          alloc.batch_id, 
          alloc.quantity, 
          operation, 
          deviceId
        )
        if (stockResult.success) {
          await createStockHistoryEntry(
            alloc.product_id,
            alloc.product_variant_id,
            alloc.batch_id,
            isNowDeducted ? "sale_delivery_deducted" : "sale_delivery_restored",
            isNowDeducted ? -alloc.quantity : alloc.quantity,
            saleId,
            "sale",
            deviceId,
            `Sale #${saleId} delivery status changed to ${deliveryStatus} - stock ${isNowDeducted ? "deducted" : "restored"}`
          )
        }
      }
    }

    // Now update the sales table, with retry for DOD tracking ID allocation
    let newTrackingId = rows[0].tracking_id;
    if (newTrackingId && newTrackingId.startsWith('JC-')) {
      newTrackingId = null;
    }
    let updateSuccess = false;
    let retries = 5;

    while (!updateSuccess && retries > 0) {
      try {
        if (deliveryStatus === "Shipped" && !newTrackingId) {
          const activeIdsResult = await sql`
            SELECT tracking_id 
            FROM sales 
            WHERE device_id = ${deviceId} 
              AND tracking_id LIKE 'DOD %' 
              AND delivery_status NOT IN ('Delivered', 'Returned', 'Failed') 
              AND status != 'Cancelled'
          `;
          const activeIds = new Set(activeIdsResult.map((r: any) => parseInt(String(r.tracking_id).replace('DOD ', ''), 10) || 0));
          let nextNum = 1;
          while (activeIds.has(nextNum)) {
            nextNum++;
          }
          newTrackingId = 'DOD ' + String(nextNum).padStart(3, '0');
        }

        await sql`
          UPDATE sales
          SET delivery_status = ${deliveryStatus},
              shipped_at = ${shippedAt},
              delivered_at = ${deliveredAt},
              tracking_id = COALESCE(tracking_id, ${newTrackingId}),
              updated_at = NOW()
          WHERE id = ${saleId}
            AND device_id = ${deviceId}
        `
        updateSuccess = true;
      } catch (err: any) {
        if (err.message && (err.message.includes('idx_sales_active_dod_tracking') || err.message.includes('unique constraint'))) {
          retries--;
          newTrackingId = null; // reset to try allocation again
          if (retries === 0) throw new Error("Could not allocate a unique DOD tracking ID. Please try again.");
          continue;
        }
        throw err;
      }
    }

    revalidatePath("/dashboard")
    revalidatePath("/staff/dashboard")
    return { success: true as const, message: "Delivery status updated", trackingId: newTrackingId }
  } catch (error) {
    console.error("updateSaleDeliveryStatus error:", error)
    return {
      success: false as const,
      message: `Database error: ${error instanceof Error ? error.message : "Unknown error"}`,
    }
  }
}

// Update the deleteSale function to handle stock adjustments based on status
export async function deleteSale(saleId: number, deviceId: number) {
  if (!saleId || !deviceId) {
    return { success: false, message: "Sale ID and Device ID are required" }
  }

  resetConnectionState()

  try {
    return await executeWithRetry(async () => {
      const saleRows = await sql`
        SELECT id, device_id, status, sale_type
        FROM sales
        WHERE id = ${saleId}
        LIMIT 1
      `

      if (saleRows.length === 0) {
        return { success: false, message: "Sale not found" }
      }

      if (saleRows[0].sale_type === 'job_card') {
        return { success: false, message: "Job Cards cannot be deleted" }
      }

      const sale = saleRows[0]
      const saleDeviceId = Number(sale.device_id || deviceId)

      if (sale.device_id != null && Number(sale.device_id) !== Number(deviceId)) {
        return { success: false, message: "Sale not found for this device" }
      }

      const status = String(sale.status || "")
      const statusLower = status.toLowerCase()
      const isCancelled = statusLower === "cancelled"
      const shouldRestoreStock =
        !isCancelled && (statusLower === "completed" || statusLower === "credit" || statusLower === "delivered")

      const saleItems = await sql`
        SELECT product_id, product_variant_id, batch_id, quantity
        FROM sale_items
        WHERE sale_id = ${saleId}
      `

      if (shouldRestoreStock) {
        for (const item of saleItems) {
          await updateProductStock(item.product_id, item.product_variant_id, item.batch_id, item.quantity, "add", saleDeviceId)
        }
      }

      try {
        await deleteSaleTransaction(saleId, saleDeviceId)
      } catch (accountingError) {
        console.error("Error deleting accounting records:", accountingError)
      }

      try {
        await sql`
          DELETE FROM financial_transactions
          WHERE reference_type = 'sale'
            AND reference_id = ${saleId}
        `
      } catch (accountingError) {
        console.error("Error deleting remaining accounting records:", accountingError)
      }

      await sql`DELETE FROM sale_items WHERE sale_id = ${saleId}`

      const result = await sql`DELETE FROM sales WHERE id = ${saleId} RETURNING id`

      if (result.length === 0) {
        return { success: false, message: "Failed to delete sale" }
      }

      revalidatePath("/dashboard")
      return { success: true, message: "Sale deleted successfully" }
    })
  } catch (error) {
    console.error("Delete sale error:", error)
    return {
      success: false,
      message: `Database error: ${error instanceof Error ? error.message : getLastError()?.message || "Unknown error"}. Please try again later.`,
    }
  }
}
