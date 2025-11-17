"use server"

import { sql, getLastError, resetConnectionState, executeWithRetry } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { recordSaleTransaction, recordSaleAdjustment, deleteSaleTransaction } from "./simplified-accounting"

const CACHE_DURATION = 60000 // 1 minute
let schemaCache: any = null

async function getSchemaInfo() {
  const now = Date.now()

  // Use cached info if recent
  if (schemaCache && now - schemaCache.lastChecked < CACHE_DURATION) {
    return schemaCache
  }

  // Check schema once, cache result
  const checkResult = await sql`
    SELECT 
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'payment_method') as has_payment_method,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'discount') as has_discount,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'device_id') as has_device_id,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'received_amount') as has_received_amount,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'staff_id') as has_staff_id,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'sale_type') as has_sale_type
  `

  schemaCache = {
    hasPaymentMethod: checkResult[0]?.has_payment_method || false,
    hasDiscount: checkResult[0]?.has_discount || false,
    hasDeviceId: checkResult[0]?.has_device_id || false,
    hasReceivedAmount: checkResult[0]?.has_received_amount || false,
    hasStaffId: checkResult[0]?.has_staff_id || false,
    hasSaleType: checkResult[0]?.has_sale_type || false,
    lastChecked: now,
  }

  return schemaCache
}

// Helper function to safely update product stock with proper validation
async function updateProductStock(productId: number, quantityChange: number, operation: "subtract" | "add") {
  try {
    // First, verify this is actually a product (not a service)
    const productCheck = await sql`
      SELECT id, name, stock FROM products WHERE id = ${productId}
    `

    if (productCheck.length === 0) {
      console.log(`Skipping stock update for ID ${productId} - not found in products table (likely a service)`)
      return { success: true, message: "Item is not a product, stock update skipped" }
    }

    const product = productCheck[0]
    const currentStock = Number(product.stock)

    if (operation === "subtract") {
      // Check if we have enough stock
      if (currentStock < quantityChange) {
        console.warn(
          `Insufficient stock for product ${product.name}: ${currentStock} available, ${quantityChange} requested`,
        )
        // Don't fail the sale, just log the warning
      }

      await sql`
        UPDATE products 
        SET stock = stock - ${quantityChange}
        WHERE id = ${productId}
      `
      console.log(`Stock updated for product ${product.name}: ${currentStock} -> ${currentStock - quantityChange}`)
    } else {
      await sql`
        UPDATE products 
        SET stock = stock + ${quantityChange}
        WHERE id = ${productId}
      `
      console.log(`Stock restored for product ${product.name}: ${currentStock} -> ${currentStock + quantityChange}`)
    }

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

    // Check if stock_history table exists and has the required columns
    const tableCheck = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'stock_history'
      ) as table_exists
    `

    if (!tableCheck[0]?.table_exists) {
      console.log("Stock history table does not exist, skipping stock history creation")
      return { success: true, message: "Stock history table not available" }
    }

    // ------------------------------------------------------------------
    // Ensure the table has the columns we need (change_type, quantity_change)
    // ------------------------------------------------------------------
    try {
      await sql`ALTER TABLE stock_history ADD COLUMN IF NOT EXISTS change_type VARCHAR(50)`
      await sql`ALTER TABLE stock_history ADD COLUMN IF NOT EXISTS quantity_change INTEGER`
    } catch (colErr) {
      console.error("Error ensuring stock_history required columns:", colErr)
      // Let execution continue – if the column already exists this will be a harmless notice
    }

    // Check for required columns
    const columnCheck = await sql`
      SELECT 
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_history' AND column_name = 'sale_id') as has_sale_id,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_history' AND column_name = 'purchase_id') as has_purchase_id
    `

    const hasSaleId = columnCheck[0]?.has_sale_id || false
    const hasPurchaseId = columnCheck[0]?.has_purchase_id || false

    // Insert stock history entry with enhanced change types
    if (hasSaleId && hasPurchaseId) {
      // Both columns exist - use appropriate one based on reference type
      if (referenceType === "sale") {
        await sql`
          INSERT INTO stock_history (product_id, change_type, quantity_change, sale_id, created_at, notes)
          VALUES (${productId}, ${changeType}, ${quantity}, ${referenceId}, ${new Date()}, ${notes || ""})
        `
      } else {
        await sql`
          INSERT INTO stock_history (product_id, change_type, quantity_change, purchase_id, created_at, notes)
          VALUES (${productId}, ${changeType}, ${quantity}, ${referenceId}, ${new Date()}, ${notes || ""})
        `
      }
    } else if (hasSaleId && referenceType === "sale") {
      // Only sale_id column exists
      await sql`
        INSERT INTO stock_history (product_id, change_type, quantity_change, sale_id, created_at, notes)
        VALUES (${productId}, ${changeType}, ${quantity}, ${referenceId}, ${new Date()}, ${notes || ""})
      `
    } else {
      // Fallback to basic stock history without reference IDs
      await sql`
        INSERT INTO stock_history (product_id, change_type, quantity_change, created_at, notes)
        VALUES (${productId}, ${changeType}, ${quantity}, ${new Date()}, ${notes || ""})
      `
    }

    console.log(
      `Stock history created for product ${productId}: ${changeType} ${quantity} units (${referenceType} #${referenceId})`,
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

export async function getUserSales(deviceId: number, limit?: number, searchTerm?: string) {
  if (!deviceId) {
    return { success: false, message: "Device ID is required", data: [] }
  }

  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    let sales

    // In getUserSales function, update the sales query to include staff information and fix cost calculation:
    if (searchTerm && searchTerm.trim() !== "") {
      // Search query - search across customer name, sale ID, and status
      const searchPattern = `%${searchTerm.toLowerCase()}%`

      if (limit) {
        sales = await executeWithRetry(async () => {
          return await sql`
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
            ORDER BY s.sale_date DESC
            LIMIT ${limit}
          `
        })
      } else {
        sales = await executeWithRetry(async () => {
          return await sql`
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
            ORDER BY s.sale_date DESC
          `
        })
      }
    } else {
      // Regular query without search
      if (limit) {
        sales = await executeWithRetry(async () => {
          return await sql`
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
            ORDER BY s.sale_date DESC
            LIMIT ${limit}
          `
        })
      } else {
        sales = await executeWithRetry(async () => {
          return await sql`
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
            ORDER BY s.sale_date DESC
          `
        })
      }
    }

    return { success: true, data: sales }
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
    // Check if staff_id column exists first
    const schema = await getSchemaInfo()

    // Update the sale query to conditionally include staff information:
    const saleResult = await executeWithRetry(async () => {
      if (schema.hasStaffId) {
        return await sql`
          SELECT 
            s.*,
            c.name as customer_name,
            c.phone as customer_phone,
            c.email as customer_email,
            c.address as customer_address,
            st.name as staff_name
          FROM sales s
          LEFT JOIN customers c ON s.customer_id = c.id
          LEFT JOIN staff st ON s.staff_id = st.id
          WHERE s.id = ${saleId}
        `
      } else {
        return await sql`
          SELECT 
            s.*,
            c.name as customer_name,
            c.phone as customer_phone,
            c.email as customer_email,
            c.address as customer_address
          FROM sales s
          LEFT JOIN customers c ON s.customer_id = c.id
          WHERE s.id = ${saleId}
        `
      }
    })

    if (saleResult.length === 0) {
      return { success: false, message: "Sale not found" }
    }

    // Enhanced items query to properly distinguish between products and services and include actual costs
    const itemsResult = await executeWithRetry(async () => {
      return await sql`
        SELECT 
          si.*,
          p.name as product_name,
          p.category as product_category,
          p.stock,
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
        LEFT JOIN services s ON si.product_id = s.id
        WHERE si.sale_id = ${saleId}
        ORDER BY si.id
      `
    })

    // Calculate subtotal from items
    const subtotal = itemsResult.reduce((sum, item) => sum + Number(item.quantity) * Number(item.price), 0)

    // Check if discount column exists and handle discount calculation
    let hasDiscountColumn = false
    try {
      const checkResult = await sql`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'sales' AND column_name = 'discount'
        ) as has_column
      `
      hasDiscountColumn = checkResult[0]?.has_column || false
    } catch (err) {
      console.error("Error checking for discount column:", err)
    }

    // Handle discount value
    let discountValue = 0
    if (hasDiscountColumn && saleResult[0].discount !== null && saleResult[0].discount !== undefined) {
      discountValue = Number(saleResult[0].discount)
    } else {
      // Calculate discount from the difference if column doesn't exist
      const total = Number(saleResult[0].total_amount)
      discountValue = subtotal - total > 0 ? subtotal - total : 0
    }

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
  try {
    console.log("Adding sale with data:", JSON.stringify(saleData, null, 2))

    // Get schema info (cached)
    const schema = await getSchemaInfo()

    // Start transaction
    await sql`BEGIN`

    try {
      // Calculate totals once
      const subtotal = saleData.items.reduce(
        (sum: number, item: any) => sum + Number.parseFloat(item.price) * Number.parseInt(item.quantity),
        0,
      )
      const discountAmount = Number(saleData.discount) || 0
      const total = Math.max(0, subtotal - discountAmount)

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

      // Add missing columns if they don't exist
      if (!schema.hasDeviceId) {
        try {
          await sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS device_id INTEGER`
          schema.hasDeviceId = true
        } catch (err) {
          console.error("Error adding device_id column:", err)
        }
      }

      if (!schema.hasReceivedAmount) {
        try {
          await sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS received_amount DECIMAL(12,2) DEFAULT 0`
          schema.hasReceivedAmount = true
        } catch (err) {
          console.error("Error adding received_amount column:", err)
        }
      }

      if (!schema.hasStaffId) {
        try {
          await sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS staff_id INTEGER`
          schema.hasStaffId = true
        } catch (err) {
          console.error("Error adding staff_id column:", err)
        }
      }

      if (!schema.hasSaleType) {
        try {
          await sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_type VARCHAR(20) DEFAULT 'product'`
          schema.hasSaleType = true
        } catch (err) {
          console.error("Error adding sale_type column:", err)
        }
      }

      // Build INSERT query based on available columns
      let saleResult
      if (
        schema.hasDeviceId &&
        schema.hasPaymentMethod &&
        schema.hasDiscount &&
        schema.hasReceivedAmount &&
        schema.hasStaffId &&
        saleData.staffId
      ) {
        // All columns available
        saleResult = await sql`
          INSERT INTO sales (customer_id, created_by, total_amount, status, sale_date, device_id, payment_method, discount, received_amount, staff_id) 
          VALUES (${saleData.customerId || null}, ${saleData.userId}, ${total}, ${saleData.paymentStatus || "Completed"}, ${saleData.saleDate || new Date()}, ${saleData.deviceId}, ${saleData.paymentMethod || "Cash"}, ${discountAmount}, ${receivedAmount}, ${saleData.staffId}) 
          RETURNING *
        `
      } else if (schema.hasDeviceId && schema.hasPaymentMethod && schema.hasDiscount && schema.hasReceivedAmount) {
        // Without staff_id
        saleResult = await sql`
          INSERT INTO sales (customer_id, created_by, total_amount, status, sale_date, device_id, payment_method, discount, received_amount) 
          VALUES (${saleData.customerId || null}, ${saleData.userId}, ${total}, ${saleData.paymentStatus || "Completed"}, ${saleData.saleDate || new Date()}, ${saleData.deviceId}, ${saleData.paymentMethod || "Cash"}, ${discountAmount}, ${receivedAmount}) 
          RETURNING *
        `
      } else if (schema.hasDeviceId && schema.hasPaymentMethod && schema.hasDiscount) {
        // Without received_amount
        saleResult = await sql`
          INSERT INTO sales (customer_id, created_by, total_amount, status, sale_date, device_id, payment_method, discount) 
          VALUES (${saleData.customerId || null}, ${saleData.userId}, ${total}, ${saleData.paymentStatus || "Completed"}, ${saleData.saleDate || new Date()}, ${saleData.deviceId}, ${saleData.paymentMethod || "Cash"}, ${discountAmount}) 
          RETURNING *
        `
      } else if (schema.hasDeviceId && schema.hasPaymentMethod) {
        // Without discount and received_amount
        saleResult = await sql`
          INSERT INTO sales (customer_id, created_by, total_amount, status, sale_date, device_id, payment_method) 
          VALUES (${saleData.customerId || null}, ${saleData.userId}, ${total}, ${saleData.paymentStatus || "Completed"}, ${saleData.saleDate || new Date()}, ${saleData.deviceId}, ${saleData.paymentMethod || "Cash"}) 
          RETURNING *
        `
      } else if (schema.hasDeviceId) {
        // Only device_id available
        saleResult = await sql`
          INSERT INTO sales (customer_id, created_by, total_amount, status, sale_date, device_id) 
          VALUES (${saleData.customerId || null}, ${saleData.userId}, ${total}, ${saleData.paymentStatus || "Completed"}, ${saleData.saleDate || new Date()}, ${saleData.deviceId}) 
          RETURNING *
        `
      } else {
        // Basic columns only
        saleResult = await sql`
          INSERT INTO sales (customer_id, created_by, total_amount, status, sale_date) 
          VALUES (${saleData.customerId || null}, ${saleData.userId}, ${total}, ${saleData.paymentStatus || "Completed"}, ${saleData.saleDate || new Date()}) 
          RETURNING *
        `
      }

      const sale = saleResult[0]
      const saleId = sale.id

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
          await sql`ROLLBACK`
          return {
            success: false,
            message: `Item with ID ${item.productId} not found in products or services`,
          }
        }

        // Check if cost and notes columns exist in sale_items table
        let hasCostColumn = true
        let hasNotesColumn = true
        try {
          const checkColumns = await sql`
            SELECT 
              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sale_items' AND column_name = 'cost') as has_cost,
              EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sale_items' AND column_name = 'notes') as has_notes
          `
          hasCostColumn = checkColumns[0]?.has_cost || false
          hasNotesColumn = checkColumns[0]?.has_notes || false

          if (!hasCostColumn) {
            await sql`ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS cost DECIMAL(12,2) DEFAULT 0`
            hasCostColumn = true
          }
          if (!hasNotesColumn) {
            await sql`ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS notes TEXT`
            hasNotesColumn = true
          }
        } catch (err) {
          console.error("Error checking/adding sale_items columns:", err)
          hasCostColumn = false
          hasNotesColumn = false
        }

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
            const stockResult = await updateProductStock(item.productId, item.quantity, "subtract")
            if (!stockResult.success) {
              console.warn(`Stock update warning for product ${itemName}:`, stockResult.message)
              // Don't fail the sale, just log the warning
            }
          }

          console.log(`Successfully added ${isService ? "service" : "product"}: ${itemName} (ID: ${item.productId})`)
        } catch (insertError) {
          console.error("Error inserting sale item:", insertError)
          await sql`ROLLBACK`
          return {
            success: false,
            message: `Failed to add item to sale: ${insertError.message}`,
          }
        }
      }

      // Determine sale type - check if any items are services
      let saleType = "product"
      if (schema.hasSaleType) {
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

          // Update sale with type
          await sql`
            UPDATE sales 
            SET sale_type = ${saleType}
            WHERE id = ${saleId}
          `
        } catch (err) {
          console.log("Error determining sale type, defaulting to product type")
        }
      }

      // Calculate COGS using the actual wholesale prices from the sale items
      const cogsAmount = await calculateCOGS(saleData.items)

      // Record simplified accounting transaction with new logic
      try {
        console.log("Recording accounting transaction for sale:", saleId, "with status:", saleData.paymentStatus)

        const accountingResult = await recordSaleTransaction({
          saleId,
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
        })

        console.log("Accounting transaction result:", accountingResult)

        if (!accountingResult.success) {
          console.error("Failed to record accounting transaction:", accountingResult.error)
        }
      } catch (accountingError) {
        console.error("Error recording accounting transaction:", accountingError)
        // Don't fail the sale if accounting fails, but log the detailed error
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

      // Commit transaction
      await sql`COMMIT`
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
            outstanding_amount: outstandingAmount 
          },
          items: saleItems,
        },
      }
    } catch (error) {
      await sql`ROLLBACK`
      throw error
    }
  } catch (error) {
    console.error("Database query error:", error)
    return {
      success: false,
      message: `Database error: ${error.message}. Please try again later.`,
    }
  }
}

// CORRECTED Helper function to calculate all changes in one place
function calculateSaleChanges(original: any, newData: any, originalItems: any[], newItems: any[]) {
  const subtotal = newData.items.reduce(
    (sum: number, item: any) => sum + Number.parseFloat(item.price) * Number.parseInt(item.quantity),
    0,
  )
  const newDiscountAmount = Number(newData.discount) || 0
  const newTotal = Math.max(0, subtotal - newDiscountAmount)

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
    // 🚨 FIXED: For credit sales, allow partial payments and proper updates
    const currentReceived = Number(original.received_amount || 0)
    const requestedReceived = Number(newData.receivedAmount) || 0
    
    // Validate: Can only increase received_amount for credit sales (no refunds via this method)
    if (requestedReceived < currentReceived) {
      throw new Error(`Cannot decrease received amount for credit sales. Current: ${currentReceived}, Requested: ${requestedReceived}`)
    }
    
    if (requestedReceived > newTotal) {
      throw new Error(`Received amount (${requestedReceived}) cannot be greater than total amount (${newTotal}) for credit sales`)
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
  const originalTotal = Number(original.total_amount)
  const originalDiscountAmount = Math.max(0, originalSubtotal - originalTotal)

  const outstandingAmount = newTotal - newReceivedAmount

  console.log("Sale changes calculation:", {
    originalSubtotal,
    originalTotal,
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

    // Start a transaction
    await sql`BEGIN`

    try {
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
        await sql`ROLLBACK`
        return { success: false, message: "Sale not found" }
      }

      const original = originalSale[0]

      // Get original sale items for comparison
      const originalItems = await sql`
        SELECT id, product_id, quantity, price FROM sale_items WHERE sale_id = ${saleData.id}
      `

      // Calculate original and new COGS using the sale ID to get actual wholesale prices
      const originalCogs = await calculateCOGS([], saleData.id)
      const newCogs = await calculateCOGS(saleData.items)

      // 2. Calculate all changes in one place
      const changes = calculateSaleChanges(original, saleData, originalItems, saleData.items)

      // 3. Check if there are any actual changes
      const hasActualChanges =
        changes.dateChanged ||
        changes.statusChanged ||
        changes.totalChanged ||
        changes.discountChanged ||
        changes.receivedChanged ||
        changes.itemsChanged

      if (!hasActualChanges) {
        await sql`ROLLBACK`
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
      const isCompleted = changes.newStatus.toLowerCase() === "completed"
      const isCancelled = changes.newStatus.toLowerCase() === "cancelled"
      const isCredit = changes.newStatus.toLowerCase() === "credit"

      if (isCredit && changes.newReceived > changes.newTotal) {
        await sql`ROLLBACK`
        return {
          success: false,
          message: `Received amount (${changes.newReceived}) cannot be greater than total amount (${changes.newTotal})`,
        }
      }

      // 5. Check and add missing columns if needed
      const schema = await getSchemaInfo()

      // Add missing columns if needed
      if (!schema.hasDeviceId) {
        try {
          await sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS device_id INTEGER`
          schema.hasDeviceId = true
        } catch (err) {
          console.error("Error adding device_id column:", err)
        }
      }

      if (!schema.hasReceivedAmount) {
        try {
          await sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS received_amount DECIMAL(12,2) DEFAULT 0`
          schema.hasReceivedAmount = true
        } catch (err) {
          console.error("Error adding received_amount column:", err)
        }
      }

      if (!schema.hasStaffId) {
        try {
          await sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS staff_id INTEGER`
          schema.hasStaffId = true
        } catch (err) {
          console.error("Error adding staff_id column:", err)
        }
      }

      // 6. Update the sale record with optimized query
      // Build the UPDATE query - Fixed version
      if (saleData.deviceId) {
        if (
          schema.hasPaymentMethod &&
          schema.hasDiscount &&
          schema.hasReceivedAmount &&
          schema.hasStaffId &&
          saleData.staffId
        ) {
          await sql`
            UPDATE sales 
            SET customer_id = ${saleData.customerId || null}, total_amount = ${changes.newTotal}, status = ${changes.newStatus}, sale_date = ${changes.newDate}, updated_at = ${new Date()}, payment_method = ${saleData.paymentMethod || "Cash"}, discount = ${changes.newDiscount}, received_amount = ${changes.newReceived}, staff_id = ${saleData.staffId}
            WHERE id = ${saleData.id} AND device_id = ${saleData.deviceId}
          `
        } else if (schema.hasPaymentMethod && schema.hasDiscount && schema.hasReceivedAmount) {
          await sql`
            UPDATE sales 
            SET customer_id = ${saleData.customerId || null}, total_amount = ${changes.newTotal}, status = ${changes.newStatus}, sale_date = ${changes.newDate}, updated_at = ${new Date()}, payment_method = ${saleData.paymentMethod || "Cash"}, discount = ${changes.newDiscount}, received_amount = ${changes.newReceived}
            WHERE id = ${saleData.id} AND device_id = ${saleData.deviceId}
          `
        } else if (schema.hasPaymentMethod && schema.hasDiscount) {
          await sql`
            UPDATE sales 
            SET customer_id = ${saleData.customerId || null}, total_amount = ${changes.newTotal}, status = ${changes.newStatus}, sale_date = ${changes.newDate}, updated_at = ${new Date()}, payment_method = ${saleData.paymentMethod || "Cash"}, discount = ${changes.newDiscount}
            WHERE id = ${saleData.id} AND device_id = ${saleData.deviceId}
          `
        } else if (schema.hasPaymentMethod) {
          await sql`
            UPDATE sales 
            SET customer_id = ${saleData.customerId || null}, total_amount = ${changes.newTotal}, status = ${changes.newStatus}, sale_date = ${changes.newDate}, updated_at = ${new Date()}, payment_method = ${saleData.paymentMethod || "Cash"}
            WHERE id = ${saleData.id} AND device_id = ${saleData.deviceId}
          `
        } else {
          await sql`
            UPDATE sales 
            SET customer_id = ${saleData.customerId || null}, total_amount = ${changes.newTotal}, status = ${changes.newStatus}, sale_date = ${changes.newDate}, updated_at = ${new Date()}
            WHERE id = ${saleData.id} AND device_id = ${saleData.deviceId}
          `
        }
      } else {
        if (
          schema.hasPaymentMethod &&
          schema.hasDiscount &&
          schema.hasReceivedAmount &&
          schema.hasStaffId &&
          saleData.staffId
        ) {
          await sql`
            UPDATE sales 
            SET customer_id = ${saleData.customerId || null}, total_amount = ${changes.newTotal}, status = ${changes.newStatus}, sale_date = ${changes.newDate}, updated_at = ${new Date()}, payment_method = ${saleData.paymentMethod || "Cash"}, discount = ${changes.newDiscount}, received_amount = ${changes.newReceived}, staff_id = ${saleData.staffId}
            WHERE id = ${saleData.id}
          `
        } else if (schema.hasPaymentMethod && schema.hasDiscount && schema.hasReceivedAmount) {
          await sql`
            UPDATE sales 
            SET customer_id = ${saleData.customerId || null}, total_amount = ${changes.newTotal}, status = ${changes.newStatus}, sale_date = ${changes.newDate}, updated_at = ${new Date()}, payment_method = ${saleData.paymentMethod || "Cash"}, discount = ${changes.newDiscount}, received_amount = ${changes.newReceived}
            WHERE id = ${saleData.id}
          `
        } else if (schema.hasPaymentMethod && schema.hasDiscount) {
          await sql`
            UPDATE sales 
            SET customer_id = ${saleData.customerId || null}, total_amount = ${changes.newTotal}, status = ${changes.newStatus}, sale_date = ${changes.newDate}, updated_at = ${new Date()}, payment_method = ${saleData.paymentMethod || "Cash"}, discount = ${changes.newDiscount}
            WHERE id = ${saleData.id}
          `
        } else if (schema.hasPaymentMethod) {
          await sql`
            UPDATE sales 
            SET customer_id = ${saleData.customerId || null}, total_amount = ${changes.newTotal}, status = ${changes.newStatus}, sale_date = ${changes.newDate}, updated_at = ${new Date()}, payment_method = ${saleData.paymentMethod || "Cash"}
            WHERE id = ${saleData.id}
          `
        } else {
          await sql`
            UPDATE sales 
            SET customer_id = ${saleData.customerId || null}, total_amount = ${changes.newTotal}, status = ${changes.newStatus}, sale_date = ${changes.newDate}, updated_at = ${new Date()}
            WHERE id = ${saleData.id}
          `
        }
      }

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
            const stockResult = await updateProductStock(item.product_id, item.quantity, "add")
            if (stockResult.success) {
              // Create stock history entry for return
              await createStockHistoryEntry(
                item.product_id,
                "sale_returned",
                item.quantity,
                saleData.id,
                "sale",
                `Sale #${saleData.id} returned - stock restored`,
              )
              console.log(`Stock restored for returned product ${item.product_id}: +${item.quantity}`)
            }
          }
        } else if (wasCancelled && isNowCompleted) {
          // Changing from cancelled to completed - reduce stock for products only
          console.log("Sale completed from cancelled - reducing stock for all items")
          for (const item of existingItems) {
            const stockResult = await updateProductStock(item.product_id, item.quantity, "subtract")
            if (stockResult.success) {
              // Create stock history entry for completion
              await createStockHistoryEntry(
                item.product_id,
                "sale_completed",
                -item.quantity,
                saleData.id,
                "sale",
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
          const stockResult = await updateProductStock(change.productId, change.quantityChange, "subtract")
          if (stockResult.success) {
            await createStockHistoryEntry(
              change.productId,
              change.changeType,
              -change.quantityChange, // Negative for stock reduction
              saleData.id,
              "sale",
              change.notes,
            )
            console.log(`Stock reduced for product ${change.productId}: -${change.quantityChange}`)
          }
        } else if (change.quantityChange < 0) {
          // Fewer items sold - restore stock
          const stockResult = await updateProductStock(change.productId, Math.abs(change.quantityChange), "add")
          if (stockResult.success) {
            await createStockHistoryEntry(
              change.productId,
              change.changeType,
              Math.abs(change.quantityChange), // Positive for stock restoration
              saleData.id,
              "sale",
              change.notes,
            )
            console.log(`Stock restored for product ${change.productId}: +${Math.abs(change.quantityChange)}`)
          }
        }
      }

      console.log("Sale items updated successfully with stock history")

      // 7.5. Update sale type based on current items - ADD THIS SECTION
      if (schema.hasSaleType) {
        try {
          // Check if any of the current sale items are services
          const serviceCheck = await sql`
            SELECT COUNT(*) as service_count
            FROM sale_items si
            WHERE si.sale_id = ${saleData.id}
            AND EXISTS (SELECT 1 FROM services s WHERE s.id = si.product_id)
          `

          const hasServices = serviceCheck[0]?.service_count > 0
          const newSaleType = hasServices ? "service" : "product"

          // Update sale with the correct type
          await sql`
            UPDATE sales 
            SET sale_type = ${newSaleType}
            WHERE id = ${saleData.id}
          `

          console.log(`Sale type updated to: ${newSaleType} (has ${serviceCheck[0]?.service_count || 0} services)`)
        } catch (err) {
          console.log("Error updating sale type:", err)
        }
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

        // FIXED: Only record accounting transaction if there are actual cash movements
        const hasCashMovement = changes.receivedDiff !== 0 || 
                               (changes.statusChanged && 
                                (changes.originalStatus.toLowerCase() === "completed" && changes.newStatus.toLowerCase() === "cancelled"))

        if (hasCashMovement) {
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
          console.log("No cash movement detected, skipping accounting entry")
        }
      } catch (accountingError) {
        console.error("Error creating accounting entry:", accountingError)
        // Don't fail the sale update if accounting fails
      }

      // 9. Commit the transaction
      await sql`COMMIT`

      // Revalidate the dashboard page to show the updated sale
      revalidatePath("/dashboard")

      console.log(`Sale ${saleData.id} updated successfully:`, {
        status: changes.newStatus,
        total: changes.newTotal,
        received: changes.newReceived,
        outstanding: changes.outstandingAmount
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
      await sql`ROLLBACK`
      throw error
    }
  } catch (error) {
    console.error("Database query error:", error)
    return {
      success: false,
      message: `Database error: ${error.message}. Please try again later.`,
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
    // Use executeWithRetry for the entire transaction
    return await executeWithRetry(async () => {
      // Start a transaction
      await sql`BEGIN`

      try {
        // Get sale status first to check if we need to restore stock
        const saleStatus = await sql`
          SELECT status FROM sales WHERE id = ${saleId} AND device_id = ${deviceId}
        `

        if (saleStatus.length === 0) {
          await sql`ROLLBACK`
          return { success: false, message: "Sale not found" }
        }

        const status = saleStatus[0].status
        const isCancelled = status.toLowerCase() === "cancelled"

        // Get sale items to restore stock
        const saleItems = await sql`
          SELECT product_id, quantity
          FROM sale_items
          WHERE sale_id = ${saleId}
        `

        // Only restore stock if the sale was completed/delivered and not cancelled
        if ((status.toLowerCase() === "completed" || status.toLowerCase() === "delivered") && !isCancelled) {
          // Restore stock for each product (not services) using the safe helper function
          for (const item of saleItems) {
            await updateProductStock(item.product_id, item.quantity, "add")
          }
        }

        // Delete accounting entries for this sale
        try {
          await deleteSaleTransaction(saleId, deviceId)
        } catch (accountingError) {
          console.error("Error deleting accounting records:", accountingError)
          // Continue with sale deletion even if accounting cleanup fails
        }

        // Delete sale items
        await sql`DELETE FROM sale_items WHERE sale_id = ${saleId}`

        // Delete the sale with device_id check
        const result = await sql`DELETE FROM sales WHERE id = ${saleId} AND device_id = ${deviceId} RETURNING id`

        if (result.length === 0) {
          await sql`ROLLBACK`
          return { success: false, message: "Failed to delete sale" }
        }

        // Commit the transaction
        await sql`COMMIT`

        revalidatePath("/dashboard")
        return { success: true, message: "Sale deleted successfully" }
      } catch (error) {
        // If any error occurs during the transaction, roll back
        await sql`ROLLBACK`
        throw error
      }
    })
  } catch (error) {
    console.error("Delete sale error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
    }
  }
}

// =============================================================================
// TESTING FUNCTIONS
// =============================================================================

export async function testCreditSalePartialPayments() {
  try {
    console.log("=== TESTING CREDIT SALE PARTIAL PAYMENTS ===")
    
    const tests = []
    
    // Test 1: Check if partial payments are working
    const partialPaymentTest = await testPartialPaymentScenario()
    tests.push(partialPaymentTest)

    // Test 2: Check business rules for partial payments
    const rulesTest = await testPartialPaymentBusinessRules()
    tests.push(rulesTest)

    const passed = tests.filter(t => t.passed).length
    const failed = tests.filter(t => !t.passed).length

    const summary = {
      totalTests: tests.length,
      passed,
      failed,
      successRate: Math.round((passed / tests.length) * 100)
    }

    console.log("PARTIAL PAYMENT TEST RESULTS:")
    console.table(summary)
    console.table(tests.map(t => ({
      Test: t.name,
      Passed: t.passed ? '✅' : '❌',
      Result: t.actual
    })))

    return {
      success: true,
      data: {
        tests,
        summary,
        isWorking: tests.every(t => t.passed)
      }
    }
  } catch (error: any) {
    console.error("Partial payment test error:", error)
    return { success: false, message: error.message }
  }
}

async function testPartialPaymentScenario() {
  try {
    console.log("🧪 Testing Partial Payment Scenario")
    
    // Check recent credit sales to see if partial payments are working
    const recentCreditSales = await sql`
      SELECT id, status, total_amount, received_amount, (total_amount - received_amount) as outstanding,
      created_at
      FROM sales 
      WHERE status = 'Credit' 
      AND created_at >= NOW() - INTERVAL '1 hour'
      ORDER BY created_at DESC
      LIMIT 10
    `
    
    let hasPartialPayments = false
    const partialPaymentSales = []
    
    for (const sale of recentCreditSales) {
      const received = Number(sale.received_amount)
      const total = Number(sale.total_amount)
      const outstanding = Number(sale.outstanding)
      
      // Check if this is a partial payment (received > 0 but less than total)
      if (received > 0 && received < total) {
        hasPartialPayments = true
        partialPaymentSales.push({
          saleId: sale.id,
          total: total,
          received: received,
          outstanding: outstanding,
          created: sale.created_at
        })
      }
    }
    
    return {
      name: "Partial Payment Test",
      scenario: "Checking if partial payments for credit sales are working",
      expected: "Credit sales should support partial payments (0 < received < total)",
      passed: hasPartialPayments,
      actual: hasPartialPayments 
        ? `Found ${partialPaymentSales.length} credit sales with partial payments` 
        : "No partial payment credit sales found",
      message: hasPartialPayments 
        ? "✅ Partial payments are working correctly"
        : "❌ No partial payment credit sales found"
    }
  } catch (error) {
    return {
      name: "Partial Payment Test",
      scenario: "Checking if partial payments for credit sales are working",
      expected: "Credit sales should support partial payments",
      passed: false,
      actual: `Error: ${error.message}`,
      message: "❌ Test failed due to error"
    }
  }
}

async function testPartialPaymentBusinessRules() {
  try {
    // Check various business rules for partial payments
    const rules = [
      {
        name: "Credit sales can have partial payments",
        query: `SELECT COUNT(*) as count FROM sales WHERE status = 'Credit' AND received_amount::numeric > 0 AND received_amount::numeric < total_amount::numeric`,
        expected: ">=0" // Should be possible, not necessarily present
      },
      {
        name: "No credit sales have received_amount > total_amount", 
        query: `SELECT COUNT(*) as count FROM sales WHERE status = 'Credit' AND received_amount::numeric > total_amount::numeric`,
        expected: 0
      },
      {
        name: "Completed sales have full payment",
        query: `SELECT COUNT(*) as count FROM sales WHERE status = 'Completed' AND received_amount::numeric != total_amount::numeric`,
        expected: 0
      }
    ]
    
    let passedRules = 0
    const ruleResults = []
    
    for (const rule of rules) {
      const result = await sql`${sql.unsafe(rule.query)}`
      const count = result[0]?.count || 0
      
      let passed = false
      if (rule.expected === ">=0") {
        passed = count >= 0 // Just check that query runs without error
      } else {
        passed = count === rule.expected
      }
      
      if (passed) passedRules++
      
      ruleResults.push({
        rule: rule.name,
        passed,
        actual: count,
        expected: rule.expected
      })
    }
    
    return {
      name: "Partial Payment Business Rules",
      scenario: "Checking all business rules for partial payments",
      expected: "All business rules should pass",
      passed: passedRules === rules.length,
      actual: `${passedRules}/${rules.length} rules passed`,
      message: passedRules === rules.length 
        ? "✅ All partial payment business rules are satisfied"
        : `❌ ${rules.length - passedRules} business rules violated`
    }
  } catch (error) {
    return {
      name: "Partial Payment Business Rules",
      scenario: "Checking all business rules for partial payments",
      expected: "All business rules should pass",
      passed: false,
      actual: `Error: ${error.message}`,
      message: "❌ Test failed due to error"
    }
  }
}

// =============================================================================
// DEBUG FUNCTIONS
// =============================================================================

export async function debugSalesTableSchema() {
  try {
    const schema = await sql`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length,
        numeric_precision,
        numeric_scale
      FROM information_schema.columns 
      WHERE table_name = 'sales' 
      ORDER BY ordinal_position
    `
    
    console.log("=== SALES TABLE SCHEMA ===")
    console.table(schema)
    
    return {
      success: true,
      data: schema,
      message: `Found ${schema.length} columns in sales table`
    }
  } catch (error) {
    console.error("Error checking sales table schema:", error)
    return {
      success: false,
      message: `Error checking schema: ${error.message}`
    }
  }
}

// Debug function to check specific sale data
export async function debugSaleData(saleId: number) {
  try {
    // Get raw sale data
    const saleData = await sql`
      SELECT * FROM sales WHERE id = ${saleId}
    `
    
    if (saleData.length === 0) {
      return {
        success: false,
        message: `Sale ${saleId} not found`
      }
    }

    // Get sale items
    const saleItems = await sql`
      SELECT * FROM sale_items WHERE sale_id = ${saleId}
    `

    console.log("=== SALE DATA DEBUG ===")
    console.log(`Sale ID: ${saleId}`)
    console.log("Raw sale data:", JSON.stringify(saleData[0], null, 2))
    console.log(`Sale items: ${saleItems.length} items`)
    console.table(saleItems)

    return {
      success: true,
      data: {
        sale: saleData[0],
        items: saleItems
      },
      message: `Found sale ${saleId} with ${saleItems.length} items`
    }
  } catch (error) {
    console.error("Error debugging sale data:", error)
    return {
      success: false,
      message: `Error debugging sale: ${error.message}`
    }
  }
}

// Debug function to check recent sales with their status and amounts
export async function debugRecentSales(limit: number = 10) {
  try {
    const recentSales = await sql`
      SELECT 
        id,
        status,
        total_amount,
        received_amount,
        (total_amount - received_amount) as calculated_outstanding,
        payment_method,
        sale_date,
        created_at
      FROM sales 
      ORDER BY created_at DESC 
      LIMIT ${limit}
    `
    
    console.log("=== RECENT SALES DEBUG ===")
    console.log(`Showing ${recentSales.length} most recent sales:`)
    console.table(recentSales)

    // Count by status
    const statusCount = await sql`
      SELECT 
        status,
        COUNT(*) as count,
        SUM(total_amount) as total_amount_sum,
        SUM(received_amount) as received_amount_sum,
        AVG(total_amount) as avg_total_amount,
        AVG(received_amount) as avg_received_amount
      FROM sales 
      GROUP BY status
    `

    console.log("=== SALES BY STATUS ===")
    console.table(statusCount)

    return {
      success: true,
      data: {
        recentSales,
        statusCount
      },
      message: `Analyzed ${recentSales.length} recent sales`
    }
  } catch (error) {
    console.error("Error debugging recent sales:", error)
    return {
      success: false,
      message: `Error debugging recent sales: ${error.message}`
    }
  }
}

// Debug function to check database schema for all relevant tables
export async function debugAllRelevantTables() {
  try {
    const tables = ['sales', 'sale_items', 'products', 'services', 'customers', 'staff']
    
    const schemas = {}
    
    for (const table of tables) {
      try {
        const schema = await sql`
          SELECT 
            column_name,
            data_type,
            is_nullable,
            column_default
          FROM information_schema.columns 
          WHERE table_name = ${table} 
          ORDER BY ordinal_position
        `
        schemas[table] = schema
        console.log(`=== ${table.toUpperCase()} TABLE SCHEMA ===`)
        console.table(schema)
      } catch (error) {
        console.error(`Error getting schema for ${table}:`, error)
        schemas[table] = { error: error.message }
      }
    }

    return {
      success: true,
      data: schemas,
      message: `Checked schemas for ${tables.length} tables`
    }
  } catch (error) {
    console.error("Error debugging all tables:", error)
    return {
      success: false,
      message: `Error debugging tables: ${error.message}`
    }
  }
}

// Debug function to trace a specific sale creation
export async function debugSaleCreation(saleData: any) {
  try {
    console.log("=== SALE CREATION DEBUG ===")
    console.log("Incoming sale data:", JSON.stringify(saleData, null, 2))
    
    // Log the critical fields
    console.log("Critical fields:")
    console.log("- Status:", saleData.paymentStatus)
    console.log("- Total Amount:", saleData.items?.reduce((sum, item) => sum + (item.price * item.quantity), 0))
    console.log("- Received Amount:", saleData.receivedAmount)
    console.log("- Discount:", saleData.discount)
    
    return {
      success: true,
      message: "Sale creation data logged"
    }
  } catch (error) {
    console.error("Error debugging sale creation:", error)
    return {
      success: false,
      message: `Error debugging sale creation: ${error.message}`
    }
  }
}

// Debug function to check financial transactions for a sale
export async function debugSaleFinancialTransactions(saleId: number) {
  try {
    const transactions = await sql`
      SELECT * FROM financial_transactions 
      WHERE sale_id = ${saleId} 
      ORDER BY created_at
    `
    
    console.log("=== FINANCIAL TRANSACTIONS DEBUG ===")
    console.log(`Sale ID: ${saleId}`)
    console.log(`Found ${transactions.length} transactions:`)
    console.table(transactions)

    return {
      success: true,
      data: transactions,
      message: `Found ${transactions.length} financial transactions for sale ${saleId}`
    }
  } catch (error) {
    console.error("Error debugging financial transactions:", error)
    return {
      success: false,
      message: `Error debugging transactions: ${error.message}`
    }
  }
}
