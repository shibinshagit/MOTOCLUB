"use server"

import { sql } from "@/lib/db"
import { revalidatePath, unstable_noStore as noStore } from "next/cache"
import { resolveStaffSessionContext } from "@/lib/staff-restrictions-server"
import { updateProductStock } from "@/app/actions/sale-actions"
import { getDeviceCompanyId } from "@/lib/device-company"

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
  /** Customer Refund Amount: what the business owes the customer for this return. */
  refundAmount: number
  /**
   * Extra Amount Given: additional money handed to the customer outside the normal refund.
   * Booked separately as a Petty Cash Money Out; it is never part of the return value or the refund.
   */
  extraAmount?: number
  /** Client-generated id so a double click / retry can never book the same return or extra payment twice. */
  requestId?: string
  refundPaymentMethod?: string
  reason?: string
  deviceId?: number
  userId?: number
}

class SaleReturnError extends Error {}

// All money maths is done in whole paise so cents never drift
const toPaise = (v: unknown) => Math.round((Number(v) || 0) * 100)
const fromPaise = (p: number) => p / 100
const inr = (p: number) => `₹${fromPaise(p).toFixed(2)}`

/**
 * Processes a partial or full sale return atomically.
 *
 * Separate amounts:
 *  - calculated return value: value of the returned quantities (from the sale lines)
 *  - refund amount: the normal refund for this return, booked in the existing sale_return accounting row
 *  - extra amount: additional money given to the customer, booked as its own Petty Cash Money Out
 *  - the customer receives refund + extra (derived, never stored)
 *
 * Refund cap: a full return (every remaining quantity comes back) may refund up to what the customer
 * actually paid minus earlier refunds; a partial return is also capped by the returned product value.
 */
export async function processSaleReturn(input: ProcessSaleReturnInput) {
  noStore()
  try {
    await ensureReturnTablesExist()

    const { saleId, items: returnItemInputs, refundPaymentMethod, reason } = input

    if (!saleId || !Array.isArray(returnItemInputs)) {
      return { success: false, message: "Invalid request parameters" }
    }
    const requestId = typeof input.requestId === "string" ? input.requestId.trim().slice(0, 64) : ""
    const requestTag = requestId ? ` [req:${requestId}]` : ""

    const resolvedDeviceId = input.deviceId || 1
    const context = await resolveStaffSessionContext(resolvedDeviceId)
    const resolvedUserId = input.userId || context?.id || null
    const companyId = await getDeviceCompanyId(resolvedDeviceId)

    const result = await sql.begin(async (tx: any) => {
      // Lock the sale so two returns on the same sale cannot run at once
      const saleRows = await tx`
        SELECT s.id, s.customer_id, s.status, s.payment_method, s.total_amount, s.received_amount, s.device_id,
               COALESCE(NULLIF(s.customer_name_override, ''), c.name) AS customer_name
        FROM sales s
        LEFT JOIN customers c ON c.id = s.customer_id
        WHERE s.id = ${saleId}
        FOR UPDATE OF s
      `
      if (saleRows.length === 0) throw new SaleReturnError("Sale not found")
      const sale = saleRows[0]
      if (String(sale.status).toLowerCase() === "cancelled") {
        throw new SaleReturnError("Cannot process return for a cancelled sale")
      }

      // Same request already processed (double click / retry): return that result instead of booking again
      if (requestId) {
        const done = await tx`
          SELECT sr.id, sr.return_number FROM sale_returns sr
          WHERE sr.sale_id = ${saleId} AND sr.reason LIKE ${"%[req:" + requestId + "]"}
          LIMIT 1
        `
        if (done.length > 0) {
          return { returnId: done[0].id, returnNumber: done[0].return_number, totalReturnedQtyCount: 0, duplicate: true }
        }
      }

      const dbSaleItems = await tx`
        SELECT
          si.id, si.product_id, si.product_variant_id, si.batch_id,
          si.quantity AS sold_quantity,
          COALESCE(si.returned_quantity, 0) AS existing_returned_qty,
          COALESCE((SELECT SUM(sri.returned_quantity) FROM sale_return_items sri WHERE sri.sale_item_id = si.id), 0) AS calc_returned_qty,
          si.price,
          COALESCE(si.cost, 0) AS cost,
          p.name AS product_name
        FROM sale_items si
        LEFT JOIN products p ON si.product_id = p.id
        WHERE si.sale_id = ${saleId}
      `
      if (dbSaleItems.length === 0) throw new SaleReturnError("No line items found for this sale")

      // Recalculate everything on the server; the browser's numbers are not trusted
      let totalValuePaise = 0
      let totalCogsPaise = 0
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
      }> = []
      const returningNow = new Map<number, number>()

      for (const inputItem of returnItemInputs) {
        const returnQty = Number(inputItem.returnQuantity) || 0
        if (returnQty <= 0) continue
        if (!Number.isInteger(returnQty)) throw new SaleReturnError("Return quantity must be a whole number.")

        const matched = dbSaleItems.find((i: any) => Number(i.id) === Number(inputItem.saleItemId))
        if (!matched) throw new SaleReturnError(`Sale item ID #${inputItem.saleItemId} not found in this sale`)

        const alreadyInThisRequest = returningNow.get(Number(matched.id)) || 0
        const soldQty = Number(matched.sold_quantity || 0)
        const alreadyReturned = Math.max(Number(matched.existing_returned_qty || 0), Number(matched.calc_returned_qty || 0))
        const remainingReturnable = Math.max(0, soldQty - alreadyReturned - alreadyInThisRequest)
        if (returnQty > remainingReturnable) {
          throw new SaleReturnError(
            `Cannot return ${returnQty} units for ${matched.product_name || "product"}. Max returnable quantity is ${remainingReturnable}.`,
          )
        }
        returningNow.set(Number(matched.id), alreadyInThisRequest + returnQty)

        const unitPrice = Number(matched.price) || 0
        const unitCost = Number(matched.cost) || 0
        const linePaise = returnQty * toPaise(unitPrice)
        totalValuePaise += linePaise
        totalCogsPaise += returnQty * toPaise(unitCost)
        totalReturnedQtyCount += returnQty

        itemsToReturn.push({
          saleItemId: Number(matched.id),
          productId: Number(matched.product_id),
          productVariantId: matched.product_variant_id ? Number(matched.product_variant_id) : null,
          batchId: matched.batch_id ? Number(matched.batch_id) : null,
          returnQuantity: returnQty,
          unitPrice,
          unitCost,
          calculatedValue: fromPaise(linePaise),
        })
      }

      const refundPaise = toPaise(input.refundAmount)
      const extraPaise = toPaise(input.extraAmount)
      if (refundPaise < 0) throw new SaleReturnError("Refund amount cannot be negative.")
      if (extraPaise < 0) throw new SaleReturnError("Extra amount cannot be negative.")

      const noItems = itemsToReturn.length === 0 || totalReturnedQtyCount <= 0
      if (noItems) {
        // Without returned items only a standalone extra payment is possible (no refund, nothing restocked)
        if (refundPaise > 0) {
          throw new SaleReturnError("Please select at least one item with a valid return quantity to refund it.")
        }
        if (extraPaise <= 0) {
          throw new SaleReturnError("Please select an item to return or enter an extra amount.")
        }
      }

      // Full return = every remaining quantity of every line comes back with this return
      const fullReturn = !noItems && dbSaleItems.every((i: any) => {
        const sold = Number(i.sold_quantity || 0)
        const done = Math.max(Number(i.existing_returned_qty || 0), Number(i.calc_returned_qty || 0))
        return done + (returningNow.get(Number(i.id)) || 0) >= sold
      })

      // What the customer actually paid, and what has already been refunded on this sale
      const totalPaise = toPaise(sale.total_amount)
      const receivedPaise = toPaise(sale.received_amount)
      const paidPaise =
        receivedPaise > 0 ? receivedPaise : String(sale.status).toLowerCase() === "completed" ? totalPaise : 0
      const prior = await tx`SELECT COALESCE(SUM(refund_amount), 0) AS refunded FROM sale_returns WHERE sale_id = ${saleId}`
      const priorRefundedPaise = toPaise(prior[0]?.refunded)
      const refundablePaise = Math.max(0, paidPaise - priorRefundedPaise)

      if (fullReturn) {
        if (refundPaise > refundablePaise) {
          throw new SaleReturnError(
            `Refund amount (${inr(refundPaise)}) cannot exceed the amount still refundable on this sale (${inr(refundablePaise)}: customer paid ${inr(paidPaise)}, already refunded ${inr(priorRefundedPaise)}).`,
          )
        }
      } else {
        if (refundPaise > totalValuePaise) {
          throw new SaleReturnError(
            `Refund amount (${inr(refundPaise)}) cannot exceed the returned product value (${inr(totalValuePaise)}) for a partial return.`,
          )
        }
        if (refundPaise > refundablePaise) {
          throw new SaleReturnError(
            `Refund amount (${inr(refundPaise)}) cannot exceed the amount still refundable on this sale (${inr(refundablePaise)}).`,
          )
        }
      }
      const returnNumber = `RET-${saleId}-${Date.now().toString().slice(-4)}`
      const paymentMethod = refundPaymentMethod || sale.payment_method || "Cash"

      const returnRecord = await tx`
        INSERT INTO sale_returns (
          sale_id, device_id, customer_id, return_number,
          calculated_return_value, refund_amount, refund_payment_method,
          reason, status, created_by, created_at
        ) VALUES (
          ${saleId}, ${resolvedDeviceId}, ${sale.customer_id || null}, ${returnNumber},
          ${fromPaise(totalValuePaise)}, ${fromPaise(refundPaise)}, ${paymentMethod},
          ${(reason || "Sale Return") + requestTag}, 'Completed', ${resolvedUserId}, NOW()
        )
        RETURNING id
      `
      const returnId = returnRecord[0].id

      for (const item of itemsToReturn) {
        await tx`
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
        await tx`
          UPDATE sale_items
          SET returned_quantity = COALESCE(returned_quantity, 0) + ${item.returnQuantity}
          WHERE id = ${item.saleItemId}
        `

        if (item.productId > 0) {
          // Restore inventory to the original source (variant / batch / device), inside this transaction
          const stock = await updateProductStock(
            item.productId,
            item.productVariantId,
            item.batchId,
            item.returnQuantity,
            "add",
            resolvedDeviceId,
            tx,
          )
          if (!stock?.success) throw new SaleReturnError(stock?.message || "Failed to restore stock")

          await tx`
            INSERT INTO product_stock_history (
              product_id, product_variant_id, batch_id, quantity,
              type, reference_id, reference_type, notes, created_by, device_id, created_at
            ) VALUES (
              ${item.productId}, ${item.productVariantId}, ${item.batchId}, ${item.returnQuantity},
              'adjustment', ${returnId}, 'sale_return', ${`Sale Return #${returnNumber} (Sale #${saleId})`}, ${resolvedUserId || resolvedDeviceId}, ${resolvedDeviceId}, NOW()
            )
          `
        }
      }

      if (fullReturn) {
        await tx`UPDATE sales SET status = 'Returned', updated_at = NOW() WHERE id = ${saleId}`
      }

      const customerLabel = sale.customer_name ? ` - ${sale.customer_name}` : ""

      // Normal refund: the existing sale_return accounting row (amount and debit = refund; also carries
      // the COGS restored). Not created for an extra-only payment.
      if (!noItems) {
        const description =
          `Sale Return Refund - Sale #${saleId}${customerLabel} (Return ${returnNumber}) - ` +
          `Refunded ${inr(refundPaise)} (Returned Product Value: ${inr(totalValuePaise)})`
        await tx`
          INSERT INTO financial_transactions (
            transaction_name, transaction_type, reference_type, reference_id,
            amount, received_amount, cost_amount, debit_amount, credit_amount,
            status, payment_method, description, notes, device_id, company_id, created_by, transaction_date
          ) VALUES (
            'Sale Return', 'sale_return', 'sale', ${saleId},
            ${fromPaise(refundPaise)}, ${fromPaise(refundPaise)}, ${-fromPaise(totalCogsPaise)},
            ${fromPaise(refundPaise)}, 0, 'Completed', ${paymentMethod},
            ${description}, ${(reason || "") + requestTag || null}, ${resolvedDeviceId}, ${companyId},
            ${resolvedUserId || resolvedDeviceId}, NOW()
          )
        `
      }

      // Extra amount: its own Petty Cash Money Out. Petty Cash lists rows with reference_type 'manual';
      // the type is kept distinct ('sale_return_extra') so the P&L operating-expense query, which only
      // counts type 'manual', does not treat it as an expense. Money Out totals read the debit.
      if (extraPaise > 0) {
        const extraDescription =
          `Extra Amount Given - Sale Return ${returnNumber} (Sale #${saleId})${customerLabel}` +
          (reason ? ` - ${reason}` : "")
        await tx`
          INSERT INTO financial_transactions (
            transaction_name, transaction_type, reference_type, reference_id,
            amount, received_amount, cost_amount, debit_amount, credit_amount,
            status, payment_method, description, category_name, notes, device_id, company_id, created_by, transaction_date
          ) VALUES (
            'Extra Amount Given', 'sale_return_extra', 'manual', ${returnId},
            ${fromPaise(extraPaise)}, ${fromPaise(extraPaise)}, 0,
            ${fromPaise(extraPaise)}, 0, 'Completed', 'Cash',
            ${extraDescription}, 'Sale Return Extra', ${`Return ${returnNumber}${requestTag}`}, ${resolvedDeviceId}, ${companyId},
            ${resolvedUserId || resolvedDeviceId}, NOW()
          )
        `
      }

      return { returnId, returnNumber, totalReturnedQtyCount, duplicate: false }
    })

    revalidatePath("/sales")
    revalidatePath("/dashboard")

    return {
      success: true,
      message: result.duplicate
        ? `Return #${result.returnNumber} was already processed.`
        : `Return #${result.returnNumber} processed successfully. ${result.totalReturnedQtyCount} item(s) returned to stock.`,
      returnId: result.returnId,
      returnNumber: result.returnNumber,
    }
  } catch (error) {
    if (!(error instanceof SaleReturnError)) console.error("Error processing sale return:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to process sale return",
    }
  }
}
