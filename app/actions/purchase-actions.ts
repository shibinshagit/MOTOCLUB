"use server"

import { sql, getLastError, resetConnectionState } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { recordPurchaseTransaction, recordPurchaseAdjustment, deletePurchaseTransaction } from "./simplified-accounting"

export async function getPurchases() {
  try {
    const purchases = await sql`
      SELECT * FROM purchases
      ORDER BY purchase_date DESC
    `

    return { success: true, data: purchases }
  } catch (error) {
    console.error("Get purchases error:", error)
    return { success: false, message: "Failed to fetch purchases" }
  }
}

export async function getUserPurchases(deviceId: number, limit = 500, searchTerm?: string) {
  if (!deviceId) {
    return { success: false, message: "Device ID is required", data: [] }
  }

  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    let purchases

    if (searchTerm && searchTerm.trim() !== "") {
      // Search query
      const searchPattern = `%${searchTerm.toLowerCase()}%`

      purchases = await sql`
        SELECT *
        FROM purchases
        WHERE device_id = ${deviceId}
          AND (LOWER(supplier) LIKE ${searchPattern}
               OR CAST(id AS TEXT) LIKE ${searchPattern}
               OR LOWER(status) LIKE ${searchPattern})
        ORDER BY purchase_date DESC
        LIMIT ${limit}
      `
    } else {
      // Regular query
      purchases = await sql`
        SELECT *
        FROM purchases
        WHERE device_id = ${deviceId}
        ORDER BY purchase_date DESC
        LIMIT ${limit}
      `
    }

    return { success: true, data: purchases }
  } catch (error) {
    console.error("Get device purchases error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
      data: [],
    }
  }
}

export async function getPurchaseDetails(purchaseId: number) {
  try {
    const purchaseItems = await sql`
      SELECT pi.*, p.name as product_name, p.category
      FROM purchase_items pi
      JOIN products p ON pi.product_id = p.id
      WHERE pi.purchase_id = ${purchaseId}
    `

    const purchase = await sql`
      SELECT * FROM purchases
      WHERE id = ${purchaseId}
    `

    if (purchase.length === 0) {
      return { success: false, message: "Purchase not found" }
    }

    return {
      success: true,
      data: {
        purchase: purchase[0],
        items: purchaseItems,
      },
    }
  } catch (error) {
    console.error("Get purchase details error:", error)
    return { success: false, message: "Failed to fetch purchase details" }
  }
}

export async function createPurchase(formData: FormData) {
  const supplier = (formData.get("supplier") as string)?.trim()
  const totalAmount = Number.parseFloat(formData.get("total_amount") as string)
  const status = (formData.get("status") as string) || "Credit"
  const purchaseStatus = (formData.get("purchase_status") as string) || "Delivered"
  const paymentMethod = (formData.get("payment_method") as string) || null
  const userId = Number.parseInt(formData.get("user_id") as string)
  const deviceId = Number.parseInt(formData.get("device_id") as string)
  const purchaseDate = (formData.get("purchase_date") as string) || new Date().toISOString()
  const receivedAmount = Number.parseFloat(formData.get("received_amount") as string) || 0

  // Parse items from JSON string
  const itemsJson = formData.get("items") as string
  let items = []

  try {
    items = JSON.parse(itemsJson)
  } catch (e) {
    return { success: false, message: "Invalid items format" }
  }

  // Normalise items so every numeric field is a real number
  items = items.map((it: any) => ({
    product_id: Number(it.product_id) || 0,
    quantity: Number(it.quantity) || 0,
    price: Number(it.price) || 0,
  }))

  if (!supplier || isNaN(totalAmount) || items.length === 0 || !userId || !deviceId) {
    return { success: false, message: "Supplier, total amount, at least one item, user ID, and device ID are required" }
  }

  // Validate received amount
  if (receivedAmount > totalAmount) {
    return { success: false, message: "Received amount cannot be greater than total amount" }
  }

  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    // Start a transaction
    await sql`BEGIN`

    try {
      // Calculate final received amount based on status
      let finalReceivedAmount = receivedAmount
      if (status.toLowerCase() === "paid") {
        finalReceivedAmount = totalAmount // Full payment
      } else if (status.toLowerCase() === "cancelled") {
        finalReceivedAmount = 0 // No payment
      }

      console.log("Creating purchase with received amount:", finalReceivedAmount)

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
        await sql`ROLLBACK`
        return { success: false, message: "Failed to create purchase" }
      }

      const purchaseId = purchaseResult[0].id
      const isDelivered = purchaseStatus.toLowerCase() === "delivered"
      const isCancelled = status.toLowerCase() === "cancelled"

      // Add purchase items and handle stock...
      for (const item of items) {
        await sql`
          INSERT INTO purchase_items (purchase_id, product_id, quantity, price)
          VALUES (${purchaseId}, ${item.product_id}, ${item.quantity}, ${item.price})
        `

        // Only update stock when purchase status is Delivered AND not Cancelled
        if (isDelivered && !isCancelled) {
          await sql`
            UPDATE products
            SET stock = stock + ${item.quantity}
            WHERE id = ${item.product_id}
          `

          // Add stock history entry for purchase
          try {
            const historyNote = `Stock added from purchase #${purchaseId} - ${supplier}`

            await sql`
              INSERT INTO product_stock_history (
                product_id, quantity, type, reference_id, reference_type, notes, created_by
              ) VALUES (
                ${item.product_id}, ${item.quantity}, 'purchase', ${purchaseId}, 'purchase', 
                ${historyNote}, ${userId}
              )
            `
          } catch (error) {
            console.error("Failed to add stock history for purchase:", error)
            // Continue execution even if this fails
          }
        }
      }

      // Record purchase in simplified accounting system
      await recordPurchaseTransaction({
        purchaseId,
        totalAmount,
        receivedAmount: finalReceivedAmount,
        outstandingAmount: totalAmount - finalReceivedAmount,
        status,
        paymentMethod: paymentMethod || "Cash",
        supplierName: supplier,
        deviceId,
        userId,
        purchaseDate: new Date(purchaseDate),
      })

      // Commit the transaction
      await sql`COMMIT`

      revalidatePath("/dashboard")
      return { success: true, message: "Purchase added successfully", data: purchaseResult[0] }
    } catch (error) {
      await sql`ROLLBACK`
      throw error
    }
  } catch (error) {
    console.error("Add purchase error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
    }
  }
}

export async function updatePurchase(formData: FormData) {
  const purchaseId = Number.parseInt(formData.get("id") as string)
  const supplier = (formData.get("supplier") as string)?.trim()
  const purchaseDate = formData.get("purchase_date") as string
  const totalAmount = Number.parseFloat(formData.get("total_amount") as string)
  const status = (formData.get("status") as string) || "Credit"
  const purchaseStatus = (formData.get("purchase_status") as string) || "Delivered"
  const paymentMethod = (formData.get("payment_method") as string) || null
  const userId = Number.parseInt(formData.get("user_id") as string)
  const deviceId = Number.parseInt(formData.get("device_id") as string)
  const receivedAmount = Number.parseFloat(formData.get("received_amount") as string) || 0

  // Parse items from JSON string
  const itemsJson = formData.get("items") as string
  let items = []

  try {
    items = JSON.parse(itemsJson)
  } catch (e) {
    return { success: false, message: "Invalid items format" }
  }

  // Normalise items so every numeric field is a real number
  items = items.map((it: any) => ({
    product_id: Number(it.product_id) || 0,
    quantity: Number(it.quantity) || 0,
    price: Number(it.price) || 0,
  }))

  if (!purchaseId || !supplier || isNaN(totalAmount) || items.length === 0 || !userId || !deviceId) {
    return {
      success: false,
      message: "Purchase ID, supplier, total amount, at least one item, user ID, and device ID are required",
    }
  }

  // Validate received amount
  if (receivedAmount > totalAmount) {
    return { success: false, message: "Received amount cannot be greater than total amount" }
  }

  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    // Start a transaction
    await sql`BEGIN`

    try {
      // Get current purchase details to check status change
      const currentPurchase = await sql`
        SELECT status, purchase_status, received_amount, total_amount FROM purchases WHERE id = ${purchaseId} AND device_id = ${deviceId}
      `

      if (currentPurchase.length === 0) {
        await sql`ROLLBACK`
        return { success: false, message: "Purchase not found" }
      }

      // Get current items to handle stock changes properly
      const currentItems = await sql`
        SELECT product_id, quantity FROM purchase_items WHERE purchase_id = ${purchaseId}
      `

      // Calculate final received amount based on status
      let finalReceivedAmount = receivedAmount
      if (status.toLowerCase() === "paid") {
        finalReceivedAmount = totalAmount // Full payment
      } else if (status.toLowerCase() === "cancelled") {
        finalReceivedAmount = 0 // No payment
      }

      console.log("Updating purchase with received amount:", finalReceivedAmount)

      // Update purchase with received amount
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
        await sql`ROLLBACK`
        return { success: false, message: "Failed to update purchase" }
      }

      console.log("Purchase updated successfully:", purchaseResult[0])

      // Handle stock updates based on status changes
      const oldStatus = currentPurchase[0].status?.toLowerCase()
      const oldPurchaseStatus = currentPurchase[0].purchase_status?.toLowerCase()
      const newStatus = status.toLowerCase()
      const newPurchaseStatus = purchaseStatus.toLowerCase()

      // Determine if stock was previously added and if it should be added now
      const wasStockAdded = oldPurchaseStatus === "delivered" && oldStatus !== "cancelled"
      const shouldAddStock = newPurchaseStatus === "delivered" && newStatus !== "cancelled"

      console.log("Stock status:", {
        wasStockAdded,
        shouldAddStock,
        oldStatus,
        newStatus,
        oldPurchaseStatus,
        newPurchaseStatus,
      })

      // Create maps for easier lookup
      const currentItemsMap = new Map()
      currentItems.forEach((item) => {
        currentItemsMap.set(item.product_id, item.quantity)
      })

      const newItemsMap = new Map()
      items.forEach((item) => {
        newItemsMap.set(item.product_id, item.quantity)
      })

      // Get all unique product IDs from both old and new items
      const allProductIds = new Set([...currentItemsMap.keys(), ...newItemsMap.keys()])

      // Calculate net changes and update stock accordingly
      const stockChanges = []

      for (const productId of allProductIds) {
        const oldQuantity = wasStockAdded ? currentItemsMap.get(productId) || 0 : 0
        const newQuantity = shouldAddStock ? newItemsMap.get(productId) || 0 : 0
        const netChange = newQuantity - oldQuantity

        if (netChange !== 0) {
          stockChanges.push({
            product_id: productId,
            net_change: netChange,
            old_quantity: oldQuantity,
            new_quantity: newQuantity,
          })

          // Update the product stock
          await sql`
            UPDATE products
            SET stock = stock + ${netChange}
            WHERE id = ${productId}
          `

          // Create a single stock history entry for the net change
          try {
            let historyNote = ""
            let historyType = ""

            if (netChange > 0) {
              historyNote = `Stock increased by ${netChange} from purchase #${purchaseId} update - ${supplier}`
              historyType = "purchase" // was "purchase_update"
            } else {
              historyNote = `Stock decreased by ${Math.abs(netChange)} from purchase #${purchaseId} update - ${supplier}`
              historyType = "adjustment" // was "purchase_update"
            }

            await sql`
              INSERT INTO product_stock_history (
                product_id, quantity, type, reference_id, reference_type, notes, created_by
              ) VALUES (
                ${productId}, ${netChange}, ${historyType}, ${purchaseId}, 'purchase', 
                ${historyNote}, ${userId}
              )
            `
          } catch (error) {
            console.error("Failed to add stock history for purchase update:", error)
            // Continue execution even if this fails
          }
        }
      }

      console.log("Stock changes applied:", stockChanges)

      // Delete existing items and add new ones
      await sql`DELETE FROM purchase_items WHERE purchase_id = ${purchaseId}`

      for (const item of items) {
        await sql`
          INSERT INTO purchase_items (purchase_id, product_id, quantity, price)
          VALUES (${purchaseId}, ${item.product_id}, ${item.quantity}, ${item.price})
        `
      }

      // Get previous values for adjustment tracking
      const previousValues = {
        totalAmount: Number(currentPurchase[0].total_amount) || 0,
        receivedAmount: Number(currentPurchase[0].received_amount) || 0,
        status: currentPurchase[0].status,
      }

      const newValues = {
        totalAmount,
        receivedAmount: finalReceivedAmount,
        status,
      }

      // Record purchase adjustment in simplified accounting system
      await recordPurchaseAdjustment({
        purchaseId,
        changeType: status.toLowerCase() === "cancelled" ? "cancel" : "edit",
        previousValues,
        newValues,
        deviceId,
        userId,
        description: `Purchase #${purchaseId} updated - ${supplier}`,
        adjustmentDate: new Date(),
      })

      // Commit the transaction
      await sql`COMMIT`

      revalidatePath("/dashboard")
      return { success: true, message: "Purchase updated successfully", data: purchaseResult[0] }
    } catch (error) {
      await sql`ROLLBACK`
      throw error
    }
  } catch (error) {
    console.error("Update purchase error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
    }
  }
}

export async function deletePurchase(purchaseId: number, deviceId: number) {
  if (!purchaseId || !deviceId) {
    return { success: false, message: "Purchase ID and Device ID are required" }
  }

  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    // Start a transaction
    await sql`BEGIN`

    try {
      // Get the purchase status first
      const purchaseResult = await sql`
        SELECT purchase_status, status, created_by FROM purchases WHERE id = ${purchaseId} AND device_id = ${deviceId}
      `

      if (purchaseResult.length === 0) {
        await sql`ROLLBACK`
        return { success: false, message: "Purchase not found" }
      }

      const purchase = purchaseResult[0]
      const wasStockAdded =
        purchase.purchase_status?.toLowerCase() === "delivered" && purchase.status?.toLowerCase() !== "cancelled"

      // Get items to restore stock if needed
      const items = await sql`
        SELECT product_id, quantity FROM purchase_items WHERE purchase_id = ${purchaseId}
      `

      // If stock was previously added, remove it
      if (wasStockAdded) {
        console.log("Removing stock for deleted purchase items:", items)
        for (const item of items) {
          await sql`
            UPDATE products
            SET stock = stock - ${item.quantity}
            WHERE id = ${item.product_id}
          `

          // Record negative adjustment
          try {
            await sql`
              INSERT INTO product_stock_history (
                product_id,
                quantity,
                type,
                reference_id,
                reference_type,
                notes,
                created_by
              )
              VALUES (
                ${item.product_id},
                ${-item.quantity},
                'adjustment',                 -- was 'purchase_deletion'
                ${purchaseId},
                'purchase',
                ${`Stock removed due to purchase #${purchaseId} deletion`},
                ${purchase.created_by}
              )
            `
          } catch (error) {
            console.error("Failed to add stock history for deleted purchase:", error)
          }
        }
      }

      // Delete financial transactions
      await deletePurchaseTransaction(purchaseId, deviceId)

      // Delete purchase items first
      await sql`DELETE FROM purchase_items WHERE purchase_id = ${purchaseId}`

      // Delete the purchase with device_id check
      const result = await sql`DELETE FROM purchases WHERE id = ${purchaseId} AND device_id = ${deviceId} RETURNING id`

      if (result.length === 0) {
        await sql`ROLLBACK`
        return { success: false, message: "Failed to delete purchase" }
      }

      // Commit the transaction
      await sql`COMMIT`

      revalidatePath("/dashboard")
      return { success: true, message: "Purchase deleted successfully" }
    } catch (error) {
      await sql`ROLLBACK`
      throw error
    }
  } catch (error) {
    console.error("Delete purchase error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
    }
  }
}

// Add this new function to get unique supplier names
export async function getSuppliers() {
  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    const result = await sql`
      SELECT DISTINCT TRIM(supplier) as supplier
      FROM purchases 
      WHERE supplier IS NOT NULL AND TRIM(supplier) != ''
      ORDER BY TRIM(supplier)
    `

    // Extract just the supplier names as an array of strings
    const suppliers = result.map((row) => row.supplier)

    return { success: true, data: suppliers }
  } catch (error) {
    console.error("Get suppliers error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
      data: [],
    }
  }
}

export async function getPurchaseById(id: number) {
  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    console.log("Fetching purchase with ID:", id)

    // First get the purchase details
    const purchaseResult = await sql`SELECT * FROM purchases WHERE id = ${id}`

    if (purchaseResult.length === 0) {
      console.log("Purchase not found for ID:", id)
      return { success: false, message: "Purchase not found" }
    }

    const purchase = purchaseResult[0]
    console.log("Found purchase:", purchase)

    // Then get the purchase items with product details
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

    console.log("Found purchase items:", itemsResult)

    // Combine purchase and items
    const result = {
      ...purchase,
      items: itemsResult,
    }

    console.log("Final result:", result)

    return { success: true, data: result }
  } catch (error) {
    console.error("Get purchase by ID error:", error)
    return { success: false, message: "Failed to fetch purchase" }
  }
}
