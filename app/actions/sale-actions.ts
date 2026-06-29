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
    const deviceStock = await sql`
      SELECT stock
      FROM product_device_stock
      WHERE product_id = ${productId} AND device_id = ${deviceId}
      LIMIT 1
    `

    const currentStock = deviceStock.length > 0 ? Number(deviceStock[0].stock || 0) : 0

    let nextStock = currentStock
    if (operation === "subtract") {
      // Check if we have enough stock
      if (currentStock < quantityChange) {
        console.warn(
          `Insufficient stock for product ${product.name}: ${currentStock} available, ${quantityChange} requested`,
        )
        // Don't fail the sale, just log the warning
      }
      nextStock = Math.max(0, currentStock - quantityChange)
      console.log(`Stock updated for product ${product.name} on device ${deviceId}: ${currentStock} -> ${nextStock}`)
    } else {
      nextStock = currentStock + quantityChange
      console.log(`Stock restored for product ${product.name} on device ${deviceId}: ${currentStock} -> ${nextStock}`)
    }

    await sql`
      INSERT INTO product_device_stock (product_id, device_id, stock, updated_at)
      VALUES (${productId}, ${deviceId}, ${nextStock}, NOW())
      ON CONFLICT (product_id, device_id)
      DO UPDATE SET stock = ${nextStock}, updated_at = NOW()
    `

    return { success: true, message: "Stock updated successfully" }
  } catch (error) {
    console.error(`Error updating stock for product ${productId}:`, error)
    return { success: false, message: error.message }
  }
}

// Add this helper function at the top of the file, after the existing helper functions
async function createStockHistoryEntry(
  productId: number,
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

    await sql`
      INSERT INTO product_stock_history (
        product_id, quantity, type, reference_id, reference_type, notes, created_by, device_id
      ) VALUES (
        ${productId},
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
      `Stock history created for product ${productId}: ${changeType} ${quantity} units (${referenceType} #${referenceId}, device ${deviceId})`,
    )
    return { success: true, message: "Stock history created successfully" }
  } catch (error) {
    console.error(`Error creating stock history for product ${productId}:`, error)
    return { success: false, message: error.message }
  }
}

// Calculate COGS for sale items using actual sale item costs (including services)
async function calculateCOGS(items: any[], saleId?: number) {
  let totalCogs = 0

  if (saleId) {
    try {
      // Updated query to include service costs and use actual costs from sale_items
      const saleItems = await sql`
        SELECT 
          si.quantity, 
          COALESCE(si.cost, si.wholesale_price, 0) as cost_price,
          CASE 
            WHEN s.id IS NOT NULL THEN 'service'
            WHEN p.id IS NOT NULL THEN 'product'
            ELSE 'unknown'
          END as item_type
        FROM sale_items si
        LEFT JOIN products p ON si.product_id = p.id AND NOT EXISTS (SELECT 1 FROM services s WHERE s.id = si.product_id)
        LEFT JOIN services s ON si.product_id = s.id
        WHERE si.sale_id = ${saleId}
      `

      totalCogs = saleItems.reduce((sum, item) => {
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
          COALESCE(pds.stock, 0) as stock,
          p.barcode,
          p.description as product_description,
          p.wholesale_price as product_wholesale_price,
          COALESCE(si.cost, si.wholesale_price, 0) as actual_cost,
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
        LEFT JOIN product_device_stock pds ON pds.product_id = p.id AND pds.device_id = ${stockDeviceId}
        LEFT JOIN services s ON si.product_id = s.id
        WHERE si.sale_id = ${saleId}
        ORDER BY si.id
      `
    })

    // Calculate subtotal from items
    const subtotal = itemsResult.reduce((sum, item) => sum + Number(item.quantity) * Number(item.price), 0)

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

    // 🚨 FIXED: Handle received amount based on status - PROPER partial payment support for credit sales
    let receivedAmount = 0
    const isCompleted = saleData.paymentStatus?.toLowerCase() === "completed"
    const isCancelled = saleData.paymentStatus?.toLowerCase() === "cancelled"
    const isCredit = saleData.paymentStatus?.toLowerCase() === "credit"

    if (isCompleted) {
      // Completed sales: full amount received
      receivedAmount = total
      console.log(`✅ COMPLETED SALE: received_amount = total_amount = ${total}`)
    } else if (isCancelled) {
      // Cancelled sales: no payment received
      receivedAmount = 0
      console.log(`❌ CANCELLED SALE: received_amount = 0`)
    } else if (isCredit) {
      // 🚨 FIXED: Credit sales can have partial payments
      // Use the receivedAmount from frontend, but validate it
      const requestedReceived = Number(saleData.receivedAmount) || 0

      if (requestedReceived > total) {
        receivedAmount = total // Cap at total amount
        console.warn(`⚠️ Received amount ${requestedReceived} capped to total ${total}`)
      } else {
        receivedAmount = requestedReceived
      }

      console.log(`🔄 CREDIT SALE: Total=${total}, Received=${receivedAmount}, Outstanding=${total - receivedAmount}`)
    }

    const outstandingAmount = total - receivedAmount

    const saleResult = await sql`
      INSERT INTO sales (
        customer_id, created_by, total_amount, status, sale_date,
        device_id, payment_method, discount, received_amount, staff_id, sale_type,
        fulfillment_type, delivery_status, courier_service_id, courier_service_name,
        packaging_type_id, packaging_type_name,
        tracking_id, shipping_address, weight_kg, length_cm, width_cm, height_cm,
        courier_paid_extra, expense_courier, expense_packing, shipped_at, delivered_at, shipping_notes
      )
      VALUES (
        ${saleData.customerId || null},
        ${saleData.userId},
        ${total},
        ${saleData.paymentStatus || "Completed"},
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
        ${shipping.shipping_notes}
      )
      RETURNING *
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

      // Check if cost and notes columns exist in sale_items table
      const hasCostColumn = true
      const hasNotesColumn = true

      // Insert sale item - now works without foreign key constraint
      let itemResult
      try {
        if (hasCostColumn && hasNotesColumn) {
          itemResult = await sql`
            INSERT INTO sale_items (sale_id, product_id, quantity, price, cost, notes)
            VALUES (${saleId}, ${item.productId}, ${item.quantity}, ${item.price}, ${item.cost || 0}, ${item.notes || ""})
            RETURNING *
          `
        } else if (hasCostColumn) {
          itemResult = await sql`
            INSERT INTO sale_items (sale_id, product_id, quantity, price, cost)
            VALUES (${saleId}, ${item.productId}, ${item.quantity}, ${item.price}, ${item.cost || 0})
            RETURNING *
          `
        } else {
          itemResult = await sql`
            INSERT INTO sale_items (sale_id, product_id, quantity, price)
            VALUES (${saleId}, ${item.productId}, ${item.quantity}, ${item.price})
            RETURNING *
          `
        }

        // Add the item name for display purposes
        itemResult[0].product_name = itemName
        itemResult[0].item_type = isService ? "service" : "product"

        saleItems.push(itemResult[0])

        // Update stock using the safe helper function - only for products and if not cancelled
        if (!isCancelled && !isService) {
          const stockResult = await updateProductStock(item.productId, item.quantity, "subtract", saleData.deviceId)
          if (!stockResult.success) {
            console.warn(`Stock update warning for product ${itemName}:`, stockResult.message)
            // Don't fail the sale, just log the warning
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
        outstandingAmount,
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
    console.log(`Sale financial summary: Total=${total}, Received=${receivedAmount}, Outstanding=${outstandingAmount}, Status=${saleData.paymentStatus}`)

    return {
      success: true,
      message: "Sale added successfully",
      data: {
        sale: {
          ...sale,
          discount: discountAmount,
          received_amount: receivedAmount,
          outstanding_amount: outstandingAmount,
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

  // CORRECTED: Calculate new received amount based on status with proper partial payment handling
  let newReceivedAmount = 0
  const isCompleted = newData.paymentStatus?.toLowerCase() === "completed"
  const isCancelled = newData.paymentStatus?.toLowerCase() === "cancelled"
  const isCredit = newData.paymentStatus?.toLowerCase() === "credit"

  if (isCompleted) {
    newReceivedAmount = newTotal // Full amount received for completed sales
  } else if (isCancelled) {
    newReceivedAmount = 0 // No payment for cancelled sales
  } else if (isCredit) {
    const currentReceived = Number(original.received_amount || 0)
    const requestedReceived = Number(newData.receivedAmount) || 0
    const wasAlreadyCredit = original.status?.toLowerCase() === "credit"

    if (requestedReceived > newTotal) {
      throw new Error(
        `Received amount (${requestedReceived}) cannot be greater than total amount (${newTotal}) for credit sales`,
      )
    }

    if (requestedReceived < 0) {
      throw new Error("Received amount cannot be negative")
    }

    // Only block decreases when updating an existing credit sale (partial payment already recorded).
    // Allow any received amount when converting from Completed/Pending/etc. to Credit.
    if (wasAlreadyCredit && requestedReceived < currentReceived) {
      throw new Error(
        `Cannot decrease received amount for credit sales. Current: ${currentReceived}, Requested: ${requestedReceived}`,
      )
    }

    newReceivedAmount = requestedReceived
    
    console.log(`🔄 CREDIT SALE UPDATE: received_amount ${currentReceived} → ${newReceivedAmount}`)
    
    // Log if this is a payment on a credit sale
    if (newReceivedAmount > currentReceived) {
      console.log(`💰 CREDIT SALE PAYMENT: Customer paid ${newReceivedAmount - currentReceived}, Outstanding: ${newTotal - newReceivedAmount}`)
    }
  }

  // Calculate original discount from original items since we don't have discount column
  const originalSubtotal = originalItems.reduce(
    (sum: number, item: any) => sum + Number(item.price) * Number(item.quantity),
    0,
  )
  const originalCourierExtra =
    original.fulfillment_type === "ship" ? Number(original.courier_paid_extra) || 0 : 0
  const originalProductTotal = Number(original.total_amount) - originalCourierExtra
  const originalDiscountAmount = Math.max(0, originalSubtotal - originalProductTotal)

  const outstandingAmount = newTotal - newReceivedAmount

  console.log("Sale changes calculation:", {
    originalSubtotal,
    originalProductTotal,
    originalDiscount: originalDiscountAmount,
    newDiscount: newDiscountAmount,
    discountDiff: newDiscountAmount - originalDiscountAmount,
    newStatus: newData.paymentStatus,
    newReceived: newReceivedAmount,
    originalReceived: original.received_amount || 0,
    outstandingAmount,
  })

  return {
    // Basic changes
    dateChanged: new Date(original.sale_date).getTime() !== new Date(newData.saleDate).getTime(),
    statusChanged: original.status !== newData.paymentStatus,
    totalChanged: Number(original.total_amount) !== newTotal,
    discountChanged: originalDiscountAmount !== newDiscountAmount,
    receivedChanged: Number(original.received_amount || 0) !== newReceivedAmount,
    itemsChanged: JSON.stringify(originalItems) !== JSON.stringify(newItems),

    // Values
    originalDate: new Date(original.sale_date),
    newDate: new Date(newData.saleDate),
    originalStatus: original.status,
    newStatus: newData.paymentStatus,
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
                shipping_notes = ${shipping.shipping_notes}
            WHERE id = ${saleData.id} AND device_id = ${saleData.deviceId}
          `
        } else {
          await sql`
            UPDATE sales 
            SET customer_id = ${saleData.customerId || null},
                total_amount = ${changes.newTotal},
                status = ${changes.newStatus},
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
                shipping_notes = ${shipping.shipping_notes}
            WHERE id = ${saleData.id}
          `
        }
      }

      await updateSaleRecord(Boolean(saleData.deviceId))

    // 7. Handle sale items updates with improved stock management and stock history
    console.log("Updating sale items with stock tracking...")

      // Get existing sale items with more details
      const existingItems = await sql`
        SELECT id, product_id, quantity FROM sale_items WHERE sale_id = ${saleData.id}
      `

      const existingItemMap = new Map()
      for (const item of existingItems) {
        existingItemMap.set(item.id, {
          productId: item.product_id,
          quantity: item.quantity,
        })
      }

      const processedItemIds = new Set()

      // Handle status change for stock adjustments with stock history
      const wasCompleted = changes.originalStatus.toLowerCase() === "completed"
      const wasCancelled = changes.originalStatus.toLowerCase() === "cancelled"
      const isNowCompleted = changes.newStatus.toLowerCase() === "completed"
      const isNowCancelled = changes.newStatus.toLowerCase() === "cancelled"

      console.log("Status change analysis:", {
        wasCompleted,
        wasCancelled,
        isNowCompleted,
        isNowCancelled,
        statusChanged: changes.statusChanged,
        isReturn: wasCompleted && isNowCancelled, // This is a return
      })

      // Handle status-based stock changes first
      if (changes.statusChanged) {
        if (wasCompleted && !wasCancelled && isNowCancelled) {
          // This is a RETURN - Changing from completed to cancelled - restore all stock for products only
          console.log("Processing SALE RETURN - restoring stock for all items")
          for (const item of existingItems) {
            const stockResult = await updateProductStock(item.product_id, item.quantity, "add", saleData.deviceId)
            if (stockResult.success) {
              // Create stock history entry for return
              await createStockHistoryEntry(
                item.product_id,
                "sale_returned",
                item.quantity,
                saleData.id,
                "sale",
                saleData.deviceId,
                `Sale #${saleData.id} returned - stock restored`,
              )
              console.log(`Stock restored for returned product ${item.product_id}: +${item.quantity}`)
            }
          }
        } else if (wasCancelled && isNowCompleted) {
          // Changing from cancelled to completed - reduce stock for products only
          console.log("Sale completed from cancelled - reducing stock for all items")
          for (const item of existingItems) {
            const stockResult = await updateProductStock(item.product_id, item.quantity, "subtract", saleData.deviceId)
            if (stockResult.success) {
              // Create stock history entry for completion
              await createStockHistoryEntry(
                item.product_id,
                "sale_completed",
                -item.quantity,
                saleData.id,
                "sale",
                saleData.deviceId,
                `Sale #${saleData.id} completed - stock reduced`,
              )
              console.log(`Stock reduced for product ${item.product_id}: -${item.quantity}`)
            }
          }
        }
      }

      // Track individual item changes for stock adjustments
      const itemStockChanges = []

      // Update or insert each sale item and track changes
      for (const item of saleData.items) {
        if (item.id) {
          // Update existing item - check for quantity changes
          const existingItem = existingItemMap.get(item.id)
          if (existingItem) {
            const quantityDiff = item.quantity - existingItem.quantity

            if (quantityDiff !== 0 && isNowCompleted && !isNowCancelled) {
              // Only adjust stock if sale is currently completed
              itemStockChanges.push({
                productId: item.productId,
                quantityChange: quantityDiff,
                changeType: quantityDiff > 0 ? "sale_item_increased" : "sale_item_decreased",
                notes: `Sale #${saleData.id} item quantity changed from ${existingItem.quantity} to ${item.quantity}`,
              })
            }
          }

          await sql`
            UPDATE sale_items SET
              product_id = ${item.productId},
              quantity = ${item.quantity},
              price = ${item.price},
              cost = ${item.cost || 0},
              notes = ${item.notes || ""}
            WHERE id = ${item.id}
          `
          processedItemIds.add(item.id)
        } else {
          // Insert new item
          if (isNowCompleted && !isNowCancelled) {
            itemStockChanges.push({
              productId: item.productId,
              quantityChange: item.quantity,
              changeType: "sale_item_added",
              notes: `New item added to Sale #${saleData.id}`,
            })
          }

          await sql`
            INSERT INTO sale_items (
              sale_id, 
              product_id, 
              quantity, 
              price,
              cost,
              notes
            ) VALUES (
              ${saleData.id}, 
              ${item.productId}, 
              ${item.quantity}, 
              ${item.price},
              ${item.cost || 0},
              ${item.notes || ""}
            )
          `
        }
      }

      // Handle deleted items
      for (const [itemId, itemData] of existingItemMap.entries()) {
        if (!processedItemIds.has(itemId)) {
          // Item was removed
          if (isNowCompleted && !isNowCancelled) {
            itemStockChanges.push({
              productId: itemData.productId,
              quantityChange: -itemData.quantity,
              changeType: "sale_item_removed",
              notes: `Item removed from Sale #${saleData.id} - stock restored`,
            })
          }

          await sql`DELETE FROM sale_items WHERE id = ${itemId}`
        }
      }

      // Apply stock changes and create history entries
      console.log("Applying item-level stock changes:", itemStockChanges.length)
      for (const change of itemStockChanges) {
        if (change.quantityChange > 0) {
          // More items sold - reduce stock
          const stockResult = await updateProductStock(change.productId, change.quantityChange, "subtract", saleData.deviceId)
          if (stockResult.success) {
            await createStockHistoryEntry(
              change.productId,
              change.changeType,
              -change.quantityChange, // Negative for stock reduction
              saleData.id,
              "sale",
              saleData.deviceId,
              change.notes,
            )
            console.log(`Stock reduced for product ${change.productId}: -${change.quantityChange}`)
          }
        } else if (change.quantityChange < 0) {
          // Fewer items sold - restore stock
          const stockResult = await updateProductStock(change.productId, Math.abs(change.quantityChange), "add", saleData.deviceId)
          if (stockResult.success) {
            await createStockHistoryEntry(
              change.productId,
              change.changeType,
              Math.abs(change.quantityChange), // Positive for stock restoration
              saleData.id,
              "sale",
              saleData.deviceId,
              change.notes,
            )
            console.log(`Stock restored for product ${change.productId}: +${Math.abs(change.quantityChange)}`)
          }
        }
      }

      console.log("Sale items updated successfully with stock history")

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
      SELECT fulfillment_type, shipped_at, delivered_at
      FROM sales
      WHERE id = ${saleId}
        AND device_id = ${deviceId}
      LIMIT 1
    `

    if (rows.length === 0) {
      return { success: false as const, message: "Sale not found" }
    }

    if (rows[0].fulfillment_type !== "ship") {
      return { success: false as const, message: "This sale is not a shipped order" }
    }

    const shippedAt =
      rows[0].shipped_at ||
      (["Shipped", "In transit", "Delivered"].includes(deliveryStatus) ? new Date() : null)
    const deliveredAt =
      rows[0].delivered_at || (deliveryStatus === "Delivered" ? new Date() : null)

    await sql`
      UPDATE sales
      SET delivery_status = ${deliveryStatus},
          shipped_at = ${shippedAt},
          delivered_at = ${deliveredAt},
          updated_at = NOW()
      WHERE id = ${saleId}
        AND device_id = ${deviceId}
    `

    revalidatePath("/dashboard")
    return { success: true as const, message: "Delivery status updated" }
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
        SELECT id, device_id, status
        FROM sales
        WHERE id = ${saleId}
        LIMIT 1
      `

      if (saleRows.length === 0) {
        return { success: false, message: "Sale not found" }
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
        SELECT product_id, quantity
        FROM sale_items
        WHERE sale_id = ${saleId}
      `

      if (shouldRestoreStock) {
        for (const item of saleItems) {
          await updateProductStock(item.product_id, item.quantity, "add", saleDeviceId)
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
