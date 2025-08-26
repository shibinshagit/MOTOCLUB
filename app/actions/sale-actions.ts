"use server"

import { sql, getLastError, resetConnectionState, executeWithRetry } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { recordSaleTransaction, recordSaleAdjustment, deleteSaleTransaction } from "./simplified-accounting"

// Enhanced schema caching with connection pooling optimization
const CACHE_DURATION = 300000 // 5 minutes (increased for better performance)
let schemaCache: any = null
let schemaCachePromise: Promise<any> | null = null

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

// OPTIMIZATION: Enhanced schema info with single query and longer cache
async function getSchemaInfo() {
  const now = Date.now()

  // Use cached info if recent
  if (schemaCache && now - schemaCache.lastChecked < CACHE_DURATION) {
    return schemaCache
  }

  // Prevent multiple concurrent schema checks
  if (schemaCachePromise) {
    return await schemaCachePromise
  }

  schemaCachePromise = checkSchemaInfo()
  try {
    schemaCache = await schemaCachePromise
    schemaCache.lastChecked = now
    return schemaCache
  } finally {
    schemaCachePromise = null
  }
}

async function checkSchemaInfo() {
  // Single query to check all schema info at once
  const result = await sql`
    SELECT 
      (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'payment_method') > 0 as has_payment_method,
      (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'discount') > 0 as has_discount,
      (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'device_id') > 0 as has_device_id,
      (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'received_amount') > 0 as has_received_amount,
      (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'staff_id') > 0 as has_staff_id,
      (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'sales' AND column_name = 'sale_type') > 0 as has_sale_type,
      (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'sale_items' AND column_name = 'cost') > 0 as sale_items_has_cost,
      (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'sale_items' AND column_name = 'notes') > 0 as sale_items_has_notes,
      (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'product_stock_history') > 0 as has_stock_history_table
  `

  return {
    hasPaymentMethod: result[0]?.has_payment_method || false,
    hasDiscount: result[0]?.has_discount || false,
    hasDeviceId: result[0]?.has_device_id || false,
    hasReceivedAmount: result[0]?.has_received_amount || false,
    hasStaffId: result[0]?.has_staff_id || false,
    hasSaleType: result[0]?.has_sale_type || false,
    saleItemsHasCost: result[0]?.sale_items_has_cost || false,
    saleItemsHasNotes: result[0]?.sale_items_has_notes || false,
    hasStockHistoryTable: result[0]?.has_stock_history_table || false,
  }
}

// OPTIMIZATION: Ensure stock history table only once per app lifecycle
let stockHistoryTableEnsured = false
async function ensureStockHistoryTable() {
  if (stockHistoryTableEnsured) return
  
  try {
    // Create the main stock history table with all columns
    await sql`
      CREATE TABLE IF NOT EXISTS product_stock_history (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        type VARCHAR(50) NOT NULL,
        reference_id INTEGER,
        reference_type VARCHAR(50),
        notes TEXT,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        change_type VARCHAR(50),
        quantity_change INTEGER,
        sale_id INTEGER,
        purchase_id INTEGER,
        payment_method VARCHAR(50),
        sale_status VARCHAR(50)
      )
    `
    
    // Add missing columns if they don't exist (for backward compatibility)
    await sql`ALTER TABLE product_stock_history ADD COLUMN IF NOT EXISTS change_type VARCHAR(50)`
    await sql`ALTER TABLE product_stock_history ADD COLUMN IF NOT EXISTS quantity_change INTEGER`
    await sql`ALTER TABLE product_stock_history ADD COLUMN IF NOT EXISTS sale_id INTEGER`
    await sql`ALTER TABLE product_stock_history ADD COLUMN IF NOT EXISTS purchase_id INTEGER`
    await sql`ALTER TABLE product_stock_history ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)`
    await sql`ALTER TABLE product_stock_history ADD COLUMN IF NOT EXISTS sale_status VARCHAR(50)`
    
    // Create indexes for better query performance
    await sql`
      CREATE INDEX IF NOT EXISTS idx_product_stock_history_product_id ON product_stock_history(product_id);
      CREATE INDEX IF NOT EXISTS idx_product_stock_history_reference ON product_stock_history(reference_id, reference_type);
      CREATE INDEX IF NOT EXISTS idx_product_stock_history_created_at ON product_stock_history(created_at);
    `
    
    stockHistoryTableEnsured = true
    console.log("Stock history table and indexes ensured")
  } catch (error) {
    console.error("Error ensuring stock history table:", error)
  }
}

// OPTIMIZATION: Connection pooling friendly transaction wrapper
export async function executeInTransaction<T>(operation: () => Promise<T>): Promise<T> {
  let retryCount = 0
  const maxRetries = 3

  while (retryCount < maxRetries) {
    try {
      await sql`BEGIN`
      const result = await operation()
      await sql`COMMIT`
      return result
    } catch (error) {
      await sql`ROLLBACK`
      
      // Retry on connection issues (common with Neon)
      if (error.message?.includes('connection') || error.message?.includes('timeout')) {
        retryCount++
        if (retryCount < maxRetries) {
          console.warn(`Transaction retry ${retryCount}/${maxRetries}:`, error.message)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 100)) // Exponential backoff
          continue
        }
      }
      
      throw error
    }
  }
}

// OPTIMIZATION: Batch validation with Neon compatible queries
async function batchValidateItems(productIds: number[]) {
  if (productIds.length === 0) return { products: [], services: [] }

  // Use parameterized query with ANY for better performance
  const [products, services] = await Promise.all([
    sql`
      SELECT id, name, stock, wholesale_price as cost
      FROM products 
      WHERE id = ANY(${productIds})
    `,
    sql`
      SELECT id, name, 0 as cost
      FROM services 
      WHERE id = ANY(${productIds})
    `
  ])

  return { products, services }
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


// Add your other functions here (addSale, updateSale, etc.)
// Completely rewritten getUserSales function compatible with Neon Database
// Updated getUserSales function with pagination support
export async function getUserSales(
  deviceId: number,
  limit: number = 5,
  searchTerm?: string,
  offset: number = 0
) {
  if (!deviceId) {
    return {
      success: false,
      message: "Device ID is required",
      data: [],
      hasMore: false,
      total: 0,
    }
  }

  resetConnectionState()

  try {
    // ✅ Ensure offset is never negative
    offset = Math.max(0, offset)
    limit = Math.max(1, limit) // also ensure at least 1 row is requested

    let sales
    let totalCount = 0

    // First get the total count for pagination
    const countQuery =
      searchTerm && searchTerm.trim() !== ""
        ? await executeWithRetry(async () => {
            const searchPattern = `%${searchTerm.toLowerCase()}%`
            return await sql`
              SELECT COUNT(*) as total
              FROM sales s
              LEFT JOIN customers c ON s.customer_id = c.id
              WHERE s.device_id = ${deviceId}
              AND (
                LOWER(COALESCE(c.name, '')) LIKE ${searchPattern}
                OR CAST(s.id AS TEXT) LIKE ${searchPattern}
                OR LOWER(s.status) LIKE ${searchPattern}
                OR CAST(s.total_amount AS TEXT) LIKE ${searchPattern}
              )
            `
          })
        : await executeWithRetry(async () => {
            return await sql`
              SELECT COUNT(*) as total
              FROM sales s
              WHERE s.device_id = ${deviceId}
            `
          })

    totalCount = Number(countQuery[0]?.total || 0)

    // Fetch sales
    const query = searchTerm && searchTerm.trim() !== ""
      ? sql`
          SELECT 
            s.*,
            c.name as customer_name,
            st.name as staff_name,
            COALESCE(cost_data.total_cost, 0) as total_cost
          FROM sales s
          LEFT JOIN customers c ON s.customer_id = c.id
          LEFT JOIN staff st ON s.staff_id = st.id
          LEFT JOIN (
            SELECT 
              sale_id,
              SUM(quantity * COALESCE(cost, wholesale_price, 0)) as total_cost
            FROM sale_items
            GROUP BY sale_id
          ) cost_data ON s.id = cost_data.sale_id
          WHERE s.device_id = ${deviceId}
          AND (
            LOWER(COALESCE(c.name, '')) LIKE ${`%${searchTerm.toLowerCase()}%`}
            OR CAST(s.id AS TEXT) LIKE ${`%${searchTerm.toLowerCase()}%`}
            OR LOWER(s.status) LIKE ${`%${searchTerm.toLowerCase()}%`}
            OR CAST(s.total_amount AS TEXT) LIKE ${`%${searchTerm.toLowerCase()}%`}
          )
          ORDER BY s.sale_date DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `
      : sql`
          SELECT 
            s.*,
            c.name as customer_name,
            st.name as staff_name,
            COALESCE(cost_data.total_cost, 0) as total_cost
          FROM sales s
          LEFT JOIN customers c ON s.customer_id = c.id
          LEFT JOIN staff st ON s.staff_id = st.id
          LEFT JOIN (
            SELECT 
              sale_id,
              SUM(quantity * COALESCE(cost, wholesale_price, 0)) as total_cost
            FROM sale_items
            GROUP BY sale_id
          ) cost_data ON s.id = cost_data.sale_id
          WHERE s.device_id = ${deviceId}
          ORDER BY s.sale_date DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `

    sales = await executeWithRetry(async () => query)

    const hasMore = offset + sales.length < totalCount

    return {
      success: true,
      data: sales,
      hasMore,
      total: totalCount,
      currentPage: Math.floor(offset / limit) + 1,
      totalPages: Math.ceil(totalCount / limit),
    }
  } catch (error) {
    console.error("Get device sales error:", error)
    return {
      success: false,
      message: `Database error: ${
        getLastError()?.message || "Unknown error"
      }. Please try again later.`,
      data: [],
      hasMore: false,
      total: 0,
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
    console.log("Adding sale with optimized stock tracking:", JSON.stringify(saleData, null, 2))

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

      // OPTIMIZATION 1: Batch validate all products/services in a single query
      const productIds = saleData.items.map(item => item.productId)
      const { products, services } = await batchValidateItems(productIds)

      // Create lookup maps for O(1) access
      const productMap = new Map(products.map(p => [p.id, p]))
      const serviceMap = new Map(services.map(s => [s.id, s]))

      // Validate all items exist
      const validatedItems = []
      for (const item of saleData.items) {
        const product = productMap.get(item.productId)
        const service = serviceMap.get(item.productId)
        
        if (!product && !service) {
          await sql`ROLLBACK`
          return {
            success: false,
            message: `Item with ID ${item.productId} not found in products or services`,
          }
        }

        validatedItems.push({
          ...item,
          itemName: product?.name || service?.name || "Unknown Item",
          isService: !product,
          currentStock: product?.stock || 0
        })
      }

      // OPTIMIZATION 2: Add missing columns in parallel
      await addMissingSaleColumns(schema)

      // Insert sale with optimized column detection
      const sale = await insertSaleRecord(schema, {
        customerId: saleData.customerId,
        userId: saleData.userId,
        total,
        status,
        saleDate: saleData.saleDate || new Date(),
        deviceId: saleData.deviceId,
        paymentMethod,
        discountAmount,
        receivedAmount,
        staffId: saleData.staffId
      })

      const saleId = sale.id

      // OPTIMIZATION 3: Get customer name only if needed
      let customerName = null
      if (saleData.customerId) {
        const customerResult = await sql`SELECT name FROM customers WHERE id = ${saleData.customerId}`
        customerName = customerResult[0]?.name || null
      }

      // OPTIMIZATION 4: Batch insert sale items
      const saleItems = await batchInsertSaleItems(saleId, validatedItems)

      // OPTIMIZATION 5: Batch stock updates and history entries
      await batchProcessStockChanges(validatedItems, saleId, status, paymentMethod, saleData.userId, customerName)

      // OPTIMIZATION 6: Update sale type efficiently
      await updateSaleType(saleId, validatedItems, schema)

      // OPTIMIZATION 7: Calculate COGS and record accounting in parallel
      const [cogsAmount] = await Promise.all([
        calculateCOGS(saleData.items),
        // Record accounting transaction asynchronously to not block the main flow
        recordSaleTransactionAsync({
          saleId,
          totalAmount: total,
          cogsAmount: await calculateCOGS(saleData.items),
          receivedAmount,
          outstandingAmount: total - receivedAmount,
          status: status,
          paymentMethod: paymentMethod,
          deviceId: saleData.deviceId,
          userId: saleData.userId,
          customerId: saleData.customerId,
          saleDate: new Date(saleData.saleDate || new Date()),
        })
      ])

      await sql`COMMIT`
      
      // Revalidate path after successful commit
      setImmediate(() => revalidatePath("/dashboard"))

      console.log(`Sale ${saleId} created successfully with ${saleItems.length} items`)

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

// OPTIMIZATION HELPER: Add missing columns in parallel
async function addMissingSaleColumns(schema: any) {
  const alterPromises = []
  
  if (!schema.hasDeviceId) {
    alterPromises.push(sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS device_id INTEGER`)
  }
  if (!schema.hasReceivedAmount) {
    alterPromises.push(sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS received_amount DECIMAL(12,2) DEFAULT 0`)
  }
  if (!schema.hasStaffId) {
    alterPromises.push(sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS staff_id INTEGER`)
  }
  if (!schema.hasSaleType) {
    alterPromises.push(sql`ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_type VARCHAR(20) DEFAULT 'product'`)
  }

  if (alterPromises.length > 0) {
    await Promise.all(alterPromises)
    // Update schema cache
    Object.assign(schema, {
      hasDeviceId: true,
      hasReceivedAmount: true,
      hasStaffId: true,
      hasSaleType: true
    })
  }
}

// OPTIMIZATION HELPER: Optimized sale record insertion
async function insertSaleRecord(schema: any, saleData: any) {
  // Build the most complete INSERT query possible
  if (schema.hasDeviceId && schema.hasPaymentMethod && schema.hasDiscount && schema.hasReceivedAmount && schema.hasStaffId && saleData.staffId) {
    const result = await sql`
      INSERT INTO sales (customer_id, created_by, total_amount, status, sale_date, device_id, payment_method, discount, received_amount, staff_id) 
      VALUES (${saleData.customerId || null}, ${saleData.userId}, ${saleData.total}, ${saleData.status}, ${saleData.saleDate}, ${saleData.deviceId}, ${saleData.paymentMethod}, ${saleData.discountAmount}, ${saleData.receivedAmount}, ${saleData.staffId}) 
      RETURNING *
    `
    return result[0]
  } else if (schema.hasDeviceId && schema.hasPaymentMethod && schema.hasDiscount && schema.hasReceivedAmount) {
    const result = await sql`
      INSERT INTO sales (customer_id, created_by, total_amount, status, sale_date, device_id, payment_method, discount, received_amount) 
      VALUES (${saleData.customerId || null}, ${saleData.userId}, ${saleData.total}, ${saleData.status}, ${saleData.saleDate}, ${saleData.deviceId}, ${saleData.paymentMethod}, ${saleData.discountAmount}, ${saleData.receivedAmount}) 
      RETURNING *
    `
    return result[0]
  } else if (schema.hasDeviceId && schema.hasPaymentMethod && schema.hasDiscount) {
    const result = await sql`
      INSERT INTO sales (customer_id, created_by, total_amount, status, sale_date, device_id, payment_method, discount) 
      VALUES (${saleData.customerId || null}, ${saleData.userId}, ${saleData.total}, ${saleData.status}, ${saleData.saleDate}, ${saleData.deviceId}, ${saleData.paymentMethod}, ${saleData.discountAmount}) 
      RETURNING *
    `
    return result[0]
  } else if (schema.hasDeviceId && schema.hasPaymentMethod) {
    const result = await sql`
      INSERT INTO sales (customer_id, created_by, total_amount, status, sale_date, device_id, payment_method) 
      VALUES (${saleData.customerId || null}, ${saleData.userId}, ${saleData.total}, ${saleData.status}, ${saleData.saleDate}, ${saleData.deviceId}, ${saleData.paymentMethod}) 
      RETURNING *
    `
    return result[0]
  } else if (schema.hasDeviceId) {
    const result = await sql`
      INSERT INTO sales (customer_id, created_by, total_amount, status, sale_date, device_id) 
      VALUES (${saleData.customerId || null}, ${saleData.userId}, ${saleData.total}, ${saleData.status}, ${saleData.saleDate}, ${saleData.deviceId}) 
      RETURNING *
    `
    return result[0]
  }
  
  // Fallback for basic columns
  const result = await sql`
    INSERT INTO sales (customer_id, created_by, total_amount, status, sale_date) 
    VALUES (${saleData.customerId || null}, ${saleData.userId}, ${saleData.total}, ${saleData.status}, ${saleData.saleDate}) 
    RETURNING *
  `
  return result[0]
}

// OPTIMIZATION HELPER: Batch insert sale items (Neon compatible)
async function batchInsertSaleItems(saleId: number, validatedItems: any[]) {
  if (validatedItems.length === 0) return []

  // Check for columns once using schema cache
  const schema = await getSchemaInfo()
  let hasCostColumn = schema.saleItemsHasCost
  let hasNotesColumn = schema.saleItemsHasNotes

  // Add columns if missing
  const alterPromises = []
  if (!hasCostColumn) {
    alterPromises.push(sql`ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS cost DECIMAL(12,2) DEFAULT 0`)
  }
  if (!hasNotesColumn) {
    alterPromises.push(sql`ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS notes TEXT`)
  }
  
  if (alterPromises.length > 0) {
    await Promise.all(alterPromises)
    hasCostColumn = true
    hasNotesColumn = true
  }

  // NEON COMPATIBLE: Use individual inserts in parallel (still faster than original)
  const saleItems = []
  const insertPromises = validatedItems.map(async (item) => {
    try {
      let itemResult
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

      // Enhance result with cached item info
      return {
        ...itemResult[0],
        product_name: item.itemName,
        item_type: item.isService ? "service" : "product"
      }
    } catch (insertError) {
      console.error("Error inserting sale item:", insertError)
      throw new Error(`Failed to add item to sale: ${insertError.message}`)
    }
  })

  const results = await Promise.all(insertPromises)
  console.log(`Successfully added ${results.length} items to sale`)
  return results
}

// OPTIMIZATION HELPER: Batch process stock changes (Neon compatible)
async function batchProcessStockChanges(validatedItems: any[], saleId: number, status: string, paymentMethod: string, userId: number, customerName?: string) {
  const statusImpact = shouldAffectStock(status)
  
  if (!statusImpact.affectsStock || !statusImpact.reduces) {
    console.log(`Skipping stock changes - status ${status} doesn't affect stock`)
    return
  }

  // Separate products from services
  const productsToUpdate = validatedItems.filter(item => !item.isService)
  const servicesToLog = validatedItems.filter(item => item.isService)

  // NEON COMPATIBLE: Update product stocks individually but in parallel
  if (productsToUpdate.length > 0) {
    const stockUpdatePromises = productsToUpdate.map(item => 
      updateProductStock(
        item.productId, 
        item.quantity, 
        "subtract",
        `New sale - ${status} via ${paymentMethod}`
      )
    )
    
    await Promise.all(stockUpdatePromises)
    console.log(`Updated ${productsToUpdate.length} product stocks`)
  }

  // NEON COMPATIBLE: Create stock history entries individually but in parallel
  const allHistoryEntries = [...productsToUpdate, ...servicesToLog]
  if (allHistoryEntries.length > 0) {
    await batchInsertStockHistoryNeonCompatible(allHistoryEntries, saleId, status, paymentMethod, userId, customerName)
  }

  console.log(`Processed ${productsToUpdate.length} stock updates and ${allHistoryEntries.length} history entries`)
}

// OPTIMIZATION HELPER: Batch insert stock history entries (Neon compatible)
async function batchInsertStockHistoryNeonCompatible(items: any[], saleId: number, status: string, paymentMethod: string, userId: number, customerName?: string) {
  const historyType = getStockHistoryType('sale', status, paymentMethod)
  const methodLabel = PAYMENT_METHOD_LABELS[paymentMethod?.toLowerCase()] || paymentMethod
  const baseNotes = `New sale created - ${status} via ${methodLabel}`
  const enhancedNotes = customerName ? `${baseNotes} | Customer: ${customerName}` : baseNotes

  // NEON COMPATIBLE: Create stock history entries in parallel individual queries
  const historyPromises = items.map(item => {
    const quantity = item.isService ? 0 : item.quantity // Services don't affect stock quantity
    return createStockHistoryEntry(
      item.productId,
      historyType,
      item.isService ? 0 : -quantity, // Negative for stock reduction
      saleId,
      'sale',
      enhancedNotes,
      userId,
      paymentMethod,
      status
    )
  })

  await Promise.all(historyPromises)
  console.log(`Created ${items.length} stock history entries`)
}




// OPTIMIZATION HELPER: Efficient sale type update
async function updateSaleType(saleId: number, validatedItems: any[], schema: any) {
  if (!schema.hasSaleType) return

  const hasService = validatedItems.some(item => item.isService)
  const saleType = hasService ? "service" : "product"

  await sql`UPDATE sales SET sale_type = ${saleType} WHERE id = ${saleId}`
}

// OPTIMIZATION HELPER: Async accounting record (doesn't block main flow)
async function recordSaleTransactionAsync(transactionData: any) {
  // Use setTimeout to make this truly async and not block the main transaction
  setTimeout(async () => {
    try {
      const accountingResult = await recordSaleTransaction(transactionData)
      if (!accountingResult.success) {
        console.error("Failed to record accounting transaction:", accountingResult.error)
      }
    } catch (error) {
      console.error("Error recording accounting transaction:", error)
    }
  }, 0)
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

// Missing helper functions for the updateSale functionality

// Function to calculate all changes between original and new sale data
function calculateSaleChanges(original: any, saleData: any, originalItems: any[], newItems: any[]) {
  // Parse original values with proper defaults
  const originalTotal = Number(original.total_amount) || 0
  const originalDiscount = Number(original.discount) || 0
  const originalReceived = Number(original.received_amount) || 0
  const originalStatus = (original.status || "completed").toLowerCase()
  const originalPaymentMethod = original.payment_method || "cash"
  const originalDate = new Date(original.sale_date)

  // Parse new values
  const newSubtotal = saleData.items.reduce(
    (sum: number, item: any) => sum + Number(item.price) * Number(item.quantity),
    0
  )
  const newDiscount = Number(saleData.discount) || 0
  const newTotal = Math.max(0, newSubtotal - newDiscount)
  const newStatus = (saleData.paymentStatus || "completed").toLowerCase()
  const newPaymentMethod = saleData.paymentMethod || "cash"
  const newDate = new Date(saleData.saleDate || new Date())

  // Calculate received amount based on status
  let newReceived = 0
  if (newStatus === "completed" || newStatus === "paid") {
    newReceived = newTotal
  } else if (newStatus === "cancelled") {
    newReceived = 0
  } else if (newStatus === "credit" || newStatus === "partial") {
    newReceived = Number(saleData.receivedAmount) || 0
  } else if (newStatus === "pending") {
    newReceived = Number(saleData.receivedAmount) || 0
  } else {
    newReceived = newTotal // Default for other statuses
  }

  // Calculate outstanding amount
  const outstandingAmount = Math.max(0, newTotal - newReceived)

  // Check for changes
  const dateChanged = originalDate.getTime() !== newDate.getTime()
  const statusChanged = originalStatus !== newStatus
  const paymentMethodChanged = originalPaymentMethod !== newPaymentMethod
  const totalChanged = Math.abs(originalTotal - newTotal) > 0.01
  const discountChanged = Math.abs(originalDiscount - newDiscount) > 0.01
  const receivedChanged = Math.abs(originalReceived - newReceived) > 0.01

  // Check if items changed (basic comparison)
  const itemsChanged = checkItemsChanged(originalItems, newItems)

  return {
    // Original values
    originalTotal,
    originalDiscount,
    originalReceived,
    originalStatus,
    originalPaymentMethod,
    originalDate,

    // New values
    newTotal,
    newDiscount,
    newReceived,
    newStatus,
    newPaymentMethod,
    newDate,
    outstandingAmount,

    // Change flags
    dateChanged,
    statusChanged,
    paymentMethodChanged,
    totalChanged,
    discountChanged,
    receivedChanged,
    itemsChanged,
  }
}

// Helper function to check if items have changed
function checkItemsChanged(originalItems: any[], newItems: any[]): boolean {
  if (originalItems.length !== newItems.length) {
    return true
  }

  // Create maps for comparison
  const originalMap = new Map()
  originalItems.forEach(item => {
    originalMap.set(item.id || `temp_${item.product_id}`, {
      productId: item.product_id,
      quantity: Number(item.quantity),
      price: Number(item.price)
    })
  })

  const newMap = new Map()
  newItems.forEach(item => {
    newMap.set(item.id || `temp_${item.productId}`, {
      productId: item.productId,
      quantity: Number(item.quantity),
      price: Number(item.price)
    })
  })

  // Check if any item changed
  for (const [id, originalItem] of originalMap.entries()) {
    const newItem = newMap.get(id)
    if (!newItem) {
      return true // Item was deleted
    }

    if (
      originalItem.productId !== newItem.productId ||
      originalItem.quantity !== newItem.quantity ||
      Math.abs(originalItem.price - newItem.price) > 0.01
    ) {
      return true // Item was modified
    }
  }

  // Check for new items
  for (const id of newMap.keys()) {
    if (!originalMap.has(id)) {
      return true // New item was added
    }
  }

  return false
}

// Function to handle item-level stock changes when items are modified
async function handleItemStockChanges(
  originalItems: any[],
  newItems: any[],
  saleId: number,
  status: string,
  paymentMethod: string,
  userId: number,
  customerName?: string
) {
  const statusImpact = shouldAffectStock(status)
  
  // Only process stock changes if the current status affects stock
  if (!statusImpact.affectsStock || !statusImpact.reduces) {
    console.log(`Skipping item stock changes - status ${status} doesn't affect stock`)
    return
  }

  console.log(`Processing item-level stock changes for status: ${status}`)

  // Create maps for easier comparison
  const originalMap = new Map()
  originalItems.forEach(item => {
    originalMap.set(item.product_id, {
      id: item.id,
      productId: item.product_id,
      quantity: Number(item.quantity)
    })
  })

  const newMap = new Map()
  newItems.forEach(item => {
    const key = item.productId
    if (newMap.has(key)) {
      // If duplicate product IDs, sum the quantities
      newMap.get(key).quantity += Number(item.quantity)
    } else {
      newMap.set(key, {
        id: item.id,
        productId: item.productId,
        quantity: Number(item.quantity)
      })
    }
  })

  // Process changes for each product
  const allProductIds = new Set([...originalMap.keys(), ...newMap.keys()])

  for (const productId of allProductIds) {
    const originalItem = originalMap.get(productId)
    const newItem = newMap.get(productId)

    const originalQty = originalItem ? originalItem.quantity : 0
    const newQty = newItem ? newItem.quantity : 0
    const qtyDiff = newQty - originalQty

    if (qtyDiff === 0) {
      continue // No quantity change for this product
    }

    try {
      if (qtyDiff > 0) {
        // Quantity increased - reduce stock further
        const stockResult = await updateProductStock(
          productId,
          qtyDiff,
          "subtract",
          `Sale update - quantity increased by ${qtyDiff}`
        )

        if (stockResult.success && !stockResult.isService) {
          await createStockHistoryEntry(
            productId,
            'sale_item_increased',
            -qtyDiff, // Negative because we're reducing stock
            saleId,
            'sale',
            `Sale item quantity increased by ${qtyDiff} units | Status: ${status} | Payment: ${paymentMethod}${customerName ? ` | Customer: ${customerName}` : ''}`,
            userId,
            paymentMethod,
            status
          )
        }
      } else {
        // Quantity decreased - restore some stock
        const stockResult = await updateProductStock(
          productId,
          Math.abs(qtyDiff),
          "add",
          `Sale update - quantity decreased by ${Math.abs(qtyDiff)}`
        )

        if (stockResult.success && !stockResult.isService) {
          await createStockHistoryEntry(
            productId,
            'sale_item_decreased',
            Math.abs(qtyDiff), // Positive because we're restoring stock
            saleId,
            'sale',
            `Sale item quantity decreased by ${Math.abs(qtyDiff)} units | Status: ${status} | Payment: ${paymentMethod}${customerName ? ` | Customer: ${customerName}` : ''}`,
            userId,
            paymentMethod,
            status
          )
        }
      }

      console.log(`Stock updated for product ${productId}: quantity change ${qtyDiff}`)
    } catch (error) {
      console.error(`Error updating stock for product ${productId}:`, error)
    }
  }

  console.log("Item-level stock changes processed successfully")
}

// Enhanced delete sale function with proper stock restoration
export async function deleteSale(saleId: number, deviceId?: number, userId?: number) {
  if (!saleId) {
    return { success: false, message: "Sale ID is required" }
  }

  resetConnectionState()

  try {
    await ensureStockHistoryTable()
    await sql`BEGIN`

    try {
      // Get sale details first
      let saleQuery
      if (deviceId) {
        saleQuery = await sql`
          SELECT s.*, c.name as customer_name
          FROM sales s
          LEFT JOIN customers c ON s.customer_id = c.id
          WHERE s.id = ${saleId} AND s.device_id = ${deviceId}
        `
      } else {
        saleQuery = await sql`
          SELECT s.*, c.name as customer_name
          FROM sales s
          LEFT JOIN customers c ON s.customer_id = c.id
          WHERE s.id = ${saleId}
        `
      }

      if (saleQuery.length === 0) {
        await sql`ROLLBACK`
        return { success: false, message: "Sale not found" }
      }

      const sale = saleQuery[0]

      // Get sale items
      const items = await sql`
        SELECT product_id, quantity FROM sale_items WHERE sale_id = ${saleId}
      `

      // Handle stock restoration using the comprehensive stock change handler
      await handleStockChange(
        items.map(item => ({ productId: item.product_id, quantity: item.quantity })),
        saleId,
        sale.status || 'completed',
        sale.payment_method || 'cash',
        'delete',
        userId,
        undefined,
        sale.customer_name
      )

      // Delete sale items first (due to foreign key constraint)
      await sql`DELETE FROM sale_items WHERE sale_id = ${saleId}`

      // Delete the sale
      await sql`DELETE FROM sales WHERE id = ${saleId}`

      // Record accounting transaction for deletion
      try {
        const cogsAmount = await calculateCOGS([], saleId)
        
        await deleteSaleTransaction({
          saleId,
          totalAmount: Number(sale.total_amount) || 0,
          cogsAmount,
          receivedAmount: Number(sale.received_amount) || Number(sale.total_amount) || 0,
          status: sale.status || 'completed',
          paymentMethod: sale.payment_method || 'cash',
          deviceId: deviceId || null,
          userId: userId || null,
          customerId: sale.customer_id || null,
          saleDate: new Date(sale.sale_date),
          deletionReason: 'Sale deleted by user'
        })
      } catch (accountingError) {
        console.error("Error recording sale deletion in accounting:", accountingError)
      }

      await sql`COMMIT`
      revalidatePath("/dashboard")

      console.log(`Sale ${saleId} deleted successfully with stock restoration`)

      return {
        success: true,
        message: "Sale deleted successfully",
      }
    } catch (error) {
      await sql`ROLLBACK`
      throw error
    }
  } catch (error) {
    console.error("Delete sale error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || error.message}. Please try again later.`,
    }
  }
}
