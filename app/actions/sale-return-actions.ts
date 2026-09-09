"use server"

import { sql } from "@/lib/db"
import { revalidatePath, unstable_noStore as noStore } from "next/cache"
import { resolveStaffSessionContext } from "@/lib/staff-restrictions-server"
import { updateProductStock } from "@/app/actions/sale-actions"

/**
 * Ensures table structures exist for Sale Returns.
 */
export async function ensureReturnTablesExist() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS sale_returns (
        id SERIAL PRIMARY KEY,
        sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        device_id INTEGER,
        customer_id INTEGER,
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
      CREATE TABLE IF NOT EXISTS sale_return_items (
        id SERIAL PRIMARY KEY,
        sale_return_id INTEGER NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
        sale_id INTEGER NOT NULL,
        sale_item_id INTEGER NOT NULL REFERENCES sale_items(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL,
        product_variant_id INTEGER,
        batch_id INTEGER,
        returned_quantity INTEGER NOT NULL,
        unit_price DECIMAL(10,2) NOT NULL,
        unit_cost DECIMAL(12,2) DEFAULT 0,
        calculated_value DECIMAL(12,2) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `

    await sql`ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS returned_quantity INTEGER DEFAULT 0`
  } catch (err) {
    console.error("Error ensuring return tables exist:", err)
  }
}

export interface SaleReturnItemInput {
  saleItemId: number
  returnQuantity: number
}

export interface ProcessSaleReturnInput {
  saleId: number
  items: SaleReturnItemInput[]
  refundAmount: number
  refundPaymentMethod?: string
  reason?: string
  deviceId?: number
  userId?: number
}

/**
 * Processes a partial or full sale return cleanly and safely.
 */
export async function processSaleReturn(input: ProcessSaleReturnInput) {
  noStore()
  try {
    await ensureReturnTablesExist()

    const { saleId, items: returnItemInputs, refundAmount, refundPaymentMethod, reason } = input

    if (!saleId || !Array.isArray(returnItemInputs) || returnItemInputs.length === 0) {
      return { success: false, message: "Invalid request parameters" }
    }

    // Resolve context/device
    const resolvedDeviceId = input.deviceId || 1
    const context = await resolveStaffSessionContext(resolvedDeviceId)
    const resolvedUserId = input.userId || context?.id || null

    // 1. Fetch sale record
    const saleRows = await sql`
      SELECT id, customer_id, status, payment_method, total_amount, device_id
      FROM sales
      WHERE id = ${saleId}
      LIMIT 1
    `

    if (saleRows.length === 0) {
      return { success: false, message: "Sale not found" }
    }

    const sale = saleRows[0]
    if (sale.status === "Cancelled") {
      return { success: false, message: "Cannot process return for a cancelled sale" }
    }

    // 2. Fetch all line items for this sale
    const dbSaleItems = await sql`
      SELECT 
        si.id,
        si.product_id,
        si.product_variant_id,
        si.batch_id,
        si.quantity as sold_quantity,
        COALESCE(si.returned_quantity, 0) as existing_returned_qty,
        COALESCE((
          SELECT SUM(sri.returned_quantity) 
          FROM sale_return_items sri 
          WHERE sri.sale_item_id = si.id
        ), 0) as calc_returned_qty,
        si.price,
        COALESCE(si.cost, 0) as cost,
        p.name as product_name
      FROM sale_items si
      LEFT JOIN products p ON si.product_id = p.id
      WHERE si.sale_id = ${saleId}
    `

    if (dbSaleItems.length === 0) {
      return { success: false, message: "No line items found for this sale" }
    }

    // Server-Side Validation & Calculation
    let totalCalculatedReturnValue = 0
    let totalCogsRestored = 0
    let totalReturnedQtyCount = 0

    const itemsToReturn: Array<{
      saleItemId: number
      productId: number
      productVariantId: number | null
      batchId: number | null
      returnQuantity: number
      unitPrice: number
      unitCost: number
      calculatedValue: number
      productName: string
    }> = []

    for (const inputItem of returnItemInputs) {
      const returnQty = Number(inputItem.returnQuantity) || 0
      if (returnQty <= 0) continue

      const matchedDbItem = dbSaleItems.find((i: any) => Number(i.id) === Number(inputItem.saleItemId))
      if (!matchedDbItem) {
        return { success: false, message: `Sale item ID #${inputItem.saleItemId} not found in this sale` }
      }

      const soldQty = Number(matchedDbItem.sold_quantity || 0)
      const alreadyReturned = Math.max(
        Number(matchedDbItem.existing_returned_qty || 0),
        Number(matchedDbItem.calc_returned_qty || 0)
      )
      const remainingReturnable = Math.max(0, soldQty - alreadyReturned)

      if (returnQty > remainingReturnable) {
        return {
          success: false,
          message: `Cannot return ${returnQty} units for ${matchedDbItem.product_name || "product"}. Max returnable quantity is ${remainingReturnable}.`,
        }
      }

      const unitPrice = Number(matchedDbItem.price) || 0
      const unitCost = Number(matchedDbItem.cost) || 0
      const lineCalculatedValue = returnQty * unitPrice
      const lineCogs = returnQty * unitCost

      totalCalculatedReturnValue += lineCalculatedValue
      totalCogsRestored += lineCogs
      totalReturnedQtyCount += returnQty

      itemsToReturn.push({
        saleItemId: Number(matchedDbItem.id),
        productId: Number(matchedDbItem.product_id),
        productVariantId: matchedDbItem.product_variant_id ? Number(matchedDbItem.product_variant_id) : null,
        batchId: matchedDbItem.batch_id ? Number(matchedDbItem.batch_id) : null,
        returnQuantity: returnQty,
        unitPrice,
        unitCost,
        calculatedValue: lineCalculatedValue,
        productName: matchedDbItem.product_name || `Product #${matchedDbItem.product_id}`,
      })
    }

    if (itemsToReturn.length === 0 || totalReturnedQtyCount <= 0) {
      return { success: false, message: "Please select at least one item with a valid return quantity." }
    }

    // 3. Refund Amount Validation
    const parsedRefundAmount = Number(refundAmount) || 0
    if (parsedRefundAmount < 0) {
      return { success: false, message: "Refund amount cannot be negative." }
    }
    if (parsedRefundAmount > totalCalculatedReturnValue) {
      return {
        success: false,
        message: `Refund amount (₹${parsedRefundAmount.toFixed(2)}) cannot exceed total returned product value (₹${totalCalculatedReturnValue.toFixed(2)}).`,
      }
    }

    const returnNumber = `RET-${saleId}-${Date.now().toString().slice(-4)}`
    const paymentMethod = refundPaymentMethod || sale.payment_method || "Cash"

    // 4. Create Master Return Record
    const returnRecord = await sql`
      INSERT INTO sale_returns (
        sale_id, device_id, customer_id, return_number,
        calculated_return_value, refund_amount, refund_payment_method,
        reason, status, created_by, created_at
      ) VALUES (
        ${saleId}, ${resolvedDeviceId}, ${sale.customer_id || null}, ${returnNumber},
        ${totalCalculatedReturnValue}, ${parsedRefundAmount}, ${paymentMethod},
        ${reason || "Sale Return"}, 'Completed', ${resolvedUserId}, NOW()
      )
      RETURNING id
    `

    const returnId = returnRecord[0].id

    // 5. Create Detail Items & Restore Stock
    for (const item of itemsToReturn) {
      // Insert return item detail
      await sql`
        INSERT INTO sale_return_items (
          sale_return_id, sale_id, sale_item_id, product_id,
          product_variant_id, batch_id, returned_quantity,
          unit_price, unit_cost, calculated_value, created_at
        ) VALUES (
          ${returnId}, ${saleId}, ${item.saleItemId}, ${item.productId},
          ${item.productVariantId}, ${item.batchId}, ${item.returnQuantity},
          ${item.unitPrice}, ${item.unitCost}, ${item.calculatedValue}, NOW()
        )
      `

      // Update sale_items returned_quantity column
      await sql`
        UPDATE sale_items
        SET returned_quantity = COALESCE(returned_quantity, 0) + ${item.returnQuantity}
        WHERE id = ${item.saleItemId}
      `

      // Restore inventory to original source (variant / batch / device)
      if (item.productId > 0) {
        await updateProductStock(
          item.productId,
          item.productVariantId,
          item.batchId,
          item.returnQuantity,
          "add",
          resolvedDeviceId,
        )

        // Write inventory stock history
        try {
          await sql`
            INSERT INTO product_stock_history (
              product_id, product_variant_id, batch_id, quantity,
              type, reference_id, reference_type, notes, created_by, device_id, created_at
            ) VALUES (
              ${item.productId}, ${item.productVariantId}, ${item.batchId}, ${item.returnQuantity},
              'adjustment', ${returnId}, 'sale_return', ${`Sale Return #${returnNumber} (Sale #${saleId})`}, ${resolvedUserId || resolvedDeviceId}, ${resolvedDeviceId}, NOW()
            )
          `
        } catch (histErr) {
          console.error("Failed writing stock history for return:", histErr)
        }
      }
    }

    // 6. Check if sale is fully returned
    const remainingItemsCheck = await sql`
      SELECT 
        SUM(si.quantity) as total_sold,
        SUM(COALESCE(si.returned_quantity, 0)) as total_returned
      FROM sale_items si
      WHERE si.sale_id = ${saleId}
    `

    let isFullyReturned = false
    if (remainingItemsCheck.length > 0) {
      const soldSum = Number(remainingItemsCheck[0].total_sold || 0)
      const retSum = Number(remainingItemsCheck[0].total_returned || 0)
      if (soldSum > 0 && retSum >= soldSum) {
        isFullyReturned = true
      }
    }

    if (isFullyReturned) {
      await sql`
        UPDATE sales
        SET status = 'Returned', updated_at = NOW()
        WHERE id = ${saleId}
      `
    }

    // 7. Record Financial Transaction
    try {
      const description = `Sale Return #${returnNumber} for Sale #${saleId} - Refunded ₹${parsedRefundAmount.toFixed(2)} (Returned Product Value: ₹${totalCalculatedReturnValue.toFixed(2)})`

      await sql`
        INSERT INTO financial_transactions (
          transaction_name, transaction_type, reference_type, reference_id,
          amount, received_amount, cost_amount, debit_amount, credit_amount,
          status, payment_method, description, notes, device_id, company_id, created_by, transaction_date
        ) VALUES (
          'Sale Return', 'sale_return', 'sale', ${saleId},
          ${parsedRefundAmount}, ${parsedRefundAmount}, ${-totalCogsRestored},
          ${parsedRefundAmount}, 0, 'Completed', ${paymentMethod},
          ${description}, ${reason || null}, ${resolvedDeviceId}, 1,
          ${resolvedUserId || resolvedDeviceId}, NOW()
        )
      `
    } catch (finErr) {
      console.error("Failed recording financial transaction for sale return:", finErr)
    }

    revalidatePath("/sales")
    revalidatePath("/dashboard")

    return {
      success: true,
      message: `Return #${returnNumber} processed successfully. ${totalReturnedQtyCount} item(s) returned to stock.`,
      returnId,
      returnNumber,
    }
  } catch (error) {
    console.error("Error processing sale return:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to process sale return",
    }
  }
}
