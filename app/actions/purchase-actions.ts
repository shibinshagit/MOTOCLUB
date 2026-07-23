"use server"

import { addDays, parseISO, format } from "date-fns"
import postgres from "postgres"
import { sql, getLastError, resetConnectionState } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { recordPurchaseTransaction, recordPurchaseAdjustment, deletePurchaseTransaction } from "./simplified-accounting"

async function adjustDeviceProductStock(
  productId: number,
  variantId: number | null,
  batchId: number | null,
  deviceId: number,
  quantityChange: number,
  query: any = sql,
) {
  if (!batchId) {
    throw new Error("Batch ID is required for stock adjustment");
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
}

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

interface GetUserPurchasesOptions {
  limit?: number
  searchTerm?: string
  dateFrom?: string
  dateTo?: string
}

function getExclusiveEndDate(dateTo: string): string {
  return format(addDays(parseISO(dateTo), 1), "yyyy-MM-dd")
}

async function queryDevicePurchases(deviceId: number, options: GetUserPurchasesOptions = {}) {
  const { limit, searchTerm, dateFrom, dateTo } = options
  const normalizedSearch = searchTerm?.trim() || null
  const searchPattern = normalizedSearch ? `%${normalizedSearch}%` : null
  // A leading # is how the list displays purchase numbers. Treat it as an ID search
  // without preventing the same term from matching invoice or batch text.
  const purchaseNumberPattern = normalizedSearch ? `%${normalizedSearch.replace(/^#/, "")}%` : null
  const endExclusive = dateTo ? getExclusiveEndDate(dateTo) : null

  return sql`
    SELECT DISTINCT p.*
    FROM purchases p
    LEFT JOIN suppliers s
      ON LOWER(TRIM(s.name)) = LOWER(TRIM(p.supplier))
    LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
    LEFT JOIN products pr ON pr.id = pi.product_id
    LEFT JOIN product_variants pv ON pv.id = pi.product_variant_id
    LEFT JOIN product_batches b ON b.id = pi.batch_id
    WHERE p.device_id = ${deviceId}
      AND (${dateFrom}::date IS NULL OR p.purchase_date >= ${dateFrom}::date)
      AND (${endExclusive}::date IS NULL OR p.purchase_date < ${endExclusive}::date)
      AND (
        ${searchPattern}::text IS NULL
        OR p.supplier ILIKE ${searchPattern}
        OR s.name ILIKE ${searchPattern}
        OR pr.name ILIKE ${searchPattern}
        OR pv.name ILIKE ${searchPattern}
        OR b.batch_no ILIKE ${searchPattern}
        OR p.invoice_number ILIKE ${searchPattern}
        OR p.supplier_invoice_number ILIKE ${searchPattern}
        OR p.status ILIKE ${searchPattern}
        OR p.purchase_status ILIKE ${searchPattern}
        OR p.notes ILIKE ${searchPattern}
        OR CAST(p.id AS TEXT) ILIKE ${purchaseNumberPattern}
      )
    ORDER BY p.purchase_date DESC, p.id DESC
    LIMIT ${limit ?? null}
  `
}

export async function getUserPurchases(
  deviceId: number,
  limitOrOptions: number | GetUserPurchasesOptions = 500,
  searchTerm?: string,
) {
  if (!deviceId) {
    return { success: false, message: "Device ID is required", data: [] }
  }

  const options: GetUserPurchasesOptions =
    typeof limitOrOptions === "object"
      ? limitOrOptions
      : { limit: limitOrOptions, searchTerm }

  resetConnectionState()

  try {
    const purchases = await queryDevicePurchases(deviceId, options)
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
      SELECT 
        pi.*, 
        p.name as product_name, 
        p.category,
        pv.name as variant_name,
        pb.batch_no as batch_no
      FROM purchase_items pi
      JOIN products p ON pi.product_id = p.id
      LEFT JOIN product_variants pv ON pi.product_variant_id = pv.id
      LEFT JOIN product_batches pb ON pi.batch_id = pb.id
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
  items = items.map((it: any) => {
    const quantity = Number(it.quantity) || 0
    const price = Number(it.price) || 0
    const taxPercentage = Number(it.tax_percentage) || 0
    const taxAmount = quantity * price * (taxPercentage / 100)
    const lineTotal = (quantity * price) + taxAmount

    return {
      product_id: Number(it.product_id) || 0,
      variant_id: it.variant_id ? Number(it.variant_id) : null,
      batch_id: it.batch_id ? Number(it.batch_id) : null,
      quantity,
      price,
      tax_percentage: taxPercentage,
      tax_amount: taxAmount,
      line_total: lineTotal,
    }
  })

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
    const result = await sql.begin(async (tx: any) => {
      // Calculate final received amount based on status
      let finalReceivedAmount = receivedAmount
      if (status.toLowerCase() === "paid") {
        finalReceivedAmount = totalAmount // Full payment
      } else if (status.toLowerCase() === "cancelled") {
        finalReceivedAmount = 0 // No payment
      }

      console.log("Creating purchase with received amount:", finalReceivedAmount)

      // Create the purchase
      const purchaseResult = await tx`
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
        throw new Error("Failed to create purchase")
      }

      const purchaseId = purchaseResult[0].id
      const isDelivered = purchaseStatus.toLowerCase() === "delivered"
      const isCancelled = status.toLowerCase() === "cancelled"

      // Add purchase items and handle stock...
      for (let item of items) {
        // Resolve variant: use provided variant_id, or fetch the default variant.
        // If no variant exists (legacy product), auto-create one so purchase never fails.
        let variantId = item.variant_id || null;
        if (!variantId) {
          const defaultVariant = await tx`
            SELECT id FROM product_variants WHERE product_id = ${item.product_id} ORDER BY id ASC LIMIT 1
          `;
          if (defaultVariant.length > 0) {
            variantId = defaultVariant[0].id;
          }
        }

        // Every purchase MUST create a NEW BATCH — never reuse or merge.
        let batchId: number | null = null;
        if (isDelivered && !isCancelled) {
          const batchNo = `PUR-${purchaseId || 0}-${item.product_id}-${Date.now().toString().slice(-4)}`;
          const newBatch = await tx`
            INSERT INTO product_batches (
              product_id, product_variant_id, batch_no, cost_price, selling_price,
              quantity_purchased, remaining_quantity, status, purchase_id
            ) VALUES (
              ${item.product_id}, ${variantId}, ${batchNo}, ${item.price}, ${item.price},
              ${item.quantity}, ${item.quantity}, 'active', ${purchaseId}
            ) RETURNING id
          `;
          batchId = newBatch[0].id;
        }
        item.variant_id = variantId;
        item.batch_id = batchId;

        await tx`
          INSERT INTO purchase_items (purchase_id, product_id, product_variant_id, batch_id, quantity, price, tax_percentage, tax_amount, line_total)
          VALUES (${purchaseId}, ${item.product_id}, ${item.variant_id || null}, ${item.batch_id || null}, ${item.quantity}, ${item.price}, ${item.tax_percentage}, ${item.tax_amount}, ${item.line_total})
        `

        // Only update stock when purchase status is Delivered AND not Cancelled
        if (isDelivered && !isCancelled) {
          await adjustDeviceProductStock(item.product_id, (item as any).variant_id || null, (item as any).batch_id || null, deviceId, Number(item.quantity), tx)

          // Add stock history entry for purchase
          try {
            const historyNote = `Stock added from purchase #${purchaseId} - ${supplier}`

            await tx`
              INSERT INTO product_stock_history (
                product_id, product_variant_id, batch_id, quantity, type, reference_id, reference_type, notes, created_by, device_id
              ) VALUES (
                ${item.product_id}, ${item.variant_id}, ${item.batch_id}, ${item.quantity}, 'purchase', ${purchaseId}, 'purchase', 
                ${historyNote}, ${userId}, ${deviceId}
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
      }, tx)

      return { success: true, message: "Purchase added successfully", data: purchaseResult[0] }
    })

    revalidatePath("/dashboard")
    return result
  } catch (error) {
    console.error("Add purchase error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
    }
  }
}

/** Receives an ordered purchase exactly once and makes its batches saleable. */
export async function markPurchaseDelivered(purchaseId: number, deviceId: number) {
  if (!purchaseId || !deviceId) return { success: false, message: "Purchase and device are required" }
  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.NEON_POSTGRES_URL || process.env.NEON_POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL
  if (!databaseUrl) return { success: false, message: "Database connection is not configured" }
  const client = postgres(databaseUrl, { max: 1 })
  console.log("[receive purchase] request received", { purchaseId, deviceId })
  try {
    const outcome = await client.begin(async (tx) => {
      console.log("[receive purchase] transaction started")
      // A lock must surface as an error, never hold the UI in a pending state.
      await tx`SET LOCAL statement_timeout = '15s'`
      await tx`SET LOCAL lock_timeout = '15s'`
      const purchases = await tx`
        SELECT id, supplier, status, purchase_status, created_by
        FROM purchases WHERE id = ${purchaseId} AND device_id = ${deviceId}
        FOR UPDATE
      `
      if (!purchases.length) {
        return { success: false, message: "Purchase not found" }
      }

      const purchase = purchases[0]
      if (String(purchase.purchase_status).toLowerCase() === "delivered") {
        return { success: true, alreadyDelivered: true, message: "Purchase is already delivered" }
      }
      if (String(purchase.purchase_status).toLowerCase() !== "ordered" || String(purchase.status).toLowerCase() === "cancelled") {
        return { success: false, message: "Only active ordered purchases can be delivered" }
      }

      console.log("[receive purchase] loading items")
      const items = await tx`
        SELECT id, product_id, product_variant_id, batch_id, quantity, price
        FROM purchase_items WHERE purchase_id = ${purchaseId}
      `
      for (const item of items) {
        const quantity = Number(item.quantity) || 0
        if (quantity <= 0) continue
        if (!item.product_variant_id) throw new Error(`Purchase item ${item.id} has no variant`)

        let batchId = item.batch_id ? Number(item.batch_id) : null
        if (batchId) {
          const existingBatch = await tx`
            SELECT id FROM product_batches
            WHERE id = ${batchId}
              AND purchase_id = ${purchaseId}
              AND product_id = ${item.product_id}
              AND product_variant_id = ${item.product_variant_id}
          `
          if (existingBatch.length === 0) batchId = null
        }
        if (!batchId) {
          const batchNo = `PUR-${purchaseId}-${item.product_id}-${item.id}`
          console.log("[receive purchase] creating batch", { itemId: item.id })
          const batches = await tx`
            INSERT INTO product_batches (
              product_id, product_variant_id, batch_no, cost_price, selling_price,
              quantity_purchased, remaining_quantity, status, purchase_id
            ) VALUES (
              ${item.product_id}, ${item.product_variant_id}, ${batchNo}, ${item.price}, ${item.price},
              ${quantity}, ${quantity}, 'active', ${purchaseId}
            ) RETURNING id
          `
          batchId = Number(batches[0].id)
          await tx`UPDATE purchase_items SET batch_id = ${batchId} WHERE id = ${item.id}`
        }
        await adjustDeviceProductStock(item.product_id, item.product_variant_id, batchId, deviceId, quantity, tx)
        await tx`
          INSERT INTO product_stock_history (
            product_id, product_variant_id, batch_id, quantity, type, reference_id, reference_type, notes, created_by, device_id
          ) VALUES (
            ${item.product_id}, ${item.product_variant_id}, ${batchId}, ${quantity}, 'purchase', ${purchaseId}, 'purchase',
            ${`Stock received from purchase #${purchaseId} - ${purchase.supplier}`}, ${purchase.created_by}, ${deviceId}
          )
        `
      }

      console.log("[receive purchase] updating status")
      const result = await tx`
        UPDATE purchases SET purchase_status = 'Delivered', updated_at = NOW()
        WHERE id = ${purchaseId} AND device_id = ${deviceId} AND purchase_status = 'Ordered' RETURNING *
      `
      if (!result.length) throw new Error("Purchase status changed while receiving")
      console.log("[receive purchase] transaction committing")
      return { success: true, data: result[0], message: "Purchase marked as delivered" }
    })
    console.log("[receive purchase] response sent", outcome)
    revalidatePath("/dashboard")
    return outcome
  } catch (error) {
    // postgres rolls back begin() automatically when this callback throws.
    console.error("[receive purchase] transaction rolled back", error)
    return { success: false, message: "Unable to receive purchase" }
  } finally {
    await client.end({ timeout: 5 })
    console.log("[receive purchase] database client released")
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
  items = items.map((it: any) => {
    const quantity = Number(it.quantity) || 0
    const price = Number(it.price) || 0
    const taxPercentage = Number(it.tax_percentage) || 0
    const taxAmount = quantity * price * (taxPercentage / 100)
    const lineTotal = (quantity * price) + taxAmount

    return {
      product_id: Number(it.product_id) || 0,
      variant_id: it.variant_id ? Number(it.variant_id) : null,
      batch_id: it.batch_id ? Number(it.batch_id) : null,
      quantity,
      price,
      tax_percentage: taxPercentage,
      tax_amount: taxAmount,
      line_total: lineTotal,
    }
  })

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
    const result = await sql.begin(async (tx: any) => {
      // Get current purchase details to check status change
      const currentPurchase = await tx`
        SELECT status, purchase_status, received_amount, total_amount FROM purchases WHERE id = ${purchaseId} AND device_id = ${deviceId}
      `

      if (currentPurchase.length === 0) {
        throw new Error("Purchase not found")
      }

      // Get current items to handle stock changes properly
      const currentItems = await tx`
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
      const purchaseResult = await tx`
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
      currentItems.forEach((item: any) => {
        currentItemsMap.set(item.product_id, item.quantity)
      })

      const newItemsMap = new Map()
      items.forEach((item: any) => {
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

          // Update the product stock for this device
          await adjustDeviceProductStock(productId, null, null, deviceId, Number(netChange), tx)

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

            await tx`
              INSERT INTO product_stock_history (
                product_id, quantity, type, reference_id, reference_type, notes, created_by, device_id
              ) VALUES (
                ${productId}, ${netChange}, ${historyType}, ${purchaseId}, 'purchase', 
                ${historyNote}, ${userId}, ${deviceId}
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
      await tx`DELETE FROM purchase_items WHERE purchase_id = ${purchaseId}`

      for (let item of items) {
        // Resolve variant: use provided variant_id, or fetch the default variant.
        // If no variant exists (legacy product), auto-create one so purchase never fails.
        let variantId = item.variant_id;
        if (!variantId) {
          const defaultVariant = await tx`
            SELECT id FROM product_variants WHERE product_id = ${item.product_id} ORDER BY id ASC LIMIT 1
          `;
          if (defaultVariant.length > 0) {
            variantId = defaultVariant[0].id;
          } else {
            console.log(`[Purchase] Auto-creating default variant for product ${item.product_id}`);
            const autoVariant = await tx`
              INSERT INTO product_variants (
                product_id, name, cost_price, wholesale_price, price, msp, mrp, minimum_stock, status
              ) VALUES (
                ${item.product_id}, 'Default', ${item.price}, ${item.price}, ${item.price},
                ${item.price}, ${item.price}, 0, 'active'
              ) RETURNING id
            `;
            variantId = autoVariant[0].id;
          }
        }

        // Every purchase MUST create a NEW BATCH — never reuse or merge.
        let batchId: number | null = null;
        if (shouldAddStock) {
          const batchNo = `PUR-${purchaseId || 0}-${item.product_id}-${Date.now().toString().slice(-4)}`;
          const newBatch = await tx`
            INSERT INTO product_batches (
              product_id, product_variant_id, batch_no, cost_price, selling_price,
              quantity_purchased, remaining_quantity, status, purchase_id
            ) VALUES (
              ${item.product_id}, ${variantId}, ${batchNo}, ${item.price}, ${item.price},
              ${item.quantity}, ${item.quantity}, 'active', ${purchaseId}
            ) RETURNING id
          `;
          batchId = newBatch[0].id;
        }
        item.variant_id = variantId;
        item.batch_id = batchId;

        await tx`
          INSERT INTO purchase_items (purchase_id, product_id, product_variant_id, batch_id, quantity, price, tax_percentage, tax_amount, line_total)
          VALUES (${purchaseId}, ${item.product_id}, ${item.variant_id || null}, ${item.batch_id || null}, ${item.quantity}, ${item.price}, ${item.tax_percentage}, ${item.tax_amount}, ${item.line_total})
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

      return { success: true, message: "Purchase updated successfully", data: purchaseResult[0] }
    })

    revalidatePath("/dashboard")
    return result
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
    const result = await sql.begin(async (tx: any) => {
      // Get the purchase status first
      const purchaseResult = await tx`
        SELECT purchase_status, status, created_by FROM purchases WHERE id = ${purchaseId} AND device_id = ${deviceId}
      `

      if (purchaseResult.length === 0) {
        await tx`ROLLBACK`
        return { success: false, message: "Purchase not found" }
      }

      const purchase = purchaseResult[0]
      const wasStockAdded =
        purchase.purchase_status?.toLowerCase() === "delivered" && purchase.status?.toLowerCase() !== "cancelled"

      // Get items to restore stock if needed
      const items = await tx`
        SELECT product_id, quantity FROM purchase_items WHERE purchase_id = ${purchaseId}
      `

      // If stock was previously added, remove it
      if (wasStockAdded) {
        console.log("Removing stock for deleted purchase items:", items)
        for (let item of items) {
        // Resolve variant: use provided variant_id, or fetch the default variant.
        // If no variant exists (legacy product), auto-create one so purchase never fails.
        let variantId = item.variant_id;
        if (!variantId) {
          const defaultVariant = await tx`
            SELECT id FROM product_variants WHERE product_id = ${item.product_id} ORDER BY id ASC LIMIT 1
          `;
          if (defaultVariant.length > 0) {
            variantId = defaultVariant[0].id;
          } else {
            console.log(`[Purchase] Auto-creating default variant for product ${item.product_id}`);
            const autoVariant = await tx`
              INSERT INTO product_variants (
                product_id, name, cost_price, wholesale_price, price, msp, mrp, minimum_stock, status
              ) VALUES (
                ${item.product_id}, 'Default', ${item.price}, ${item.price}, ${item.price},
                ${item.price}, ${item.price}, 0, 'active'
              ) RETURNING id
            `;
            variantId = autoVariant[0].id;
          }
        }

        // Every purchase MUST create a NEW BATCH — never reuse or merge.
        const batchNo = `PUR-${purchaseId || 0}-${item.product_id}-${Date.now().toString().slice(-4)}`;
        const newBatch = await tx`
          INSERT INTO product_batches (
            product_id, product_variant_id, batch_no, cost_price, selling_price,
            quantity_purchased, remaining_quantity, status, purchase_id
          ) VALUES (
            ${item.product_id}, ${variantId}, ${batchNo}, ${item.price}, ${item.price},
            ${item.quantity}, ${item.quantity}, 'active', ${purchaseId}
          ) RETURNING id
        `;
        let batchId = newBatch[0].id;
        item.variant_id = variantId;
        item.batch_id = batchId;

          await adjustDeviceProductStock(item.product_id, (item as any).variant_id || null, (item as any).batch_id || null, deviceId, -Number(item.quantity))

          // Record negative adjustment
          try {
            await tx`
              INSERT INTO product_stock_history (
                product_id,
                quantity,
                type,
                reference_id,
                reference_type,
                notes,
                created_by,
                device_id
              )
              VALUES (
                ${item.product_id},
                ${-item.quantity},
                'adjustment',                 -- was 'purchase_deletion'
                ${purchaseId},
                'purchase',
                ${`Stock removed due to purchase #${purchaseId} deletion`},
                ${purchase.created_by},
                ${deviceId}
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
      await tx`DELETE FROM purchase_items WHERE purchase_id = ${purchaseId}`

      // Delete the purchase with device_id check
      const result = await tx`DELETE FROM purchases WHERE id = ${purchaseId} AND device_id = ${deviceId} RETURNING id`

      if (result.length === 0) {
        await tx`ROLLBACK`
        return { success: false, message: "Failed to delete purchase" }
      }

      return { success: true, message: "Purchase deleted successfully" }
    })

    revalidatePath("/dashboard")
    return result
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
    const suppliers = result.map((row: any) => row.supplier)

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
