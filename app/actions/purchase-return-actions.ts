"use server"

import { sql } from "@/lib/db"
import { revalidatePath, unstable_noStore as noStore } from "next/cache"
import { resolveStaffSessionContext } from "@/lib/staff-restrictions-server"
import { adjustDeviceProductStock } from "@/lib/inventory-service"

export async function ensurePurchaseReturnTablesExist() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS purchase_returns (
        id SERIAL PRIMARY KEY,
        purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
        device_id INTEGER,
        supplier_id INTEGER,
        supplier_name VARCHAR(255),
        return_number VARCHAR(50) NOT NULL,
        calculated_return_value DECIMAL(12,2) NOT NULL DEFAULT 0,
        refund_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        refund_payment_method VARCHAR(50) DEFAULT 'Cash',
        reason TEXT,
        status VARCHAR(50) DEFAULT 'Completed',
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `

    await sql`
      CREATE TABLE IF NOT EXISTS purchase_return_items (
        id SERIAL PRIMARY KEY,
        purchase_return_id INTEGER NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
        purchase_id INTEGER NOT NULL,
        purchase_item_id INTEGER NOT NULL REFERENCES purchase_items(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL,
        product_variant_id INTEGER,
        batch_id INTEGER,
        returned_quantity INTEGER NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        tax_percentage DECIMAL(5,2) DEFAULT 0,
        tax_amount DECIMAL(10,2) DEFAULT 0,
        calculated_value DECIMAL(12,2) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `

    await sql`ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS returned_quantity INTEGER DEFAULT 0`
  } catch (err) {
    console.error("Error ensuring purchase return tables exist:", err)
  }
}

export interface PurchaseReturnItemInput {
  purchaseItemId: number
  returnQuantity: number
}

export interface ProcessPurchaseReturnInput {
  purchaseId: number
  items: PurchaseReturnItemInput[]
  refundAmount: number
  refundPaymentMethod?: string
  reason?: string
  deviceId?: number
  userId?: number
}

export async function processPurchaseReturn(input: ProcessPurchaseReturnInput) {
  noStore()
  try {
    await ensurePurchaseReturnTablesExist()

    const { purchaseId, items: returnItemInputs, refundAmount, refundPaymentMethod, reason } = input

    if (!purchaseId || !Array.isArray(returnItemInputs) || returnItemInputs.length === 0) {
      return { success: false, message: "Invalid request parameters" }
    }

    const resolvedDeviceId = input.deviceId || 1
    const context = await resolveStaffSessionContext(resolvedDeviceId)
    const resolvedUserId = input.userId || context?.id || null

    const purchaseRows = await sql`
      SELECT id, supplier, status, payment_method, total_amount, device_id, purchase_status
      FROM purchases
      WHERE id = ${purchaseId}
      LIMIT 1
    `

    if (purchaseRows.length === 0) {
      return { success: false, message: "Purchase not found" }
    }

    const purchase = purchaseRows[0]
    if (purchase.status === "Cancelled" || purchase.purchase_status === "Cancelled") {
      return { success: false, message: "Cannot process return for a cancelled purchase" }
    }

    const dbPurchaseItems = await sql`
      SELECT 
        pi.id,
        pi.product_id,
        pi.product_variant_id,
        pi.batch_id,
        pi.quantity as purchased_quantity,
        COALESCE(pi.returned_quantity, 0) as existing_returned_qty,
        COALESCE((
          SELECT SUM(pri.returned_quantity) 
          FROM purchase_return_items pri 
          WHERE pri.purchase_item_id = pi.id
        ), 0) as calc_returned_qty,
        pi.price,
        COALESCE(pi.tax_percentage, 0) as tax_percentage,
        p.name as product_name
      FROM purchase_items pi
      LEFT JOIN products p ON pi.product_id = p.id
      WHERE pi.purchase_id = ${purchaseId}
    `

    if (dbPurchaseItems.length === 0) {
      return { success: false, message: "No line items found for this purchase" }
    }

    let totalCalculatedReturnValue = 0
    let totalReturnedQtyCount = 0

    const itemsToReturn: Array<{
      purchaseItemId: number
      productId: number
      productVariantId: number | null
      batchId: number | null
      returnQuantity: number
      unitPrice: number
      taxPercentage: number
      taxAmount: number
      calculatedValue: number
      productName: string
    }> = []

    for (const inputItem of returnItemInputs) {
      const returnQty = Number(inputItem.returnQuantity) || 0
      if (returnQty <= 0) continue

      const matchedDbItem = dbPurchaseItems.find((i: any) => Number(i.id) === Number(inputItem.purchaseItemId))
      if (!matchedDbItem) {
        return { success: false, message: `Purchase item ID #${inputItem.purchaseItemId} not found in this purchase` }
      }

      const purchasedQty = Number(matchedDbItem.purchased_quantity || 0)
      const alreadyReturned = Math.max(
        Number(matchedDbItem.existing_returned_qty || 0),
        Number(matchedDbItem.calc_returned_qty || 0)
      )
      const remainingReturnable = Math.max(0, purchasedQty - alreadyReturned)

      if (returnQty > remainingReturnable) {
        return {
          success: false,
          message: `Cannot return ${returnQty} units for ${matchedDbItem.product_name || "product"}. Max returnable quantity is ${remainingReturnable}.`,
        }
      }

      const unitPrice = Number(matchedDbItem.price) || 0
      const taxPercentage = Number(matchedDbItem.tax_percentage) || 0
      
      const lineBaseValue = returnQty * unitPrice
      const lineTaxAmount = lineBaseValue * (taxPercentage / 100)
      const lineCalculatedValue = lineBaseValue + lineTaxAmount

      totalCalculatedReturnValue += lineCalculatedValue
      totalReturnedQtyCount += returnQty

      itemsToReturn.push({
        purchaseItemId: Number(matchedDbItem.id),
        productId: Number(matchedDbItem.product_id),
        productVariantId: matchedDbItem.product_variant_id ? Number(matchedDbItem.product_variant_id) : null,
        batchId: matchedDbItem.batch_id ? Number(matchedDbItem.batch_id) : null,
        returnQuantity: returnQty,
        unitPrice,
        taxPercentage,
        taxAmount: lineTaxAmount,
        calculatedValue: lineCalculatedValue,
        productName: matchedDbItem.product_name || `Product #${matchedDbItem.product_id}`,
      })
    }

    if (itemsToReturn.length === 0 || totalReturnedQtyCount <= 0) {
      return { success: false, message: "Please select at least one item with a valid return quantity." }
    }

    const parsedRefundAmount = Number(refundAmount) || 0
    if (parsedRefundAmount < 0) {
      return { success: false, message: "Refund amount cannot be negative." }
    }
    
    // Allow refund amount to be slightly higher or lower based on user input, 
    // but typically it shouldn't exceed the total returned product value.
    if (parsedRefundAmount > totalCalculatedReturnValue + 1) { // Add 1 for rounding leniency
      return {
        success: false,
        message: `Refund amount (₹${parsedRefundAmount.toFixed(2)}) cannot exceed total returned product value (₹${totalCalculatedReturnValue.toFixed(2)}).`,
      }
    }

    const returnNumber = `PRET-${purchaseId}-${Date.now().toString().slice(-4)}`
    const paymentMethod = refundPaymentMethod || purchase.payment_method || "Cash"

    // Optional: Use transaction if supported by your sql helper, here using standard sql execution
    const returnRecord = await sql`
      INSERT INTO purchase_returns (
        purchase_id, device_id, supplier_name, return_number,
        calculated_return_value, refund_amount, refund_payment_method,
        reason, status, created_by, created_at
      ) VALUES (
        ${purchaseId}, ${resolvedDeviceId}, ${purchase.supplier || null}, ${returnNumber},
        ${totalCalculatedReturnValue}, ${parsedRefundAmount}, ${paymentMethod},
        ${reason || "Purchase Return"}, 'Completed', ${resolvedUserId}, NOW()
      )
      RETURNING id
    `

    const returnId = returnRecord[0].id

    for (const item of itemsToReturn) {
      await sql`
        INSERT INTO purchase_return_items (
          purchase_return_id, purchase_id, purchase_item_id, product_id,
          product_variant_id, batch_id, returned_quantity,
          unit_price, tax_percentage, tax_amount, calculated_value, created_at
        ) VALUES (
          ${returnId}, ${purchaseId}, ${item.purchaseItemId}, ${item.productId},
          ${item.productVariantId}, ${item.batchId}, ${item.returnQuantity},
          ${item.unitPrice}, ${item.taxPercentage}, ${item.taxAmount}, ${item.calculatedValue}, NOW()
        )
      `

      await sql`
        UPDATE purchase_items
        SET returned_quantity = COALESCE(returned_quantity, 0) + ${item.returnQuantity}
        WHERE id = ${item.purchaseItemId}
      `

      if (item.productId > 0) {
        // Decrease stock by returnQuantity
        await adjustDeviceProductStock(
          item.productId,
          item.productVariantId,
          item.batchId,
          resolvedDeviceId,
          -item.returnQuantity
        )

        try {
          await sql`
            INSERT INTO product_stock_history (
              product_id, product_variant_id, batch_id, quantity,
              type, reference_id, reference_type, notes, created_by, device_id, created_at
            ) VALUES (
              ${item.productId}, ${item.productVariantId}, ${item.batchId}, ${-item.returnQuantity},
              'Purchase Return', ${returnId}, 'purchase_return', ${"Purchase Return #" + returnNumber + " (Purchase #" + purchaseId + ")"}, ${resolvedUserId || resolvedDeviceId}, ${resolvedDeviceId}, NOW()
            )
          `
        } catch (histErr) {
          console.error("Failed writing stock history for return:", histErr)
        }
      }
    }

    const remainingItemsCheck = await sql`
      SELECT 
        SUM(pi.quantity) as total_purchased,
        SUM(COALESCE(pi.returned_quantity, 0)) as total_returned
      FROM purchase_items pi
      WHERE pi.purchase_id = ${purchaseId}
    `

    let isFullyReturned = false
    if (remainingItemsCheck.length > 0) {
      const purSum = Number(remainingItemsCheck[0].total_purchased || 0)
      const retSum = Number(remainingItemsCheck[0].total_returned || 0)
      if (purSum > 0 && retSum >= purSum) {
        isFullyReturned = true
      }
    }

    if (isFullyReturned) {
      await sql`
        UPDATE purchases
        SET purchase_status = 'Fully Returned', updated_at = NOW()
        WHERE id = ${purchaseId}
      `
    } else {
      await sql`
        UPDATE purchases
        SET purchase_status = 'Partially Returned', updated_at = NOW()
        WHERE id = ${purchaseId}
      `
    }

    try {
      const description = `Purchase Return #${returnNumber} for Purchase #${purchaseId} - Refunded ₹${parsedRefundAmount.toFixed(2)} (Returned Product Value: ₹${totalCalculatedReturnValue.toFixed(2)})`

      await sql`
        INSERT INTO financial_transactions (
          transaction_name, transaction_type, reference_type, reference_id,
          amount, received_amount, cost_amount, debit_amount, credit_amount,
          status, payment_method, description, notes, device_id, company_id, created_by, transaction_date
        ) VALUES (
          'Purchase Return', 'purchase_return', 'purchase', ${purchaseId},
          ${parsedRefundAmount}, ${parsedRefundAmount}, 0, 0, ${parsedRefundAmount}, 
          'Completed', ${paymentMethod},
          ${description}, ${reason || null}, ${resolvedDeviceId}, 1,
          ${resolvedUserId || resolvedDeviceId}, NOW()
        )
      `
    } catch (finErr) {
      console.error("Failed recording financial transaction for purchase return:", finErr)
    }

    revalidatePath("/purchases")
    revalidatePath(`/purchases/${purchaseId}`)
    revalidatePath("/dashboard")

    return {
      success: true,
      message: `Return #${returnNumber} processed successfully. ${totalReturnedQtyCount} item(s) deducted from stock.`,
      returnId,
      returnNumber,
    }
  } catch (error) {
    console.error("Error processing purchase return:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to process purchase return",
    }
  }
}
