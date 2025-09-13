"use server"

import { sql, getLastError, resetConnectionState } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { recordPurchaseTransaction, recordPurchaseAdjustment, deletePurchaseTransaction } from "./simplified-accounting"

// Enhanced error handling wrapper
async function withErrorHandling<T>(
  operation: () => Promise<T>,
  errorMessage: string
): Promise<{ success: true; data?: T; message?: string } | { success: false; message: string; data?: null }> {
  try {
    const result = await operation()
    return { success: true, data: result }
  } catch (error) {
    console.error(`${errorMessage}:`, error)
    const dbError = getLastError()
    return {
      success: false,
      message: dbError?.message || error instanceof Error ? error.message : errorMessage,
    }
  }
}

// Enhanced data validation
function validatePurchaseData(data: {
  supplier?: string
  totalAmount?: number
  items?: any[]
  userId?: number
  deviceId?: number
}) {
  const errors: string[] = []

  if (!data.supplier?.trim()) errors.push("Supplier name is required")
  if (!data.totalAmount || isNaN(data.totalAmount) || data.totalAmount <= 0) errors.push("Valid total amount is required")
  if (!data.items || !Array.isArray(data.items) || data.items.length === 0) errors.push("At least one item is required")
  if (!data.userId || data.userId <= 0) errors.push("Valid user ID is required")
  if (!data.deviceId || data.deviceId <= 0) errors.push("Valid device ID is required")

  // Validate items
  if (data.items) {
    data.items.forEach((item, index) => {
      if (!item.product_id || item.product_id <= 0) errors.push(`Item ${index + 1}: Valid product is required`)
      if (!item.quantity || item.quantity <= 0) errors.push(`Item ${index + 1}: Valid quantity is required`)
      if (item.price === undefined || item.price < 0) errors.push(`Item ${index + 1}: Valid price is required`)
    })
  }

  return errors
}

// Enhanced database connection management
async function ensureConnection() {
  resetConnectionState()
  // Add small delay to prevent connection race conditions
  await new Promise(resolve => setTimeout(resolve, 10))
}

export async function getPurchases() {
  return withErrorHandling(async () => {
    await ensureConnection()
    
    const purchases = await sql`
      SELECT * FROM purchases
      ORDER BY purchase_date DESC, id DESC
    `

    return purchases
  }, "Failed to fetch purchases")
}

export async function getUserPurchases(deviceId: number, limit = 500, searchTerm?: string) {
  if (!deviceId) {
    return { success: false, message: "Device ID is required", data: [] }
  }

  return withErrorHandling(async () => {
    await ensureConnection()

    let purchases

    if (searchTerm && searchTerm.trim() !== "") {
      // Enhanced search with better pattern matching
      const searchPattern = `%${searchTerm.toLowerCase().trim()}%`

      purchases = await sql`
        SELECT *
        FROM purchases
        WHERE device_id = ${deviceId}
          AND (
            LOWER(TRIM(supplier)) LIKE ${searchPattern}
            OR CAST(id AS TEXT) LIKE ${searchPattern}
            OR LOWER(TRIM(status)) LIKE ${searchPattern}
            OR LOWER(TRIM(purchase_status)) LIKE ${searchPattern}
          )
        ORDER BY purchase_date DESC, id DESC
        LIMIT ${Math.min(limit, 1000)}
      `
    } else {
      purchases = await sql`
        SELECT *
        FROM purchases
        WHERE device_id = ${deviceId}
        ORDER BY purchase_date DESC, id DESC
        LIMIT ${Math.min(limit, 1000)}
      `
    }

    return purchases
  }, "Failed to fetch user purchases").then(result => ({
    ...result,
    data: result.success ? result.data : []
  }))
}

export async function getPurchaseDetails(purchaseId: number) {
  if (!purchaseId || purchaseId <= 0) {
    return { success: false, message: "Valid purchase ID is required" }
  }

  return withErrorHandling(async () => {
    await ensureConnection()

    const [purchaseItems, purchase] = await Promise.all([
      sql`
        SELECT pi.*, p.name as product_name, p.category, p.barcode
        FROM purchase_items pi
        LEFT JOIN products p ON pi.product_id = p.id
        WHERE pi.purchase_id = ${purchaseId}
        ORDER BY pi.id
      `,
      sql`
        SELECT * FROM purchases
        WHERE id = ${purchaseId}
      `
    ])

    if (purchase.length === 0) {
      throw new Error("Purchase not found")
    }

    return {
      purchase: purchase[0],
      items: purchaseItems,
    }
  }, "Failed to fetch purchase details")
}

export async function createPurchase(formData: FormData) {
  // Enhanced data extraction and validation
  const supplier = (formData.get("supplier") as string)?.trim()
  const totalAmount = Number.parseFloat(formData.get("total_amount") as string)
  const status = (formData.get("status") as string)?.trim() || "Credit"
  const purchaseStatus = (formData.get("purchase_status") as string)?.trim() || "Delivered"
  const paymentMethod = (formData.get("payment_method") as string)?.trim() || "Cash"
  const userId = Number.parseInt(formData.get("user_id") as string)
  const deviceId = Number.parseInt(formData.get("device_id") as string)
  const purchaseDate = (formData.get("purchase_date") as string)?.trim() || new Date().toISOString()
  const receivedAmount = Number.parseFloat(formData.get("received_amount") as string) || 0

  // Parse and validate items
  const itemsJson = formData.get("items") as string
  let items = []

  try {
    items = JSON.parse(itemsJson)
    if (!Array.isArray(items)) {
      throw new Error("Items must be an array")
    }
  } catch (e) {
    return { success: false, message: "Invalid items format" }
  }

  // Normalize items with enhanced validation
  items = items.map((item: any, index: number) => {
    const normalizedItem = {
      product_id: Number(item.product_id) || 0,
      quantity: Number(item.quantity) || 0,
      price: Number(item.price) || 0,
    }

    if (normalizedItem.product_id <= 0) {
      throw new Error(`Item ${index + 1}: Invalid product ID`)
    }
    if (normalizedItem.quantity <= 0) {
      throw new Error(`Item ${index + 1}: Invalid quantity`)
    }
    if (normalizedItem.price < 0) {
      throw new Error(`Item ${index + 1}: Invalid price`)
    }

    return normalizedItem
  })

  // Validate all data
  const validationErrors = validatePurchaseData({
    supplier,
    totalAmount,
    items,
    userId,
    deviceId,
  })

  if (validationErrors.length > 0) {
    return { success: false, message: validationErrors.join("; ") }
  }

  // Validate received amount
  if (receivedAmount > totalAmount) {
    return { success: false, message: "Received amount cannot be greater than total amount" }
  }

  return withErrorHandling(async () => {
    await ensureConnection()

    // Start transaction
    await sql`BEGIN`

    try {
      // Ensure required columns exist with better error handling
      await ensureColumnsExist()

      // Calculate final received amount based on status
      let finalReceivedAmount = receivedAmount
      if (status.toLowerCase() === "paid") {
        finalReceivedAmount = totalAmount
      } else if (status.toLowerCase() === "cancelled") {
        finalReceivedAmount = 0
      }

      // Create the purchase
      const purchaseResult = await sql`
        INSERT INTO purchases (
          supplier, total_amount, status, payment_method, purchase_status, 
          created_by, device_id, purchase_date, received_amount
        )
        VALUES (
          ${supplier}, ${totalAmount}, ${status}, ${paymentMethod}, ${purchaseStatus}, 
          ${userId}, ${deviceId}, ${purchaseDate}, ${finalReceivedAmount}
        )
        RETURNING *
      `

      if (purchaseResult.length === 0) {
        throw new Error("Failed to create purchase record")
      }

      const purchaseId = purchaseResult[0].id
      const isDelivered = purchaseStatus.toLowerCase() === "delivered"
      const isCancelled = status.toLowerCase() === "cancelled"

      // Process items with enhanced error handling
      const stockUpdates = []
      const stockHistoryEntries = []

      for (const [index, item] of items.entries()) {
        try {
          // Insert purchase item
          await sql`
            INSERT INTO purchase_items (purchase_id, product_id, quantity, price)
            VALUES (${purchaseId}, ${item.product_id}, ${item.quantity}, ${item.price})
          `

          // Handle stock updates only when delivered and not cancelled
          if (isDelivered && !isCancelled) {
            stockUpdates.push({
              product_id: item.product_id,
              quantity: item.quantity
            })

            stockHistoryEntries.push({
              product_id: item.product_id,
              quantity: item.quantity,
              type: 'purchase',
              reference_id: purchaseId,
              reference_type: 'purchase',
              notes: `Stock added from purchase #${purchaseId} - ${supplier}`,
              created_by: userId
            })
          }
        } catch (error) {
          throw new Error(`Failed to process item ${index + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }

      // Apply stock updates in batch
      for (const update of stockUpdates) {
        await sql`
          UPDATE products
          SET stock = COALESCE(stock, 0) + ${update.quantity}
          WHERE id = ${update.product_id}
        `
      }

      // Insert stock history entries
      for (const entry of stockHistoryEntries) {
        try {
          await sql`
            INSERT INTO product_stock_history (
              product_id, quantity, type, reference_id, reference_type, notes, created_by
            ) VALUES (
              ${entry.product_id}, ${entry.quantity}, ${entry.type}, ${entry.reference_id}, 
              ${entry.reference_type}, ${entry.notes}, ${entry.created_by}
            )
          `
        } catch (error) {
          console.warn(`Failed to add stock history for product ${entry.product_id}:`, error)
        }
      }

      // Record purchase transaction
      try {
        await recordPurchaseTransaction({
          purchaseId,
          totalAmount,
          receivedAmount: finalReceivedAmount,
          outstandingAmount: totalAmount - finalReceivedAmount,
          status,
          paymentMethod,
          supplierName: supplier,
          deviceId,
          userId,
          purchaseDate: new Date(purchaseDate),
        })
      } catch (error) {
        console.warn("Failed to record purchase transaction:", error)
      }

      await sql`COMMIT`

      // Revalidate paths
      revalidatePath("/dashboard")
      revalidatePath("/purchases")

      return purchaseResult[0]
    } catch (error) {
      await sql`ROLLBACK`
      throw error
    }
  }, "Failed to create purchase")
}

export async function updatePurchase(formData: FormData) {
  // Enhanced data extraction
  const purchaseId = Number.parseInt(formData.get("id") as string)
  const supplier = (formData.get("supplier") as string)?.trim()
  const purchaseDate = (formData.get("purchase_date") as string)?.trim()
  const totalAmount = Number.parseFloat(formData.get("total_amount") as string)
  const status = (formData.get("status") as string)?.trim() || "Credit"
  const purchaseStatus = (formData.get("purchase_status") as string)?.trim() || "Delivered"
  const paymentMethod = (formData.get("payment_method") as string)?.trim() || "Cash"
  const userId = Number.parseInt(formData.get("user_id") as string)
  const deviceId = Number.parseInt(formData.get("device_id") as string)
  const receivedAmount = Number.parseFloat(formData.get("received_amount") as string) || 0

  // Parse items with validation
  const itemsJson = formData.get("items") as string
  let items = []

  try {
    items = JSON.parse(itemsJson)
    if (!Array.isArray(items)) {
      throw new Error("Items must be an array")
    }
  } catch (e) {
    return { success: false, message: "Invalid items format" }
  }

  // Normalize items
  items = items.map((item: any) => ({
    product_id: Number(item.product_id) || 0,
    quantity: Number(item.quantity) || 0,
    price: Number(item.price) || 0,
  }))

  // Validate data
  const validationErrors = validatePurchaseData({
    supplier,
    totalAmount,
    items,
    userId,
    deviceId,
  })

  if (!purchaseId || purchaseId <= 0) {
    validationErrors.push("Valid purchase ID is required")
  }

  if (validationErrors.length > 0) {
    return { success: false, message: validationErrors.join("; ") }
  }

  if (receivedAmount > totalAmount) {
    return { success: false, message: "Received amount cannot be greater than total amount" }
  }

  return withErrorHandling(async () => {
    await ensureConnection()

    await sql`BEGIN`

    try {
      // Get current purchase details
      const currentPurchase = await sql`
        SELECT status, purchase_status, received_amount, total_amount 
        FROM purchases 
        WHERE id = ${purchaseId} AND device_id = ${deviceId}
      `

      if (currentPurchase.length === 0) {
        throw new Error("Purchase not found or access denied")
      }

      // Get current items for stock calculations
      const currentItems = await sql`
        SELECT product_id, quantity FROM purchase_items WHERE purchase_id = ${purchaseId}
      `

      // Calculate final received amount
      let finalReceivedAmount = receivedAmount
      if (status.toLowerCase() === "paid") {
        finalReceivedAmount = totalAmount
      } else if (status.toLowerCase() === "cancelled") {
        finalReceivedAmount = 0
      }

      // Ensure columns exist
      await ensureColumnsExist()

      // Update purchase
      const purchaseResult = await sql`
        UPDATE purchases 
        SET supplier = ${supplier}, total_amount = ${totalAmount}, 
            status = ${status}, purchase_date = ${purchaseDate},
            purchase_status = ${purchaseStatus}, payment_method = ${paymentMethod},
            received_amount = ${finalReceivedAmount}
        WHERE id = ${purchaseId} AND device_id = ${deviceId}
        RETURNING *
      `

      if (purchaseResult.length === 0) {
        throw new Error("Failed to update purchase")
      }

      // Handle stock updates
      await handleStockUpdates(
        purchaseId,
        currentPurchase[0],
        { status, purchase_status: purchaseStatus },
        currentItems,
        items,
        supplier,
        userId
      )

      // Update purchase items
      await sql`DELETE FROM purchase_items WHERE purchase_id = ${purchaseId}`

      for (const item of items) {
        await sql`
          INSERT INTO purchase_items (purchase_id, product_id, quantity, price)
          VALUES (${purchaseId}, ${item.product_id}, ${item.quantity}, ${item.price})
        `
      }

      // Record purchase adjustment
      try {
        await recordPurchaseAdjustment({
          purchaseId,
          changeType: status.toLowerCase() === "cancelled" ? "cancel" : "edit",
          previousValues: {
            totalAmount: Number(currentPurchase[0].total_amount) || 0,
            receivedAmount: Number(currentPurchase[0].received_amount) || 0,
            status: currentPurchase[0].status,
          },
          newValues: {
            totalAmount,
            receivedAmount: finalReceivedAmount,
            status,
          },
          deviceId,
          userId,
          description: `Purchase #${purchaseId} updated - ${supplier}`,
          adjustmentDate: new Date(),
        })
      } catch (error) {
        console.warn("Failed to record purchase adjustment:", error)
      }

      await sql`COMMIT`

      revalidatePath("/dashboard")
      revalidatePath("/purchases")

      return purchaseResult[0]
    } catch (error) {
      await sql`ROLLBACK`
      throw error
    }
  }, "Failed to update purchase")
}

export async function deletePurchase(purchaseId: number, deviceId: number) {
  if (!purchaseId || purchaseId <= 0) {
    return { success: false, message: "Valid purchase ID is required" }
  }
  if (!deviceId || deviceId <= 0) {
    return { success: false, message: "Valid device ID is required" }
  }

  return withErrorHandling(async () => {
    await ensureConnection()

    await sql`BEGIN`

    try {
      // Get purchase details
      const purchaseResult = await sql`
        SELECT purchase_status, status, created_by, supplier
        FROM purchases 
        WHERE id = ${purchaseId} AND device_id = ${deviceId}
      `

      if (purchaseResult.length === 0) {
        throw new Error("Purchase not found or access denied")
      }

      const purchase = purchaseResult[0]
      const wasStockAdded = 
        purchase.purchase_status?.toLowerCase() === "delivered" && 
        purchase.status?.toLowerCase() !== "cancelled"

      // Get items to reverse stock changes
      const items = await sql`
        SELECT product_id, quantity FROM purchase_items WHERE purchase_id = ${purchaseId}
      `

      // Reverse stock changes if needed
      if (wasStockAdded && items.length > 0) {
        for (const item of items) {
          await sql`
            UPDATE products
            SET stock = GREATEST(0, COALESCE(stock, 0) - ${item.quantity})
            WHERE id = ${item.product_id}
          `

          // Add stock history
          try {
            await sql`
              INSERT INTO product_stock_history (
                product_id, quantity, type, reference_id, reference_type, notes, created_by
              ) VALUES (
                ${item.product_id}, ${-item.quantity}, 'adjustment', ${purchaseId}, 'purchase',
                ${'Stock removed due to purchase #' + purchaseId + ' deletion'}, ${purchase.created_by}
              )
            `
          } catch (error) {
            console.warn(`Failed to add stock history for product ${item.product_id}:`, error)
          }
        }
      }

      // Delete financial transactions
      try {
        await deletePurchaseTransaction(purchaseId, deviceId)
      } catch (error) {
        console.warn("Failed to delete purchase transaction:", error)
      }

      // Delete purchase items
      await sql`DELETE FROM purchase_items WHERE purchase_id = ${purchaseId}`

      // Delete the purchase
      const result = await sql`
        DELETE FROM purchases 
        WHERE id = ${purchaseId} AND device_id = ${deviceId} 
        RETURNING id
      `

      if (result.length === 0) {
        throw new Error("Failed to delete purchase")
      }

      await sql`COMMIT`

      revalidatePath("/dashboard")
      revalidatePath("/purchases")

      return { deleted: true }
    } catch (error) {
      await sql`ROLLBACK`
      throw error
    }
  }, "Failed to delete purchase")
}

export async function getSuppliers() {
  return withErrorHandling(async () => {
    await ensureConnection()

    const result = await sql`
      SELECT DISTINCT TRIM(supplier) as supplier
      FROM purchases 
      WHERE supplier IS NOT NULL AND TRIM(supplier) != ''
      ORDER BY TRIM(supplier)
    `

    return result.map((row) => row.supplier)
  }, "Failed to fetch suppliers").then(result => ({
    ...result,
    data: result.success ? result.data : []
  }))
}

export async function getPurchaseById(id: number) {
  if (!id || id <= 0) {
    return { success: false, message: "Valid purchase ID is required" }
  }

  return withErrorHandling(async () => {
    await ensureConnection()

    // Get purchase details
    const purchaseResult = await sql`SELECT * FROM purchases WHERE id = ${id}`

    if (purchaseResult.length === 0) {
      throw new Error("Purchase not found")
    }

    // Get purchase items with product details
    const itemsResult = await sql`
      SELECT 
        pi.id,
        pi.product_id,
        pi.quantity,
        pi.price,
        p.name as product_name,
        p.category,
        p.barcode
      FROM purchase_items pi
      LEFT JOIN products p ON pi.product_id = p.id
      WHERE pi.purchase_id = ${id}
      ORDER BY pi.id
    `

    return {
      ...purchaseResult[0],
      items: itemsResult,
    }
  }, "Failed to fetch purchase")
}

// Helper functions

async function ensureColumnsExist() {
  try {
    const columns = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'purchases' 
      AND column_name IN ('device_id', 'payment_method', 'purchase_status', 'received_amount')
    `

    const existingColumns = new Set(columns.map(col => col.column_name))

    if (!existingColumns.has('device_id')) {
      await sql`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS device_id INTEGER`
    }
    if (!existingColumns.has('payment_method')) {
      await sql`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)`
    }
    if (!existingColumns.has('purchase_status')) {
      await sql`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS purchase_status VARCHAR(50) DEFAULT 'Delivered'`
    }
    if (!existingColumns.has('received_amount')) {
      await sql`ALTER TABLE purchases ADD COLUMN IF NOT EXISTS received_amount DECIMAL(12,2) DEFAULT 0`
    }
  } catch (error) {
    console.warn("Failed to ensure columns exist:", error)
  }
}

async function handleStockUpdates(
  purchaseId: number,
  oldPurchase: any,
  newPurchase: any,
  currentItems: any[],
  newItems: any[],
  supplier: string,
  userId: number
) {
  const oldStatus = oldPurchase.status?.toLowerCase()
  const oldPurchaseStatus = oldPurchase.purchase_status?.toLowerCase()
  const newStatus = newPurchase.status?.toLowerCase()
  const newPurchaseStatus = newPurchase.purchase_status?.toLowerCase()

  const wasStockAdded = oldPurchaseStatus === "delivered" && oldStatus !== "cancelled"
  const shouldAddStock = newPurchaseStatus === "delivered" && newStatus !== "cancelled"

  // Create maps for easier lookup
  const currentItemsMap = new Map(currentItems.map(item => [item.product_id, item.quantity]))
  const newItemsMap = new Map(newItems.map(item => [item.product_id, item.quantity]))

  // Get all unique product IDs
  const allProductIds = new Set([...currentItemsMap.keys(), ...newItemsMap.keys()])

  // Apply stock changes
  for (const productId of allProductIds) {
    const oldQuantity = wasStockAdded ? (currentItemsMap.get(productId) || 0) : 0
    const newQuantity = shouldAddStock ? (newItemsMap.get(productId) || 0) : 0
    const netChange = newQuantity - oldQuantity

    if (netChange !== 0) {
      await sql`
        UPDATE products
        SET stock = GREATEST(0, COALESCE(stock, 0) + ${netChange})
        WHERE id = ${productId}
      `

      // Add stock history
      try {
        const historyNote = netChange > 0 
          ? `Stock increased by ${netChange} from purchase #${purchaseId} update - ${supplier}`
          : `Stock decreased by ${Math.abs(netChange)} from purchase #${purchaseId} update - ${supplier}`

        await sql`
          INSERT INTO product_stock_history (
            product_id, quantity, type, reference_id, reference_type, notes, created_by
          ) VALUES (
            ${productId}, ${netChange}, ${netChange > 0 ? 'purchase' : 'adjustment'}, 
            ${purchaseId}, 'purchase', ${historyNote}, ${userId}
          )
        `
      } catch (error) {
        console.warn(`Failed to add stock history for product ${productId}:`, error)
      }
    }
  }
}
