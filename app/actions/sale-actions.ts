"use server"

import { sql, getLastError, resetConnectionState, executeWithRetry } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { recordSaleTransaction, recordSaleAdjustment, deleteSaleTransaction } from "./simplified-accounting"

const CACHE_DURATION = 60000 // 1 minute
let schemaCache: any = null

// Enhanced status mapping for stock impact
const STOCK_IMPACT_STATUS = {
  completed: { affectsStock: true, reduces: true },
  delivered: { affectsStock: true, reduces: true },
  paid: { affectsStock: true, reduces: true },
  credit: { affectsStock: true, reduces: true }, // Credit sales still reduce stock
  partial: { affectsStock: true, reduces: true }, // Partial payments still reduce stock
  pending: { affectsStock: false, reduces: false }, // Pending doesn't affect stock
  cancelled: { affectsStock: false, reduces: false }, // Cancelled doesn't affect stock
  returned: { affectsStock: false, reduces: false }, // Returned restores stock
  refunded: { affectsStock: false, reduces: false }, // Refunded restores stock
}

// Enhanced payment method mapping for stock history
const PAYMENT_METHOD_LABELS = {
  cash: 'Cash',
  card: 'Card',
  credit_card: 'Credit Card',
  debit_card: 'Debit Card',
  online: 'Online',
  upi: 'UPI',
  bank_transfer: 'Bank Transfer',
  cheque: 'Cheque',
  wallet: 'Digital Wallet',
  mixed: 'Mixed Payment'
}

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

// Ensures the stock history table exists with the correct structure
async function ensureStockHistoryTable() {
  try {
    // Create the main stock history table
    await sql`
      CREATE TABLE IF NOT EXISTS product_stock_history (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        type VARCHAR(50) NOT NULL,
        reference_id INTEGER,
        reference_type VARCHAR(50),
        notes TEXT,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `

    // Add missing columns if they don't exist
    await sql`ALTER TABLE product_stock_history ADD COLUMN IF NOT EXISTS change_type VARCHAR(50)`
    await sql`ALTER TABLE product_stock_history ADD COLUMN IF NOT EXISTS quantity_change INTEGER`
    await sql`ALTER TABLE product_stock_history ADD COLUMN IF NOT EXISTS sale_id INTEGER`
    await sql`ALTER TABLE product_stock_history ADD COLUMN IF NOT EXISTS purchase_id INTEGER`
    await sql`ALTER TABLE product_stock_history ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)`
    await sql`ALTER TABLE product_stock_history ADD COLUMN IF NOT EXISTS sale_status VARCHAR(50)`

    console.log("Stock history table structure ensured")
  } catch (error) {
    console.error("Error ensuring stock history table:", error)
  }
}

// Enhanced helper function to determine if a status should affect stock
function shouldAffectStock(status: string): { affectsStock: boolean; reduces: boolean } {
  const statusLower = status?.toLowerCase() || 'completed'
  return STOCK_IMPACT_STATUS[statusLower] || { affectsStock: true, reduces: true }
}

// Enhanced helper function to safely update product stock with comprehensive validation
async function updateProductStock(productId: number, quantityChange: number, operation: "subtract" | "add", context?: string) {
  try {
    // First, verify this is actually a product (not a service)
    const productCheck = await sql`
      SELECT id, name, stock FROM products WHERE id = ${productId}
    `

    if (productCheck.length === 0) {
      console.log(`Skipping stock update for ID ${productId} - not found in products table (likely a service)`)
      return { success: true, message: "Item is not a product, stock update skipped", isService: true }
    }

    const product = productCheck[0]
    const currentStock = Number(product.stock)

    if (operation === "subtract") {
      // Check if we have enough stock
      if (currentStock < quantityChange) {
        console.warn(
          `Insufficient stock for product ${product.name}: ${currentStock} available, ${quantityChange} requested (Context: ${context || 'Unknown'})`
        )
        // Don't fail the sale, just log the warning and allow negative stock
      }

      await sql`
        UPDATE products 
        SET stock = stock - ${quantityChange}
        WHERE id = ${productId}
      `
      console.log(`Stock updated for product ${product.name}: ${currentStock} -> ${currentStock - quantityChange} (${context || 'Stock reduction'})`)
    } else {
      await sql`
        UPDATE products 
        SET stock = stock + ${quantityChange}
        WHERE id = ${productId}
      `
      console.log(`Stock restored for product ${product.name}: ${currentStock} -> ${currentStock + quantityChange} (${context || 'Stock restoration'})`)
    }

    return { success: true, message: "Stock updated successfully", isService: false }
  } catch (error) {
    console.error(`Error updating stock for product ${productId}:`, error)
    return { success: false, message: error.message, isService: false }
  }
}

// Enhanced createStockHistoryEntry function with comprehensive tracking
async function createStockHistoryEntry(
  productId: number,
  changeType: string,
  quantity: number,
  referenceId: number,
  referenceType: string,
  notes?: string,
  userId?: number,
  paymentMethod?: string,
  saleStatus?: string,
  additionalContext?: any
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

    const productName = productCheck[0].name

    // Ensure the stock history table exists
    await ensureStockHistoryTable()

    // Enhanced notes with more context
    let enhancedNotes = notes || ""
    if (paymentMethod) {
      const methodLabel = PAYMENT_METHOD_LABELS[paymentMethod.toLowerCase()] || paymentMethod
      enhancedNotes += ` | Payment: ${methodLabel}`
    }
    if (saleStatus) {
      enhancedNotes += ` | Status: ${saleStatus.charAt(0).toUpperCase() + saleStatus.slice(1)}`
    }
    if (additionalContext?.customerName) {
      enhancedNotes += ` | Customer: ${additionalContext.customerName}`
    }

    // Insert stock history entry with enhanced data
    await sql`
      INSERT INTO product_stock_history (
        product_id, 
        quantity, 
        type, 
        reference_id, 
        reference_type, 
        notes, 
        created_by,
        created_at,
        payment_method,
        sale_status
      )
      VALUES (
        ${productId}, 
        ${Math.abs(quantity)}, 
        ${changeType}, 
        ${referenceId}, 
        ${referenceType}, 
        ${enhancedNotes}, 
        ${userId || null},
        ${new Date()},
        ${paymentMethod || null},
        ${saleStatus || null}
      )
    `

    console.log(
      `Stock history created for product ${productName} (ID: ${productId}): ${changeType} ${Math.abs(quantity)} units (${referenceType} #${referenceId})`
    )
    return { success: true, message: "Stock history created successfully" }
  } catch (error) {
    console.error(`Error creating stock history for product ${productId}:`, error)
    return { success: false, message: error.message }
  }
}

// Enhanced function to handle stock changes based on status and payment method
async function handleStockChange(
  items: any[],
  saleId: number,
  status: string,
  paymentMethod: string,
  operation: 'create' | 'update' | 'delete',
  userId?: number,
  previousStatus?: string,
  customerName?: string
) {
  const statusImpact = shouldAffectStock(status)
  const previousStatusImpact = previousStatus ? shouldAffectStock(previousStatus) : null

  console.log(`Handling stock change - Operation: ${operation}, Status: ${status} (affects: ${statusImpact.affectsStock}), Payment: ${paymentMethod}`)

  for (const item of items) {
    try {
      let shouldUpdateStock = false
      let stockOperation: 'add' | 'subtract' = 'subtract'
      let historyType = 'sale'
      let historyNotes = ''

      if (operation === 'create') {
        // New sale creation
        if (statusImpact.affectsStock && statusImpact.reduces) {
          shouldUpdateStock = true
          stockOperation = 'subtract'
          historyType = getStockHistoryType('sale', status, paymentMethod)
          historyNotes = `New sale created - ${status} via ${paymentMethod}`
        } else if (status.toLowerCase() === 'pending') {
          // Create history entry for pending sales but don't affect stock
          historyType = 'sale_pending'
          historyNotes = `Sale created as pending - no stock impact yet`
        } else {
          // Create history entry for other statuses that don't affect stock
          historyType = getStockHistoryType('sale', status, paymentMethod)
          historyNotes = `Sale created with status ${status} - no immediate stock impact`
        }
      } else if (operation === 'update') {
        // Sale status change
        const wasAffecting = previousStatusImpact?.affectsStock && previousStatusImpact?.reduces
        const nowAffecting = statusImpact.affectsStock && statusImpact.reduces

        if (!wasAffecting && nowAffecting) {
          // Status changed from non-affecting to affecting (e.g., pending -> completed)
          shouldUpdateStock = true
          stockOperation = 'subtract'
          historyType = getStockHistoryType('sale_status_changed', status, paymentMethod)
          historyNotes = `Status changed from ${previousStatus} to ${status} - stock reduced`
        } else if (wasAffecting && !nowAffecting) {
          // Status changed from affecting to non-affecting (e.g., completed -> cancelled)
          shouldUpdateStock = true
          stockOperation = 'add'
          historyType = getStockHistoryType('sale_returned', status, paymentMethod)
          historyNotes = `Status changed from ${previousStatus} to ${status} - stock restored`
        } else if (!wasAffecting && !nowAffecting) {
          // Neither status affects stock (e.g., pending -> cancelled)
          historyType = getStockHistoryType('sale_status_changed', status, paymentMethod)
          historyNotes = `Status changed from ${previousStatus} to ${status} - no stock impact`
        } else {
          // Both statuses affect stock - just log the change without stock adjustment
          historyType = getStockHistoryType('sale_status_changed', status, paymentMethod)
          historyNotes = `Status changed from ${previousStatus} to ${status} - both affect stock equally`
        }
      } else if (operation === 'delete') {
        // Sale deletion - restore stock if the deleted sale was affecting stock
        if (statusImpact.affectsStock && statusImpact.reduces) {
          shouldUpdateStock = true
          stockOperation = 'add'
          historyType = 'sale_deleted'
          historyNotes = `Sale deleted - stock restored`
        } else {
          historyType = 'sale_deleted'
          historyNotes = `Sale deleted - no stock impact (was ${status})`
        }
      }

      // Update stock if needed
      if (shouldUpdateStock) {
        const stockResult = await updateProductStock(
          item.productId || item.product_id,
          item.quantity,
          stockOperation,
          `${operation}: ${previousStatus || 'N/A'} -> ${status}`
        )

        if (stockResult.success && !stockResult.isService) {
          // Create stock history entry
          await createStockHistoryEntry(
            item.productId || item.product_id,
            historyType,
            stockOperation === 'subtract' ? -item.quantity : item.quantity,
            saleId,
            'sale',
            historyNotes,
            userId,
            paymentMethod,
            status,
            { customerName }
          )
        }
      } else {
        // Create stock history entry without stock update (for tracking purposes)
        await createStockHistoryEntry(
          item.productId || item.product_id,
          historyType,
          0, // No quantity change
          saleId,
          'sale',
          historyNotes,
          userId,
          paymentMethod,
          status,
          { customerName }
        )
      }
    } catch (error) {
      console.error(`Error handling stock change for item ${item.productId || item.product_id}:`, error)
    }
  }
}

// Helper function to get appropriate stock history type based on status and payment method
function getStockHistoryType(baseType: string, status: string, paymentMethod?: string): string {
  const statusLower = status?.toLowerCase() || 'completed'

  switch (statusLower) {
    case 'completed':
    case 'paid':
    case 'delivered':
      return baseType === 'sale' ? 'sale_completed' : baseType
    case 'pending':
      return 'sale_pending'
    case 'cancelled':
      return baseType.includes('returned') ? 'sale_cancelled' : 'sale_cancelled'
    case 'returned':
    case 'refunded':
      return 'sale_returned'
    case 'credit':
    case 'partial':
      return baseType === 'sale' ? 'sale_credit' : baseType
    default:
      return baseType
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

  resetConnectionState()

  try {
    let sales

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

  resetConnectionState()

  try {
    const schema = await getSchemaInfo()

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

    // Add calculated values to sale data
    const saleData = {
      ...saleResult[0],
      discount: discountValue,
      subtotal: subtotal,
    }

    console.log("Sale details fetched successfully:", {
      saleId,
      customerName: saleData.customer_name,
      itemsCount: itemsResult.length,
      totalAmount: saleData.total_amount,
      discount: discountValue,
      status: saleData.status,
      paymentMethod: saleData.payment_method
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

// Enhanced addSale function with comprehensive stock handling
export async function addSale(saleData: any) {
  try {
    console.log("Adding sale with comprehensive stock tracking:", JSON.stringify(saleData, null, 2))

    const schema = await getSchemaInfo()
    await ensureStockHistoryTable()

    await sql`BEGIN`

    try {
      // Calculate totals
      const subtotal = saleData.items.reduce(
        (sum: number, item: any) => sum + Number.parseFloat(item.price) * Number.parseInt(item.quantity),
        0,
      )
      const discountAmount = Number(saleData.discount) || 0
      const total = Math.max(0, subtotal - discountAmount)
      const status = saleData.paymentStatus || "completed"
      const paymentMethod = saleData.paymentMethod || "cash"

      // Handle received amount based on status
      let receivedAmount = 0
      if (status.toLowerCase() === "completed" || status.toLowerCase() === "paid") {
        receivedAmount = total
      } else if (status.toLowerCase() === "cancelled") {
        receivedAmount = 0
      } else if (status.toLowerCase() === "credit" || status.toLowerCase() === "partial") {
        receivedAmount = Number(saleData.receivedAmount) || 0
        if (receivedAmount > total) {
          await sql`ROLLBACK`
          return {
            success: false,
            message: `Received amount (${receivedAmount}) cannot be greater than total amount (${total})`,
          }
        }
      } else if (status.toLowerCase() === "pending") {
        receivedAmount = Number(saleData.receivedAmount) || 0
      }

      const outstandingAmount = total - receivedAmount

      // Add missing columns if they don't exist
      if (!schema.hasDeviceId) {
        await sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS device_id INTEGER`
        schema.hasDeviceId = true
      }
      if (!schema.hasReceivedAmount) {
        await sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS received_amount DECIMAL(12,2) DEFAULT 0`
        schema.hasReceivedAmount = true
      }
      if (!schema.hasStaffId) {
        await sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS staff_id INTEGER`
        schema.hasStaffId = true
      }
      if (!schema.hasSaleType) {
        await sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_type VARCHAR(20) DEFAULT 'product'`
        schema.hasSaleType = true
      }

      // Build INSERT query based on available columns
      let saleResult
      if (schema.hasDeviceId && schema.hasPaymentMethod && schema.hasDiscount && schema.hasReceivedAmount && schema.hasStaffId && saleData.staffId) {
        saleResult = await sql`
          INSERT INTO sales (customer_id, created_by, total_amount, status, sale_date, device_id, payment_method, discount, received_amount, staff_id) 
          VALUES (${saleData.customerId || null}, ${saleData.userId}, ${total}, ${status}, ${saleData.saleDate || new Date()}, ${saleData.deviceId}, ${paymentMethod}, ${discountAmount}, ${receivedAmount}, ${saleData.staffId}) 
          RETURNING *
        `
      } else if (schema.hasDeviceId && schema.hasPaymentMethod && schema.hasDiscount && schema.hasReceivedAmount) {
        saleResult = await sql`
          INSERT INTO sales (customer_id, created_by, total_amount, status, sale_date, device_id, payment_method, discount, received_amount) 
          VALUES (${saleData.customerId || null}, ${saleData.userId}, ${total}, ${status}, ${saleData.saleDate || new Date()}, ${saleData.deviceId}, ${paymentMethod}, ${discountAmount}, ${receivedAmount}) 
          RETURNING *
        `
      } else if (schema.hasDeviceId && schema.hasPaymentMethod && schema.hasDiscount) {
        saleResult = await sql`
          INSERT INTO sales (customer_id, created_by, total_amount, status, sale_date, device_id, payment_method, discount) 
          VALUES (${saleData.customerId || null}, ${saleData.userId}, ${total}, ${status}, ${saleData.saleDate || new Date()}, ${saleData.deviceId}, ${paymentMethod}, ${discountAmount}) 
          RETURNING *
        `
      } else if (schema.hasDeviceId && schema.hasPaymentMethod) {
        saleResult = await sql`
          INSERT INTO sales (customer_id, created_by, total_amount, status, sale_date, device_id, payment_method) 
          VALUES (${saleData.customerId || null}, ${saleData.userId}, ${total}, ${status}, ${saleData.saleDate || new Date()}, ${saleData.deviceId}, ${paymentMethod}) 
          RETURNING *
        `
      } else if (schema.hasDeviceId) {
        saleResult = await sql`
          INSERT INTO sales (customer_id, created_by, total_amount, status, sale_date, device_id) 
          VALUES (${saleData.customerId || null}, ${saleData.userId}, ${total}, ${status}, ${saleData.saleDate || new Date()}, ${saleData.deviceId}) 
          RETURNING *
        `
      } else {
        // Fallback for basic columns
        saleResult = await sql`
          INSERT INTO sales (customer_id, created_by, total_amount, status, sale_date) 
          VALUES (${saleData.customerId || null}, ${saleData.userId}, ${total}, ${status}, ${saleData.saleDate || new Date()}) 
          RETURNING *
        `
      }

      const sale = saleResult[0]
      const saleId = sale.id

      // Get customer name for enhanced tracking
      let customerName = null
      if (saleData.customerId) {
        try {
          const customerResult = await sql`SELECT name FROM customers WHERE id = ${saleData.customerId}`
          if (customerResult.length > 0) {
            customerName = customerResult[0].name
          }
        } catch (err) {
          console.log("Could not fetch customer name:", err)
        }
      }

      // Insert sale items and validate existence
      const saleItems = []
      for (const item of saleData.items) {
        // Validate that the product/service exists
        let itemExists = false
        let isService = false
        let itemName = "Unknown Item"

        try {
          const productCheck = await sql`SELECT id, name FROM products WHERE id = ${item.productId}`
          if (productCheck.length > 0) {
            itemExists = true
            isService = false
            itemName = productCheck[0].name
          } else {
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

        // Check and add missing columns in sale_items table
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

        // Insert sale item
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

          itemResult[0].product_name = itemName
          itemResult[0].item_type = isService ? "service" : "product"
          saleItems.push(itemResult[0])

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

      // Handle comprehensive stock changes based on status and payment method
      console.log(`Processing stock changes for new sale - Status: ${status}, Payment: ${paymentMethod}`)
      await handleStockChange(
        saleData.items,
        saleId,
        status,
        paymentMethod,
        'create',
        saleData.userId,
        undefined,
        customerName
      )

      // Determine and update sale type
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

          await sql`
            UPDATE sales 
            SET sale_type = ${saleType}
            WHERE id = ${saleId}
          `
        } catch (err) {
          console.log("Error determining sale type, defaulting to product type")
        }
      }

      // Calculate COGS and record accounting transaction
      const cogsAmount = await calculateCOGS(saleData.items)

      try {
        console.log("Recording accounting transaction for sale:", saleId, "with status:", status)

        const accountingResult = await recordSaleTransaction({
          saleId,
          totalAmount: total,
          cogsAmount,
          receivedAmount,
          outstandingAmount,
          status: status,
          paymentMethod: paymentMethod,
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
      }

      await sql`COMMIT`
      revalidatePath("/dashboard")

      console.log(`Sale ${saleId} created successfully with ${saleItems.length} items (${saleType} sale)`)

      return {
        success: true,
        message: "Sale added successfully",
        data: {
          sale: { ...sale, discount: discountAmount, received_amount: receivedAmount },
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

// Enhanced helper function to calculate all changes in one place
function calculateSaleChanges(original: any, newData: any, originalItems: any[], newItems: any[]) {
  const subtotal = newData.items.reduce(
    (sum: number, item: any) => sum + Number.parseFloat(item.price) * Number.parseInt(item.quantity),
    0,
  )
  const newDiscountAmount = Number(newData.discount) || 0
  const newTotal = Math.max(0, subtotal - newDiscountAmount)
  const newStatus = newData.paymentStatus || "completed"
  const newPaymentMethod = newData.paymentMethod || "cash"

  // Calculate new received amount based on status
  let newReceivedAmount = 0
  if (newStatus.toLowerCase() === "completed" || newStatus.toLowerCase() === "paid") {
    newReceivedAmount = newTotal
  } else if (newStatus.toLowerCase() === "cancelled") {
    newReceivedAmount = 0
  } else if (newStatus.toLowerCase() === "credit" || newStatus.toLowerCase() === "partial") {
    newReceivedAmount = Number(newData.receivedAmount) || 0
  } else if (newStatus.toLowerCase() === "pending") {
    newReceivedAmount = Number(newData.receivedAmount) || 0
  }

  // Calculate original values
  const originalSubtotal = originalItems.reduce(
    (sum: number, item: any) => sum + Number(item.price) * Number(item.quantity),
    0,
  )
  const originalTotal = Number(original.total_amount)
  const originalDiscountAmount = Math.max(0, originalSubtotal - originalTotal)
  const originalStatus = original.status || "completed"
  const originalPaymentMethod = original.payment_method || "cash"

  console.log("Enhanced change calculation:", {
    originalStatus, newStatus,
    originalPaymentMethod, newPaymentMethod,
    originalTotal, newTotal,
    originalDiscount: originalDiscountAmount, newDiscount: newDiscountAmount,
    statusChanged: originalStatus !== newStatus,
    paymentMethodChanged: originalPaymentMethod !== newPaymentMethod
  })

  return {
    // Basic changes
    dateChanged: new Date(original.sale_date).getTime() !== new Date(newData.saleDate).getTime(),
    statusChanged: originalStatus !== newStatus,
    paymentMethodChanged: originalPaymentMethod !== newPaymentMethod,
    totalChanged: originalTotal !== newTotal,
    discountChanged: originalDiscountAmount !== newDiscountAmount,
    receivedChanged: Number(original.received_amount || 0) !== newReceivedAmount,
    itemsChanged: JSON.stringify(originalItems.map(i => ({id: i.id, productId: i.product_id, quantity: i.quantity, price: i.price}))) !== JSON.stringify(newItems.map(i => ({id: i.id, productId: i.productId, quantity: i.quantity, price: i.price}))),

    // Values
    originalDate: new Date(original.sale_date),
    newDate: new Date(newData.saleDate),
    originalStatus: originalStatus,
    newStatus: newStatus,
    originalPaymentMethod: originalPaymentMethod,
    newPaymentMethod: newPaymentMethod,
    originalTotal: originalTotal,
    newTotal: newTotal,
    originalDiscount: originalDiscountAmount,
    newDiscount: newDiscountAmount,
    originalReceived: Number(original.received_amount || 0),
    newReceived: newReceivedAmount,

    // Differences
    totalDiff: newTotal - originalTotal,
    discountDiff: newDiscountAmount - originalDiscountAmount,
    receivedDiff: newReceivedAmount - Number(original.received_amount || 0),
    outstandingAmount: newTotal - newReceivedAmount,
  }
}

// Enhanced function to handle item-level stock changes during updates
async function handleItemStockChanges(
  originalItems: any[],
  newItems: any[],
  saleId: number,
  saleStatus: string,
  paymentMethod: string,
  userId: number,
  customerName?: string
) {
  const statusImpact = shouldAffectStock(saleStatus)
  
  // Only process stock changes if the current status should affect stock
  if (!statusImpact.affectsStock || !statusImpact.reduces) {
    console.log(`Skipping item stock changes - status ${saleStatus} doesn't affect stock`)
    return
  }

  const existingItemMap = new Map()
  for (const item of originalItems) {
    existingItemMap.set(item.id, {
      productId: item.product_id,
      quantity: item.quantity,
    })
  }

  const processedItemIds = new Set()

  // Process updated and new items
  for (const item of newItems) {
    if (item.id) {
      // Update existing item - check for quantity changes
      const existingItem = existingItemMap.get(item.id)
      if (existingItem) {
        const quantityDiff = item.quantity - existingItem.quantity

        if (quantityDiff !== 0) {
          if (quantityDiff > 0) {
            // More items sold - reduce stock further
            const stockResult = await updateProductStock(
              item.productId, 
              quantityDiff, 
              "subtract",
              `Item quantity increased: ${existingItem.quantity} -> ${item.quantity}`
            )
            if (stockResult.success && !stockResult.isService) {
              await createStockHistoryEntry(
                item.productId,
                "sale_item_increased",
                -quantityDiff,
                saleId,
                "sale",
                `Sale #${saleId} item quantity increased from ${existingItem.quantity} to ${item.quantity}`,
                userId,
                paymentMethod,
                saleStatus,
                { customerName }
              )
            }
          } else {
            // Fewer items sold - restore stock
            const stockResult = await updateProductStock(
              item.productId, 
              Math.abs(quantityDiff), 
              "add",
              `Item quantity decreased: ${existingItem.quantity} -> ${item.quantity}`
            )
            if (stockResult.success && !stockResult.isService) {
              await createStockHistoryEntry(
                item.productId,
                "sale_item_decreased", 
                Math.abs(quantityDiff),
                saleId,
                "sale",
                `Sale #${saleId} item quantity decreased from ${existingItem.quantity} to ${item.quantity}`,
                userId,
                paymentMethod,
                saleStatus,
                { customerName }
              )
            }
          }
        }
      }
      processedItemIds.add(item.id)
    } else {
      // New item added - reduce stock
      const stockResult = await updateProductStock(
        item.productId, 
        item.quantity, 
        "subtract",
        `New item added to sale`
      )
      if (stockResult.success && !stockResult.isService) {
        await createStockHistoryEntry(
          item.productId,
          "sale_item_added",
          -item.quantity,
          saleId,
          "sale",
          `New item added to Sale #${saleId}`,
          userId,
          paymentMethod,
          saleStatus,
          { customerName }
        )
      }
    }
  }

  // Handle deleted items
  for (const [itemId, itemData] of existingItemMap.entries()) {
    if (!processedItemIds.has(itemId)) {
      // Item was removed - restore stock
      const stockResult = await updateProductStock(
        itemData.productId, 
        itemData.quantity, 
        "add",
        `Item removed from sale`
      )
      if (stockResult.success && !stockResult.isService) {
        await createStockHistoryEntry(
          itemData.productId,
          "sale_item_removed",
          itemData.quantity,
          saleId,
          "sale",
          `Item removed from Sale #${saleId} - stock restored`,
          userId,
          paymentMethod,
          saleStatus,
          { customerName }
        )
      }
    }
  }
}

// Consolidated and enhanced updateSale function
export async function updateSale(saleData: any) {
  try {
    console.log("Updating sale with enhanced stock tracking:", JSON.stringify(saleData, null, 2))

    await ensureStockHistoryTable()
    await sql`BEGIN`

    try {
      // Get the original sale
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

      // Get customer name for enhanced tracking
      let customerName = null
      if (saleData.customerId) {
        try {
          const customerResult = await sql`SELECT name FROM customers WHERE id = ${saleData.customerId}`
          if (customerResult.length > 0) {
            customerName = customerResult[0].name
          }
        } catch (err) {
          console.log("Could not fetch customer name:", err)
        }
      }

      // Calculate all changes in one place
      const changes = calculateSaleChanges(original, saleData, originalItems, saleData.items)

      // Check if there are any actual changes
      const hasActualChanges =
        changes.dateChanged ||
        changes.statusChanged ||
        changes.paymentMethodChanged ||
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
          },
        }
      }

      // Validate received amount for credit sales
      if (changes.newStatus.toLowerCase() === "credit" && changes.newReceived > changes.newTotal) {
        await sql`ROLLBACK`
        return {
          success: false,
          message: `Received amount (${changes.newReceived}) cannot be greater than total amount (${changes.newTotal})`,
        }
      }

      // Check and add missing columns if needed
      const schema = await getSchemaInfo()
      if (!schema.hasDeviceId) {
        await sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS device_id INTEGER`
        schema.hasDeviceId = true
      }
      if (!schema.hasReceivedAmount) {
        await sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS received_amount DECIMAL(12,2) DEFAULT 0`
        schema.hasReceivedAmount = true
      }
      if (!schema.hasStaffId) {
        await sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS staff_id INTEGER`
        schema.hasStaffId = true
      }

      // Update the sale record
      if (saleData.deviceId) {
        if (schema.hasPaymentMethod && schema.hasDiscount && schema.hasReceivedAmount && schema.hasStaffId && saleData.staffId) {
          await sql`
            UPDATE sales 
            SET customer_id = ${saleData.customerId || null}, total_amount = ${changes.newTotal}, status = ${changes.newStatus}, sale_date = ${changes.newDate}, updated_at = ${new Date()}, payment_method = ${changes.newPaymentMethod}, discount = ${changes.newDiscount}, received_amount = ${changes.newReceived}, staff_id = ${saleData.staffId}
            WHERE id = ${saleData.id} AND device_id = ${saleData.deviceId}
          `
        } else if (schema.hasPaymentMethod && schema.hasDiscount && schema.hasReceivedAmount) {
          await sql`
            UPDATE sales 
            SET customer_id = ${saleData.customerId || null}, total_amount = ${changes.newTotal}, status = ${changes.newStatus}, sale_date = ${changes.newDate}, updated_at = ${new Date()}, payment_method = ${changes.newPaymentMethod}, discount = ${changes.newDiscount}, received_amount = ${changes.newReceived}
            WHERE id = ${saleData.id} AND device_id = ${saleData.deviceId}
          `
        } else if (schema.hasPaymentMethod && schema.hasDiscount) {
          await sql`
            UPDATE sales 
            SET customer_id = ${saleData.customerId || null}, total_amount = ${changes.newTotal}, status = ${changes.newStatus}, sale_date = ${changes.newDate}, updated_at = ${new Date()}, payment_method = ${changes.newPaymentMethod}, discount = ${changes.newDiscount}
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
        // Similar logic without device_id constraint
        if (schema.hasPaymentMethod && schema.hasDiscount && schema.hasReceivedAmount && schema.hasStaffId && saleData.staffId) {
          await sql`
            UPDATE sales 
            SET customer_id = ${saleData.customerId || null}, total_amount = ${changes.newTotal}, status = ${changes.newStatus}, sale_date = ${changes.newDate}, updated_at = ${new Date()}, payment_method = ${changes.newPaymentMethod}, discount = ${changes.newDiscount}, received_amount = ${changes.newReceived}, staff_id = ${saleData.staffId}
            WHERE id = ${saleData.id}
          `
        } else if (schema.hasPaymentMethod && schema.hasDiscount && schema.hasReceivedAmount) {
          await sql`
            UPDATE sales 
            SET customer_id = ${saleData.customerId || null}, total_amount = ${changes.newTotal}, status = ${changes.newStatus}, sale_date = ${changes.newDate}, updated_at = ${new Date()}, payment_method = ${changes.newPaymentMethod}, discount = ${changes.newDiscount}, received_amount = ${changes.newReceived}
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

      // Handle comprehensive stock changes based on status change
      if (changes.statusChanged) {
        console.log(`Processing status change: ${changes.originalStatus} -> ${changes.newStatus}`)
        await handleStockChange(
          originalItems.map(item => ({ productId: item.product_id, quantity: item.quantity })),
          saleData.id,
          changes.newStatus,
          changes.newPaymentMethod,
          'update',
          saleData.userId,
          changes.originalStatus,
          customerName
        )
      }

      // Update sale items and handle item-level stock changes
      console.log("Processing sale items changes...")
      
      const existingItemMap = new Map()
      for (const item of originalItems) {
        existingItemMap.set(item.id, {
          productId: item.product_id,
          quantity: item.quantity,
        })
      }

      const processedItemIds = new Set()

      // Update or insert each sale item
      for (const item of saleData.items) {
        if (item.id) {
          // Update existing item
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
          await sql`DELETE FROM sale_items WHERE id = ${itemId}`
        }
      }

      // Handle item-level stock changes only if items changed and status affects stock
      if (changes.itemsChanged) {
        console.log("Processing item-level stock changes...")
        await handleItemStockChanges(
          originalItems,
          saleData.items,
          saleData.id,
          changes.newStatus,
          changes.newPaymentMethod,
          saleData.userId,
          customerName
        )
      }

      // Update sale type based on current items
      if (schema.hasSaleType) {
        try {
          const serviceCheck = await sql`
            SELECT COUNT(*) as service_count
            FROM sale_items si
            WHERE si.sale_id = ${saleData.id}
            AND EXISTS (SELECT 1 FROM services s WHERE s.id = si.product_id)
          `

          const hasServices = serviceCheck[0]?.service_count > 0
          const newSaleType = hasServices ? "service" : "product"

          await sql`
            UPDATE sales 
            SET sale_type = ${newSaleType}
            WHERE id = ${saleData.id}
          `

          console.log(`Sale type updated to: ${newSaleType}`)
        } catch (err) {
          console.log("Error updating sale type:", err)
        }
      }

      // Calculate COGS and create accounting entry
      const originalCogs = await calculateCOGS([], saleData.id)
      const newCogs = await calculateCOGS(saleData.items)

      try {
        let adjustmentDescription = `Sale #${saleData.id} updated with changes`
        
        if (changes.statusChanged) {
          adjustmentDescription = `Sale #${saleData.id} status changed: ${changes.originalStatus} -> ${changes.newStatus}`
          if (changes.originalStatus.toLowerCase() === "completed" && changes.newStatus.toLowerCase() === "cancelled") {
            adjustmentDescription += " (RETURNED - Stock restored)"
          }
        }

        const accountingResult = await recordSaleAdjustment({
          saleId: saleData.id,
          changeType: "consolidated_edit",
          previousValues: {
            totalAmount: changes.originalTotal,
            receivedAmount: changes.originalReceived,
            status: changes.originalStatus,
            cogsAmount: originalCogs,
            discount: changes.originalDiscount,
            paymentMethod: changes.originalPaymentMethod,
          },
          newValues: {
            totalAmount: changes.newTotal,
            cogsAmount: newCogs,
            receivedAmount: changes.newReceived,
            outstandingAmount: changes.outstandingAmount,
            status: changes.newStatus,
            customerId: saleData.customerId,
            discount: changes.newDiscount,
            paymentMethod: changes.newPaymentMethod,
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
      } catch (accountingError) {
        console.error("Error creating accounting entry:", accountingError)
      }

      await sql`COMMIT`
      revalidatePath("/dashboard")

      return {
        success: true,
        message: "Sale updated successfully",
        data: {
          discount: changes.newDiscount,
          received_amount: changes.newReceived,
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

// Enhanced deleteSale function with comprehensive stock restoration
export async function deleteSale(saleId: number, deviceId: number) {
  if (!saleId || !deviceId) {
    return { success: false, message: "Sale ID and Device ID are required" }
  }

  resetConnectionState()

  try {
    await ensureStockHistoryTable()
    
    return await executeWithRetry(async () => {
      await sql`BEGIN`

      try {
        // Get sale information
        const saleInfo = await sql`
          SELECT s.*, c.name as customer_name FROM sales s
          LEFT JOIN customers c ON s.customer_id = c.id
          WHERE s.id = ${saleId} AND s.device_id = ${deviceId}
        `

        if (saleInfo.length === 0) {
          await sql`ROLLBACK`
          return { success: false, message: "Sale not found" }
        }

        const sale = saleInfo[0]
        const status = sale.status
        const paymentMethod = sale.payment_method || "cash"
        const userId = sale.created_by
        const customerName = sale.customer_name

        // Get sale items to restore stock
        const saleItems = await sql`
          SELECT product_id, quantity
          FROM sale_items
          WHERE sale_id = ${saleId}
        `

        // Handle stock restoration using the enhanced stock change handler
        console.log(`Processing stock restoration for deleted sale - Status was: ${status}`)
        await handleStockChange(
          saleItems.map(item => ({ productId: item.product_id, quantity: item.quantity })),
          saleId,
          status,
          paymentMethod,
          'delete',
          userId,
          undefined,
          customerName
        )

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

        await sql`COMMIT`
        revalidatePath("/dashboard")
        
        console.log(`Sale ${saleId} deleted successfully with comprehensive stock tracking`)
        return { success: true, message: "Sale deleted successfully" }
      } catch (error) {
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
